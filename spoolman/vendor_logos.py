"""Helpers for vendor logo lookup and local print-logo conversion."""

from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen
from uuid import uuid4

from PIL import Image, ImageOps, UnidentifiedImageError

from spoolman import env


def get_runtime_vendor_logo_dir() -> Path:
    """Return the runtime vendor logo directory, creating it if needed."""
    target_dir = env.get_data_dir() / "vendor-logos"
    target_dir.mkdir(parents=True, exist_ok=True)
    return target_dir


def get_bundled_vendor_logo_dir() -> Path:
    """Return the bundled vendor logo directory from the built client assets."""
    project_root = Path(__file__).resolve().parent.parent
    return project_root / "client" / "dist" / "vendor-logos"


def resolve_vendor_logo_asset(path: str) -> Path | None:
    """Resolve logo asset path from runtime pack first, then bundled pack."""
    safe_path = path.lstrip("/")
    if not safe_path or ".." in Path(safe_path).parts:
        return None

    for base_dir in (get_runtime_vendor_logo_dir(), get_bundled_vendor_logo_dir()):
        candidate = (base_dir / safe_path).resolve()
        try:
            candidate.relative_to(base_dir.resolve())
        except ValueError:
            continue
        if candidate.is_file():
            return candidate
    return None


def slugify_vendor_name(name: str | None) -> str:
    """Create a filesystem-safe slug from vendor name."""
    if not name:
        return ""
    normalized = name.strip().lower()
    normalized = re.sub(r"[^a-z0-9]+", "-", normalized)
    return normalized.strip("-")


def _read_manifest(path: Path) -> dict[str, object] | None:
    if not path.is_file():
        return None
    try:
        with path.open(encoding="utf-8") as file:
            data = json.load(file)
    except (OSError, json.JSONDecodeError):
        return None
    return data if isinstance(data, dict) else None


def _read_bundled_manifest() -> dict[str, object] | None:
    return _read_manifest(get_bundled_vendor_logo_dir() / "manifest.json")


def _read_local_manifest() -> dict[str, object] | None:
    manifest_path = get_runtime_vendor_logo_dir() / "manifest.json"
    if not manifest_path.is_file():
        return None
    try:
        with manifest_path.open(encoding="utf-8") as file:
            data = json.load(file)
        if isinstance(data, dict):
            return data
    except (OSError, json.JSONDecodeError):
        return None
    return None


def _normalize_logo_asset_path(logo_url: str) -> str:
    """Normalize local or app-served logo URLs to runtime/bundled manifest-relative asset paths."""
    value = logo_url.strip()
    if value == "":
        return ""

    parsed = urlparse(value)
    path = parsed.path if parsed.scheme in {"http", "https"} else value
    base_path = env.get_base_path().rstrip("/")
    if base_path and path.startswith(base_path + "/"):
        path = path[len(base_path) + 1 :]

    return path.lstrip("/").removeprefix("vendor-logos/")


def _load_logo_source_bytes(logo_url: str) -> bytes:
    value = logo_url.strip()
    if value == "":
        raise ValueError("Logo URL is required.")

    if value.startswith(("http://", "https://")):
        request = Request(value, headers={"User-Agent": "spoolman-vendor-logo-convert"})  # noqa: S310
        with urlopen(request, timeout=60) as response:  # noqa: S310
            return response.read()

    local_asset = _normalize_logo_asset_path(value)
    if local_asset == "":
        raise ValueError("Logo URL is required.")

    resolved = resolve_vendor_logo_asset(local_asset)
    if resolved is None:
        raise RuntimeError("Logo asset could not be resolved from local vendor logo paths.")
    return resolved.read_bytes()


def _update_runtime_manifest_with_generated_print_logo(print_logo_url: str) -> None:
    """Persist generated print logos so client-side suggestions see new runtime assets immediately."""
    runtime_dir = get_runtime_vendor_logo_dir()
    runtime_manifest_path = runtime_dir / "manifest.json"

    manifest = _read_local_manifest() or _read_bundled_manifest() or {}
    web_files = [value for value in manifest.get("web_files", []) if isinstance(value, str)]
    print_files = [value for value in manifest.get("print_files", []) if isinstance(value, str)]

    if print_logo_url not in print_files:
        print_files.append(print_logo_url)

    runtime_manifest: dict[str, object] = {
        "source": "local",
        "updated_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "web_logo_count": len(web_files),
        "print_logo_count": len(print_files),
        "web_files": sorted(set(web_files)),
        "print_files": sorted(set(print_files)),
        "manifest_signature": hashlib.sha256(
            "\n".join(sorted(set(web_files + print_files))).encode("utf-8")
        ).hexdigest(),
    }

    with runtime_manifest_path.open("w", encoding="utf-8") as file:
        json.dump(runtime_manifest, file, indent=2)


_MONOCHROME_THRESHOLD = 180


def convert_web_logo_to_print_logo(logo_url: str, vendor_name: str | None = None) -> str:
    """Convert a web logo to grayscale PNG and store it in runtime print logo directory."""
    source_bytes = _load_logo_source_bytes(logo_url)

    try:
        with Image.open(BytesIO(source_bytes)) as source_image:
            rgba = source_image.convert("RGBA")
    except UnidentifiedImageError as exc:
        raise RuntimeError("Logo image format is not supported.") from exc

    # Preserve transparency from the source asset while forcing the printable pixels to pure black or white.
    alpha = rgba.getchannel("A")
    grayscale = ImageOps.grayscale(rgba.convert("RGB"))
    monochrome = grayscale.point(lambda value: 0 if value < _MONOCHROME_THRESHOLD else 255, mode="L")
    converted = Image.merge("RGBA", (monochrome, monochrome, monochrome, alpha))

    parsed_logo_path = urlparse(logo_url).path if logo_url.startswith(("http://", "https://")) else logo_url
    source_stem = Path(parsed_logo_path).stem.replace("-web", "")
    slug = slugify_vendor_name(vendor_name) or slugify_vendor_name(source_stem) or f"vendor-{uuid4().hex[:8]}"
    source_hash = hashlib.sha1(source_bytes).hexdigest()[:10]  # noqa: S324

    runtime_dir = get_runtime_vendor_logo_dir()
    print_dir = runtime_dir / "print"
    print_dir.mkdir(parents=True, exist_ok=True)

    filename = f"{slug}-{source_hash}-print-auto.png"
    output_path = print_dir / filename
    converted.save(output_path, format="PNG", optimize=True)

    print_logo_url = f"/vendor-logos/print/{filename}"
    _update_runtime_manifest_with_generated_print_logo(print_logo_url)
    return print_logo_url

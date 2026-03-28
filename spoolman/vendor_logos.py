"""Helpers for vendor logo pack lookup and GitHub syncing."""

# ruff: noqa: C901, D103, E501, FBT001, FBT002, PLR0912, PLR0915, TRY004

from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import tarfile
import tempfile
import zipfile
from dataclasses import dataclass
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from urllib.parse import quote, urlparse
from urllib.request import Request, urlopen
from uuid import uuid4

from PIL import Image, ImageOps, UnidentifiedImageError

from spoolman import env

DEFAULT_SOURCE_REPO = "MarksMakerSpace/filament-profiles"
DEFAULT_SOURCE_REF = "main"
SUPPORTED_IMPORTED_WEB_EXTENSION_LIST = (".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp")
SUPPORTED_IMPORTED_WEB_EXTENSIONS = set(SUPPORTED_IMPORTED_WEB_EXTENSION_LIST)
SUPPORTED_LOGO_FORMATS_TEXT = ".png, .jpg/.jpeg, .webp, .gif, .bmp"


@dataclass
class VendorLogoRemoteState:
    source_repo: str
    source_ref: str
    source_url: str
    signature: str
    web_logo_count: int
    print_logo_count: int


@dataclass
class VendorLogoSyncResult:
    source_repo: str
    source_ref: str
    source_url: str
    updated: bool
    message: str
    web_logo_count: int
    print_logo_count: int
    local_signature: str | None
    remote_signature: str
    synced_at_utc: str | None


@dataclass
class VendorLogoImportResult:
    source_repo: str
    source_ref: str
    source_url: str
    message: str
    web_logo_count: int
    print_logo_count: int
    generated_print_logo_count: int
    synced_at_utc: str | None


@dataclass
class VendorLogoUploadResult:
    logo_url: str
    target: str
    message: str
    web_logo_count: int
    print_logo_count: int
    synced_at_utc: str | None


def get_logo_source_repo() -> str:
    return os.getenv("SPOOLMAN_VENDOR_LOGO_SOURCE_REPO", DEFAULT_SOURCE_REPO)


def get_logo_source_ref() -> str:
    return os.getenv("SPOOLMAN_VENDOR_LOGO_SOURCE_REF", DEFAULT_SOURCE_REF)


def get_logo_source_url(source_repo: str, source_ref: str) -> str:
    return f"https://github.com/{source_repo}/tree/{source_ref}"


def get_runtime_vendor_logo_dir() -> Path:
    target_dir = env.get_data_dir() / "vendor-logos"
    target_dir.mkdir(parents=True, exist_ok=True)
    return target_dir


def get_bundled_vendor_logo_dir() -> Path:
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


def _normalize_logo_asset_path(logo_url: str) -> str:
    """Normalize local or app-served logo URLs to manifest-relative asset paths."""
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
    _update_runtime_manifest_with_added_logo(print_logo_url, "print", is_custom=True)


def _update_runtime_manifest_with_added_logo(
    logo_url: str, target_kind: str, *, is_custom: bool = False
) -> dict[str, object]:
    if target_kind not in {"web", "print"}:
        raise ValueError("Logo target must be either 'web' or 'print'.")

    runtime_dir = get_runtime_vendor_logo_dir()
    runtime_manifest_path = runtime_dir / "manifest.json"

    manifest = _read_local_manifest() or _read_bundled_manifest() or {}

    web_files = [value for value in manifest.get("web_files", []) if isinstance(value, str)]
    print_files = [value for value in manifest.get("print_files", []) if isinstance(value, str)]
    custom_web_files = [value for value in manifest.get("custom_web_files", []) if isinstance(value, str)]
    custom_print_files = [value for value in manifest.get("custom_print_files", []) if isinstance(value, str)]
    target_files = web_files if target_kind == "web" else print_files
    target_custom_files = custom_web_files if target_kind == "web" else custom_print_files

    if logo_url not in target_files:
        target_files.append(logo_url)
    if is_custom and logo_url not in target_custom_files:
        target_custom_files.append(logo_url)

    now_utc = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    runtime_manifest: dict[str, object] = {
        "source_repo": manifest.get("source_repo") if isinstance(manifest.get("source_repo"), str) else "local",
        "source_ref": manifest.get("source_ref") if isinstance(manifest.get("source_ref"), str) else "local",
        "source_url": manifest.get("source_url") if isinstance(manifest.get("source_url"), str) else "local",
        "source_tree_signature": (
            manifest.get("source_tree_signature")
            if isinstance(manifest.get("source_tree_signature"), str)
            else hashlib.sha256("\n".join(sorted(web_files + print_files)).encode("utf-8")).hexdigest()
        ),
        "synced_at_utc": now_utc,
        "web_logo_count": len(web_files),
        "print_logo_count": len(print_files),
        "web_files": sorted(set(web_files)),
        "print_files": sorted(set(print_files)),
        "custom_web_files": sorted(set(custom_web_files)),
        "custom_print_files": sorted(set(custom_print_files)),
    }

    with runtime_manifest_path.open("w", encoding="utf-8") as file:
        json.dump(runtime_manifest, file, indent=2)
    return runtime_manifest


def _sanitize_upload_stem(stem: str) -> str:
    normalized = slugify_vendor_name(stem)
    if normalized != "":
        return normalized
    fallback = slugify_vendor_name(f"upload-{uuid4().hex[:8]}")
    return fallback if fallback != "" else f"upload-{uuid4().hex[:8]}"


def _unsupported_image_format_error(source_name: str | None = None) -> RuntimeError:
    # Include the member filename when available so ZIP/import failures point directly to the
    # bad asset instead of forcing users to binary-search the archive contents.
    if source_name is None or source_name == "":
        return RuntimeError(f"Logo image format is not supported. Supported formats: {SUPPORTED_LOGO_FORMATS_TEXT}.")
    return RuntimeError(
        f"Logo image format is not supported for '{source_name}'. Supported formats: {SUPPORTED_LOGO_FORMATS_TEXT}."
    )


def _convert_source_bytes_to_rgba_png(source_bytes: bytes, source_name: str | None = None) -> bytes:
    try:
        with Image.open(BytesIO(source_bytes)) as source_image:
            rgba = source_image.convert("RGBA")
    except (UnidentifiedImageError, OSError, ValueError, SyntaxError) as exc:
        raise _unsupported_image_format_error(source_name) from exc

    output = BytesIO()
    rgba.save(output, format="PNG", optimize=True)
    return output.getvalue()


def _validate_image_bytes(source_bytes: bytes, source_name: str | None = None) -> None:
    try:
        with Image.open(BytesIO(source_bytes)) as source_image:
            source_image.verify()
    except (UnidentifiedImageError, OSError, ValueError, SyntaxError) as exc:
        raise _unsupported_image_format_error(source_name) from exc


_MONOCHROME_THRESHOLD = 180


def _convert_source_bytes_to_monochrome_png(source_bytes: bytes, source_name: str | None = None) -> bytes:
    try:
        with Image.open(BytesIO(source_bytes)) as source_image:
            rgba = source_image.convert("RGBA")
    except (UnidentifiedImageError, OSError, ValueError, SyntaxError) as exc:
        raise _unsupported_image_format_error(source_name) from exc

    # Preserve transparency from the source asset while forcing printable pixels to pure black or white.
    alpha = rgba.getchannel("A")
    grayscale = ImageOps.grayscale(rgba.convert("RGB"))
    # Print logos are high-contrast: darker pixels become black, lighter pixels become white, and
    # original transparency is preserved.
    monochrome = grayscale.point(lambda value: 0 if value < _MONOCHROME_THRESHOLD else 255, mode="L")
    converted = Image.merge("RGBA", (monochrome, monochrome, monochrome, alpha))

    output = BytesIO()
    converted.save(output, format="PNG", optimize=True)
    return output.getvalue()


def _build_generated_print_logo_filename(source_bytes: bytes, logo_name: str, vendor_name: str | None = None) -> str:
    source_stem = Path(logo_name).stem.replace("-web", "")
    slug = slugify_vendor_name(vendor_name) or slugify_vendor_name(source_stem) or f"vendor-{uuid4().hex[:8]}"
    source_hash = hashlib.sha1(source_bytes).hexdigest()[:10]  # noqa: S324
    return f"{slug}-{source_hash}-print-auto.png"


def convert_web_logo_to_print_logo(logo_url: str, vendor_name: str | None = None) -> str:
    """Convert a web logo to grayscale PNG and store it in runtime print logo directory."""
    source_bytes = _load_logo_source_bytes(logo_url)

    parsed_logo_path = urlparse(logo_url).path if logo_url.startswith(("http://", "https://")) else logo_url

    runtime_dir = get_runtime_vendor_logo_dir()
    print_dir = runtime_dir / "print"
    print_dir.mkdir(parents=True, exist_ok=True)

    # The output filename depends on both vendor identity and source bytes so regenerated print logos stay stable.
    filename = _build_generated_print_logo_filename(source_bytes, Path(parsed_logo_path).name, vendor_name)
    output_path = print_dir / filename
    output_path.write_bytes(_convert_source_bytes_to_monochrome_png(source_bytes, Path(parsed_logo_path).name))

    print_logo_url = f"/vendor-logos/print/{filename}"
    _update_runtime_manifest_with_generated_print_logo(print_logo_url)
    return print_logo_url


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


def _download_json(url: str) -> dict[str, object]:
    request = Request(url, headers={"User-Agent": "spoolman-vendor-logo-sync"})  # noqa: S310
    with urlopen(request, timeout=30) as response:  # noqa: S310
        return json.loads(response.read().decode("utf-8"))


def _get_remote_logo_state(source_repo: str, source_ref: str) -> VendorLogoRemoteState:
    encoded_ref = quote(source_ref, safe="")
    url = f"https://api.github.com/repos/{source_repo}/git/trees/{encoded_ref}?recursive=1"
    payload = _download_json(url)

    tree = payload.get("tree")
    if not isinstance(tree, list):
        raise RuntimeError("GitHub tree response is missing file list.")

    web_entries: list[tuple[str, str]] = []
    print_entries: list[tuple[str, str]] = []

    # The source repo/ref can vary, but the pack contract is fixed: web/ for color logos and logos/ for print logos.
    for item in tree:
        if not isinstance(item, dict):
            continue
        path = item.get("path")
        sha = item.get("sha")
        item_type = item.get("type")
        if not isinstance(path, str) or not isinstance(sha, str) or item_type != "blob":
            continue
        if not path.lower().endswith(".png"):
            continue
        if path.startswith("web/"):
            web_entries.append((path, sha))
        elif path.startswith("logos/"):
            print_entries.append((path, sha))

    if len(web_entries) == 0 and len(print_entries) == 0:
        raise RuntimeError("No logo PNG files found in GitHub repository tree.")

    # Compare tree signatures before downloading archives so repeated sync checks stay cheap when the remote pack has not changed.
    signature_source = "\n".join(
        sorted(
            [f"web:{path}:{sha}" for path, sha in web_entries] + [f"print:{path}:{sha}" for path, sha in print_entries]
        )
    )
    signature = hashlib.sha256(signature_source.encode("utf-8")).hexdigest()

    return VendorLogoRemoteState(
        source_repo=source_repo,
        source_ref=source_ref,
        source_url=get_logo_source_url(source_repo, source_ref),
        signature=signature,
        web_logo_count=len(web_entries),
        print_logo_count=len(print_entries),
    )


def _find_first_subdir(parent: Path, directory_name: str, max_depth: int = 4) -> Path | None:
    for path in parent.rglob(directory_name):
        if not path.is_dir():
            continue
        depth = len(path.relative_to(parent).parts)
        if depth <= max_depth:
            return path
    return None


def _write_manifest(
    target_dir: Path,
    source_repo: str,
    source_ref: str,
    source_url: str,
    signature: str,
    web_files: list[str],
    print_files: list[str],
    custom_web_files: list[str] | None = None,
    custom_print_files: list[str] | None = None,
) -> dict[str, object]:
    now_utc = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    manifest = {
        "source_repo": source_repo,
        "source_ref": source_ref,
        "source_url": source_url,
        "source_tree_signature": signature,
        "synced_at_utc": now_utc,
        "web_logo_count": len(web_files),
        "print_logo_count": len(print_files),
        "web_files": sorted(web_files),
        "print_files": sorted(print_files),
        "custom_web_files": sorted(set(custom_web_files or [])),
        "custom_print_files": sorted(set(custom_print_files or [])),
    }
    with (target_dir / "manifest.json").open("w", encoding="utf-8") as file:
        json.dump(manifest, file, indent=2)
    return manifest


def _replace_runtime_logo_dir(staged_target_dir: Path) -> None:
    target_dir = get_runtime_vendor_logo_dir()
    backup_dir = target_dir.parent / f".vendor-logos-backup-{uuid4().hex}"
    had_existing_target = target_dir.exists()
    try:
        # Swap the whole directory atomically so partial downloads/imports never leak into the served runtime pack.
        if had_existing_target:
            target_dir.replace(backup_dir)
        staged_target_dir.replace(target_dir)
    except Exception:
        if staged_target_dir.exists():
            shutil.rmtree(staged_target_dir, ignore_errors=True)
        if had_existing_target and backup_dir.exists() and not target_dir.exists():
            backup_dir.replace(target_dir)
        raise
    else:
        if backup_dir.exists():
            shutil.rmtree(backup_dir, ignore_errors=True)


def _copy_preserved_custom_runtime_files(
    staged_target_dir: Path,
    web_files: list[str],
    print_files: list[str],
) -> tuple[list[str], list[str]]:
    # GitHub sync replaces the shared pack snapshot, but user-created uploads/conversions need to survive that refresh.
    runtime_dir = get_runtime_vendor_logo_dir()
    local_manifest = _read_local_manifest() or {}

    custom_web_files = [value for value in local_manifest.get("custom_web_files", []) if isinstance(value, str)]
    custom_print_files = [value for value in local_manifest.get("custom_print_files", []) if isinstance(value, str)]

    def copy_manifest_files(entries: list[str], target_files: list[str]) -> list[str]:
        copied_entries = list(entries)
        for logo_url in entries:
            if logo_url in target_files:
                continue
            normalized = _normalize_logo_asset_path(logo_url)
            if normalized == "":
                continue
            source_path = (runtime_dir / normalized).resolve()
            try:
                source_path.relative_to(runtime_dir.resolve())
            except ValueError:
                continue
            if not source_path.is_file():
                continue
            destination_path = staged_target_dir / normalized
            destination_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source_path, destination_path)
            target_files.append(logo_url)
        return copied_entries

    preserved_custom_web_files = copy_manifest_files(custom_web_files, web_files)
    preserved_custom_print_files = copy_manifest_files(custom_print_files, print_files)
    return preserved_custom_web_files, preserved_custom_print_files


def _copy_existing_runtime_logo_files(staged_target_dir: Path) -> tuple[list[str], list[str]]:
    """Carry the current runtime library into a staged directory before appending more files."""
    runtime_dir = get_runtime_vendor_logo_dir()
    copied_web_files: list[str] = []
    copied_print_files: list[str] = []

    def copy_kind(kind: str, target_files: list[str]) -> None:
        source_dir = runtime_dir / kind
        if not source_dir.is_dir():
            return

        destination_dir = staged_target_dir / kind
        for source_path in sorted(source_dir.rglob("*")):
            if not source_path.is_file():
                continue
            relative_path = source_path.relative_to(source_dir)
            destination_path = destination_dir / relative_path
            destination_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source_path, destination_path)
            target_files.append(f"/vendor-logos/{kind}/{relative_path.as_posix()}")

    copy_kind("web", copied_web_files)
    copy_kind("print", copied_print_files)
    return copied_web_files, copied_print_files


def _dedupe_filename(existing: set[str], filename: str) -> str:
    candidate = filename
    stem = Path(filename).stem
    suffix = Path(filename).suffix
    index = 2
    while candidate in existing:
        candidate = f"{stem}-{index}{suffix}"
        index += 1
    existing.add(candidate)
    return candidate


def _get_archive_url(source_repo: str, source_ref: str) -> str:
    encoded_ref = quote(source_ref, safe="")
    return f"https://codeload.github.com/{source_repo}/tar.gz/{encoded_ref}"


def _download_and_write_logo_pack(remote_state: VendorLogoRemoteState) -> dict[str, object]:
    target_dir = get_runtime_vendor_logo_dir()
    staged_target_dir = Path(tempfile.mkdtemp(prefix=".vendor-logos-stage-", dir=target_dir.parent))

    try:
        web_dir = staged_target_dir / "web"
        print_dir = staged_target_dir / "print"
        web_dir.mkdir(parents=True, exist_ok=True)
        print_dir.mkdir(parents=True, exist_ok=True)

        with tempfile.TemporaryDirectory() as temp_dir_str:
            temp_dir = Path(temp_dir_str)
            archive_path = temp_dir / "logos.tar.gz"
            archive_url = _get_archive_url(remote_state.source_repo, remote_state.source_ref)
            request = Request(archive_url, headers={"User-Agent": "spoolman-vendor-logo-sync"})  # noqa: S310
            with urlopen(request, timeout=60) as response:  # noqa: S310
                archive_path.write_bytes(response.read())

            with tarfile.open(archive_path, mode="r:gz") as archive:
                archive.extractall(path=temp_dir)  # noqa: S202

            source_logo_dir = _find_first_subdir(temp_dir, "logos")
            source_web_dir = _find_first_subdir(temp_dir, "web")
            if source_logo_dir is None and source_web_dir is None:
                raise RuntimeError("Downloaded archive did not contain logos/ or web/ directories.")

            web_files: list[str] = []
            print_files: list[str] = []

            if source_web_dir is not None:
                for source_file in sorted(source_web_dir.rglob("*.png")):
                    dest_file = web_dir / source_file.name
                    shutil.copy2(source_file, dest_file)
                    web_files.append(f"/vendor-logos/web/{source_file.name}")

            if source_logo_dir is not None:
                for source_file in sorted(source_logo_dir.rglob("*.png")):
                    filename = source_file.name
                    # Some packs keep color web assets inside logos/ with a -web suffix; keep them in the web bucket.
                    if filename.lower().endswith("-web.png"):
                        if source_web_dir is None:
                            dest_file = web_dir / filename
                            shutil.copy2(source_file, dest_file)
                            web_files.append(f"/vendor-logos/web/{filename}")
                        continue
                    dest_file = print_dir / filename
                    shutil.copy2(source_file, dest_file)
                    print_files.append(f"/vendor-logos/print/{filename}")

        custom_web_files, custom_print_files = _copy_preserved_custom_runtime_files(
            staged_target_dir,
            web_files,
            print_files,
        )
        manifest = _write_manifest(
            target_dir=staged_target_dir,
            source_repo=remote_state.source_repo,
            source_ref=remote_state.source_ref,
            source_url=remote_state.source_url,
            signature=remote_state.signature,
            web_files=web_files,
            print_files=print_files,
            custom_web_files=custom_web_files,
            custom_print_files=custom_print_files,
        )

        _replace_runtime_logo_dir(staged_target_dir)

        return manifest
    finally:
        if staged_target_dir.exists():
            shutil.rmtree(staged_target_dir, ignore_errors=True)


def import_logo_pack_zip(
    zip_bytes: bytes, upload_name: str | None = None, generate_print_logos: bool = False
) -> VendorLogoImportResult:
    target_dir = get_runtime_vendor_logo_dir()
    staged_target_dir = Path(tempfile.mkdtemp(prefix=".vendor-logos-stage-", dir=target_dir.parent))

    try:
        web_dir = staged_target_dir / "web"
        print_dir = staged_target_dir / "print"
        web_dir.mkdir(parents=True, exist_ok=True)
        print_dir.mkdir(parents=True, exist_ok=True)

        local_manifest = _read_local_manifest() or {}
        existing_web_files, existing_print_files = _copy_existing_runtime_logo_files(staged_target_dir)
        web_files = list(existing_web_files)
        print_files = list(existing_print_files)
        generated_print_logo_count = 0
        used_web_names = {Path(_normalize_logo_asset_path(value)).name for value in web_files}
        used_print_names = {Path(_normalize_logo_asset_path(value)).name for value in print_files}
        imported_web_files: list[str] = []
        imported_print_files: list[str] = []
        signature_parts: list[str] = []

        try:
            archive = zipfile.ZipFile(BytesIO(zip_bytes))
        except zipfile.BadZipFile as exc:
            raise RuntimeError("Uploaded file is not a valid ZIP archive.") from exc

        with archive:
            for member in archive.infolist():
                if member.is_dir():
                    continue
                member_path = Path(member.filename)
                member_name = member_path.name
                if member_name == "":
                    continue
                lower_path_parts = {part.lower() for part in member_path.parts[:-1]}
                # Finder ZIPs can include AppleDouble metadata files (for example
                # "__MACOSX/._logo.png"). Those byte streams are not real image payloads and
                # should be ignored instead of treated as invalid logo files.
                if member_name.startswith("._") or "__macosx" in lower_path_parts:
                    continue
                suffix = Path(member_name).suffix.lower()
                if suffix not in SUPPORTED_IMPORTED_WEB_EXTENSIONS:
                    continue

                source_bytes = archive.read(member)
                target_kind = "web"
                if "logos" in lower_path_parts or "print" in lower_path_parts:
                    target_kind = "print"
                elif "web" in lower_path_parts:
                    target_kind = "web"

                # Imports are intentionally permissive about archive layout, but the stored output is always normalized.
                if target_kind == "print":
                    print_filename = _dedupe_filename(used_print_names, Path(member_name).with_suffix(".png").name)
                    if suffix == ".png":
                        _validate_image_bytes(source_bytes, member_name)
                        print_bytes = source_bytes
                    else:
                        print_bytes = _convert_source_bytes_to_monochrome_png(source_bytes, member_name)
                    (print_dir / print_filename).write_bytes(print_bytes)
                    print_logo_url = f"/vendor-logos/print/{print_filename}"
                    print_files.append(print_logo_url)
                    imported_print_files.append(print_logo_url)
                    signature_parts.append(f"print:{print_filename}:{hashlib.sha1(print_bytes).hexdigest()}")  # noqa: S324
                    continue

                web_filename = _dedupe_filename(
                    used_web_names, Path(member_name).with_suffix(".png").name if suffix != ".png" else member_name
                )
                if suffix == ".png":
                    _validate_image_bytes(source_bytes, member_name)
                    web_bytes = source_bytes
                else:
                    web_bytes = _convert_source_bytes_to_rgba_png(source_bytes, member_name)
                (web_dir / web_filename).write_bytes(web_bytes)
                web_logo_url = f"/vendor-logos/web/{web_filename}"
                web_files.append(web_logo_url)
                imported_web_files.append(web_logo_url)
                signature_parts.append(f"web:{web_filename}:{hashlib.sha1(web_bytes).hexdigest()}")  # noqa: S324

                if not generate_print_logos:
                    continue

                # Optional print generation mirrors the per-vendor conversion flow but applies to every imported web logo.
                print_filename = _dedupe_filename(
                    used_print_names,
                    _build_generated_print_logo_filename(web_bytes, web_filename),
                )
                try:
                    converted_bytes = _convert_source_bytes_to_monochrome_png(web_bytes, member_name)
                except RuntimeError as exc:
                    raise RuntimeError(
                        f"Could not generate print logo from '{member_name}'. "
                        f"Supported formats: {SUPPORTED_LOGO_FORMATS_TEXT}."
                    ) from exc
                (print_dir / print_filename).write_bytes(converted_bytes)
                print_logo_url = f"/vendor-logos/print/{print_filename}"
                print_files.append(print_logo_url)
                imported_print_files.append(print_logo_url)
                generated_print_logo_count += 1
                signature_parts.append(
                    f"print:{print_filename}:{hashlib.sha1(converted_bytes).hexdigest()}"  # noqa: S324
                )

        if len(imported_web_files) == 0:
            raise RuntimeError("ZIP archive did not contain any supported logo image files.")

        source_repo = (
            local_manifest.get("source_repo") if isinstance(local_manifest.get("source_repo"), str) else "uploaded-zip"
        )
        source_ref = (
            local_manifest.get("source_ref")
            if isinstance(local_manifest.get("source_ref"), str)
            else "manual-upload.zip"
        )
        source_url = (
            local_manifest.get("source_url") if isinstance(local_manifest.get("source_url"), str) else "local upload"
        )
        if source_repo == "uploaded-zip":
            source_ref = Path(upload_name).name if upload_name else "manual-upload.zip"
            source_url = "local upload"
        # Keep the last synced remote signature when appending local ZIP assets on top of a GitHub-synced pack.
        # That lets later refresh checks compare the remote pack cheaply without treating local additions as drift.
        signature = (
            local_manifest.get("source_tree_signature")
            if isinstance(local_manifest.get("source_tree_signature"), str)
            else None
        )
        if signature is None:
            signature = hashlib.sha256("\n".join(sorted(signature_parts)).encode("utf-8")).hexdigest()

        existing_custom_web_files = [
            value for value in local_manifest.get("custom_web_files", []) if isinstance(value, str)
        ]
        existing_custom_print_files = [
            value for value in local_manifest.get("custom_print_files", []) if isinstance(value, str)
        ]
        if len(existing_web_files) > 0 and len(existing_custom_web_files) == 0 and source_repo == "uploaded-zip":
            existing_custom_web_files = list(existing_web_files)
        if len(existing_print_files) > 0 and len(existing_custom_print_files) == 0 and source_repo == "uploaded-zip":
            existing_custom_print_files = list(existing_print_files)

        # ZIP imports append into the local operator-managed library, so imported files join the custom preservation lists.
        manifest = _write_manifest(
            target_dir=staged_target_dir,
            source_repo=source_repo,
            source_ref=source_ref,
            source_url=source_url,
            signature=signature,
            web_files=web_files,
            print_files=print_files,
            custom_web_files=existing_custom_web_files + imported_web_files,
            custom_print_files=existing_custom_print_files + imported_print_files,
        )

        _replace_runtime_logo_dir(staged_target_dir)

        synced_at = manifest.get("synced_at_utc")
        return VendorLogoImportResult(
            source_repo="uploaded-zip",
            source_ref=source_ref,
            source_url="local upload",
            message="Imported logo pack from ZIP archive.",
            web_logo_count=int(manifest.get("web_logo_count", 0)),
            print_logo_count=int(manifest.get("print_logo_count", 0)),
            generated_print_logo_count=generated_print_logo_count,
            synced_at_utc=synced_at if isinstance(synced_at, str) else None,
        )
    finally:
        if staged_target_dir.exists():
            shutil.rmtree(staged_target_dir, ignore_errors=True)


def store_uploaded_logo_file(file_bytes: bytes, upload_name: str | None, target_kind: str) -> VendorLogoUploadResult:
    if target_kind not in {"web", "print"}:
        raise ValueError("Logo target must be either 'web' or 'print'.")
    if len(file_bytes) == 0:
        raise RuntimeError("Uploaded logo file is empty.")

    source_name = upload_name or f"{target_kind}-logo.png"
    source_suffix = Path(source_name).suffix.lower()
    if source_suffix not in SUPPORTED_IMPORTED_WEB_EXTENSIONS:
        raise RuntimeError("Uploaded logo file type is not supported.")

    runtime_dir = get_runtime_vendor_logo_dir()
    destination_dir = runtime_dir / target_kind
    destination_dir.mkdir(parents=True, exist_ok=True)

    existing_names = {path.name for path in destination_dir.iterdir() if path.is_file()}
    filename_stem = _sanitize_upload_stem(Path(source_name).stem)
    if target_kind == "web":
        preferred_name = f"{filename_stem}-web.png"
        # Keep valid PNG uploads byte-for-byte to avoid accidental quality loss on manual uploads.
        # Non-PNG uploads are normalized into PNG so the runtime pack format stays consistent.
        if source_suffix == ".png":
            _validate_image_bytes(file_bytes, source_name)
            output_bytes = file_bytes
        else:
            output_bytes = _convert_source_bytes_to_rgba_png(file_bytes, source_name)
    else:
        preferred_name = f"{filename_stem}.png"
        # Print uploads keep valid PNG files unchanged, matching ZIP import behavior for print/
        # assets. Other formats are converted to monochrome PNG before storage.
        if source_suffix == ".png":
            _validate_image_bytes(file_bytes, source_name)
            output_bytes = file_bytes
        else:
            output_bytes = _convert_source_bytes_to_monochrome_png(file_bytes, source_name)

    destination_name = _dedupe_filename(existing_names, preferred_name)
    (destination_dir / destination_name).write_bytes(output_bytes)

    logo_url = f"/vendor-logos/{target_kind}/{destination_name}"
    # Persist uploaded files in the manifest immediately so suggestions and previews can use them without a separate sync.
    manifest = _update_runtime_manifest_with_added_logo(logo_url, target_kind, is_custom=True)
    synced_at = manifest.get("synced_at_utc")

    return VendorLogoUploadResult(
        logo_url=logo_url,
        target=target_kind,
        message=f"Uploaded {target_kind} logo file.",
        web_logo_count=int(manifest.get("web_logo_count", 0)),
        print_logo_count=int(manifest.get("print_logo_count", 0)),
        synced_at_utc=synced_at if isinstance(synced_at, str) else None,
    )


def sync_logo_pack_from_github_if_needed() -> VendorLogoSyncResult:
    source_repo = get_logo_source_repo()
    source_ref = get_logo_source_ref()
    source_url = get_logo_source_url(source_repo, source_ref)

    local_manifest = _read_local_manifest()
    local_signature = None
    if local_manifest is not None:
        signature_value = local_manifest.get("source_tree_signature")
        if isinstance(signature_value, str) and signature_value != "":
            local_signature = signature_value

    remote_state = _get_remote_logo_state(source_repo, source_ref)

    # GitHub sync refreshes the shared runtime pack only when the remote tree changes; per-vendor field assignment is separate.
    if local_signature == remote_state.signature:
        synced_at = local_manifest.get("synced_at_utc") if isinstance(local_manifest, dict) else None
        return VendorLogoSyncResult(
            source_repo=source_repo,
            source_ref=source_ref,
            source_url=source_url,
            updated=False,
            message="Logo pack is already up to date.",
            web_logo_count=int(local_manifest.get("web_logo_count", 0)) if isinstance(local_manifest, dict) else 0,
            print_logo_count=int(local_manifest.get("print_logo_count", 0)) if isinstance(local_manifest, dict) else 0,
            local_signature=local_signature,
            remote_signature=remote_state.signature,
            synced_at_utc=synced_at if isinstance(synced_at, str) else None,
        )

    new_manifest = _download_and_write_logo_pack(remote_state)
    synced_at = new_manifest.get("synced_at_utc")

    return VendorLogoSyncResult(
        source_repo=source_repo,
        source_ref=source_ref,
        source_url=source_url,
        updated=True,
        message="Downloaded newer vendor logo pack from GitHub.",
        web_logo_count=int(new_manifest.get("web_logo_count", 0)),
        print_logo_count=int(new_manifest.get("print_logo_count", 0)),
        local_signature=local_signature,
        remote_signature=remote_state.signature,
        synced_at_utc=synced_at if isinstance(synced_at, str) else None,
    )

#!/usr/bin/env python3
"""Populate a Spoolman instance with a large, feature-complete dataset for stress testing.

Creates vendors, filaments and spools in bulk, mixing internally-defined filaments with
ones imported from the external filament catalog, and exercises every extra-field type
(text, integer, integer_range, float, float_range, datetime, boolean, choice, multi-choice)
on all three entity types.

Only uses the stdlib, so it can be run with any Python 3.10+ interpreter — no virtualenv
and no dependency on the Spoolman package itself; it talks to a running instance over the
public API:

    python scripts/stress_seed.py --url http://localhost:7912
    python scripts/stress_seed.py --vendors 50 --filaments 500 --spools 5000
    python scripts/stress_seed.py --purge            # delete everything first
    python scripts/stress_seed.py --purge-only       # just clean up

Also available as `uv run poe stress-seed <args>`.

Only ever point this at a development instance: --purge deletes *all* vendors, filaments
and spools on the target, not just the ones it created.

Data is tagged so it can be identified later: every generated entity gets a comment
containing the marker "[stress-seed]".
"""

from __future__ import annotations

import argparse
import json
import random
import string
import sys
import threading
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from typing import Any

MARKER = "[stress-seed]"
DEFAULT_URL = "http://localhost:7912"

# ---------------------------------------------------------------------------
# HTTP plumbing
# ---------------------------------------------------------------------------


class ApiError(RuntimeError):
    """A non-2xx response from the Spoolman API."""

    def __init__(self, method: str, path: str, status: int, body: str) -> None:
        super().__init__(f"{method} {path} -> {status}: {body}")
        self.status = status
        self.body = body


class Api:
    """Minimal Spoolman API v1 client."""

    def __init__(self, base_url: str, timeout: float = 30.0) -> None:
        self.base = base_url.rstrip("/") + "/api/v1"
        self.timeout = timeout

    def _request(self, method: str, path: str, body: Any = None, params: dict | None = None) -> Any:
        url = self.base + path
        if params:
            url += "?" + urllib.parse.urlencode(params)
        data = None
        headers = {"Accept": "application/json"}
        if body is not None:
            data = json.dumps(body).encode()
            headers["Content-Type"] = "application/json"
        req = urllib.request.Request(url, data=data, headers=headers, method=method)  # noqa: S310
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:  # noqa: S310
                raw = resp.read()
        except urllib.error.HTTPError as e:
            raise ApiError(method, path, e.code, e.read().decode(errors="replace")[:500]) from None
        except urllib.error.URLError as e:
            raise RuntimeError(f"Could not reach {url}: {e.reason}") from None
        if not raw:
            return None
        return json.loads(raw)

    def get(self, path: str, params: dict | None = None) -> Any:
        return self._request("GET", path, params=params)

    def post(self, path: str, body: Any) -> Any:
        return self._request("POST", path, body=body)

    def put(self, path: str, body: Any) -> Any:
        return self._request("PUT", path, body=body)

    def delete(self, path: str) -> Any:
        return self._request("DELETE", path)


class Progress:
    """Thread-safe single-line progress counter."""

    def __init__(self, label: str, total: int) -> None:
        self.label = label
        self.total = total
        self.done = 0
        self.failed = 0
        self._lock = threading.Lock()

    def tick(self, *, failed: bool = False) -> None:
        with self._lock:
            self.done += 1
            if failed:
                self.failed += 1
            if self.done % 25 == 0 and self.done != self.total:
                suffix = f" ({self.failed} failed)" if self.failed else ""
                print(f"\r  {self.label}: {self.done}/{self.total}{suffix}", end="", flush=True)

    def finish(self) -> None:
        suffix = f" ({self.failed} failed)" if self.failed else ""
        print(f"\r  {self.label}: {self.done}/{self.total}{suffix}   ")


# ---------------------------------------------------------------------------
# Extra field definitions - one of every type, on every entity type
# ---------------------------------------------------------------------------

CHOICE_TAGS = ["indoor", "outdoor", "prototype", "production", "archive", "brittle"]
CHOICE_GRADE = ["A", "B", "C", "unrated"]

# (key, params) - params exactly as the /field endpoint expects.
COMMON_FIELDS: list[tuple[str, dict]] = [
    ("st_text", {"name": "Free text", "order": 1, "field_type": "text"}),
    (
        "st_text_default",
        {"name": "Text w/ default", "order": 2, "field_type": "text", "default_value": json.dumps("unset")},
    ),
    ("st_int", {"name": "Integer", "order": 3, "field_type": "integer", "unit": "pcs"}),
    (
        "st_int_default",
        {"name": "Integer w/ default", "order": 4, "field_type": "integer", "default_value": json.dumps(0)},
    ),
    ("st_int_range", {"name": "Integer range", "order": 5, "field_type": "integer_range", "unit": "°C"}),
    ("st_float", {"name": "Float", "order": 6, "field_type": "float", "unit": "mm"}),
    ("st_float_range", {"name": "Float range", "order": 7, "field_type": "float_range", "unit": "mm"}),
    ("st_datetime", {"name": "Date", "order": 8, "field_type": "datetime"}),
    ("st_bool", {"name": "Boolean", "order": 9, "field_type": "boolean"}),
    (
        "st_bool_default",
        {"name": "Boolean w/ default", "order": 10, "field_type": "boolean", "default_value": json.dumps(False)},
    ),
    (
        "st_choice",
        {"name": "Single choice", "order": 11, "field_type": "choice", "choices": CHOICE_GRADE, "multi_choice": False},
    ),
    (
        "st_choice_default",
        {
            "name": "Single choice w/ default",
            "order": 12,
            "field_type": "choice",
            "choices": CHOICE_GRADE,
            "multi_choice": False,
            "default_value": json.dumps("unrated"),
        },
    ),
    (
        "st_multichoice",
        {"name": "Multi choice", "order": 13, "field_type": "choice", "choices": CHOICE_TAGS, "multi_choice": True},
    ),
]

# A couple of entity-specific fields so the three entity types aren't identical.
ENTITY_FIELDS: dict[str, list[tuple[str, dict]]] = {
    "vendor": [
        ("st_support_url", {"name": "Support URL", "order": 20, "field_type": "text"}),
        ("st_rating", {"name": "Vendor rating", "order": 21, "field_type": "float", "unit": "/5"}),
    ],
    "filament": [
        ("st_dry_temp", {"name": "Drying temperature", "order": 20, "field_type": "integer", "unit": "°C"}),
        ("st_nozzle_range", {"name": "Nozzle range", "order": 21, "field_type": "float_range", "unit": "mm"}),
    ],
    "spool": [
        ("st_opened_at", {"name": "Opened at", "order": 20, "field_type": "datetime"}),
        ("st_dried", {"name": "Dried", "order": 21, "field_type": "boolean"}),
        (
            "st_printer",
            {
                "name": "Assigned printer",
                "order": 22,
                "field_type": "choice",
                "choices": ["Prusa MK4", "Voron 2.4", "Bambu X1C", "Ender 3", "unassigned"],
                "multi_choice": False,
            },
        ),
    ],
}

ENTITY_TYPES = ("vendor", "filament", "spool")


def all_fields(entity_type: str) -> list[tuple[str, dict]]:
    return COMMON_FIELDS + ENTITY_FIELDS[entity_type]


def setup_extra_fields(api: Api, entity_types: tuple[str, ...] = ENTITY_TYPES) -> None:
    print("Creating extra field definitions...")
    for entity_type in entity_types:
        for key, params in all_fields(entity_type):
            api.post(f"/field/{entity_type}/{key}", params)
        print(f"  {entity_type}: {len(all_fields(entity_type))} fields")


def delete_extra_fields(api: Api) -> None:
    print("Deleting stress-seed extra field definitions...")
    for entity_type in ENTITY_TYPES:
        existing = {f["key"] for f in api.get(f"/field/{entity_type}")}
        for key, _ in all_fields(entity_type):
            if key in existing:
                api.delete(f"/field/{entity_type}/{key}")


# ---------------------------------------------------------------------------
# Random value generation
# ---------------------------------------------------------------------------


def rand_dt(rng: random.Random, max_days_ago: int = 900) -> str:
    dt = datetime.now(timezone.utc) - timedelta(
        days=rng.randint(0, max_days_ago),
        seconds=rng.randint(0, 86_400),
    )
    return dt.isoformat().replace("+00:00", "Z")


def rand_text(rng: random.Random) -> str:
    words = [
        "batch",
        "shelf",
        "dry",
        "vacuum",
        "sealed",
        "opened",
        "loaner",
        "backup",
        "sample",
        "clogged",
        "verified",
        "returned",
        "gift",
        "leftover",
    ]
    return " ".join(rng.sample(words, rng.randint(1, 4)))


# Set from --skip-fields. The API rejects a value for a field that was never
# defined, so when we don't create the definitions we must not generate values
# either — otherwise every single POST fails with "Unknown extra field".
EXTRA_FIELDS_ENABLED = True


def gen_extra(rng: random.Random, entity_type: str, fill: float = 0.75) -> dict[str, str]:
    """Generate a random, valid extra-field map. Every value is a JSON-encoded string.

    ``fill`` is the probability that any given field is populated, so the dataset
    contains a realistic mix of set and unset (and defaulted) fields.
    """
    if not EXTRA_FIELDS_ENABLED:
        return {}
    out: dict[str, str] = {}
    for key, params in all_fields(entity_type):
        if rng.random() > fill:
            continue
        ftype = params["field_type"]
        if ftype == "text":
            value: Any = rand_text(rng)
        elif ftype == "integer":
            value = rng.randint(-50, 500)
        elif ftype == "integer_range":
            lo = rng.randint(0, 200)
            # Exercise open-ended ranges too: either bound may be null.
            value = [
                None if rng.random() < 0.15 else lo,
                None if rng.random() < 0.15 else lo + rng.randint(0, 120),
            ]
        elif ftype == "float":
            value = round(rng.uniform(0, 100), 2)
        elif ftype == "float_range":
            lo = round(rng.uniform(0, 5), 2)
            value = [
                None if rng.random() < 0.15 else lo,
                None if rng.random() < 0.15 else round(lo + rng.uniform(0, 3), 2),
            ]
        elif ftype == "datetime":
            value = rand_dt(rng)
        elif ftype == "boolean":
            value = rng.random() < 0.5
        elif ftype == "choice":
            choices = params["choices"]
            if params.get("multi_choice"):
                value = rng.sample(choices, rng.randint(0, len(choices)))
            else:
                value = rng.choice(choices)
        else:
            raise ValueError(f"Unhandled field type {ftype}")
        out[key] = json.dumps(value)
    return out


VENDOR_NAMES = [
    "Polymaker",
    "Prusament",
    "eSun",
    "Sunlu",
    "Overture",
    "Hatchbox",
    "Fillamentum",
    "ColorFabb",
    "Atomic Filament",
    "MatterHackers",
    "Bambu Lab",
    "Elegoo",
    "Anycubic",
    "3DJake",
    "Extrudr",
    "AddNorth",
    "Formfutura",
    "Filamentum Nordic",
    "Spectrum",
    "Devil Design",
    "GEEETECH",
    "Kexcelled",
    "Verbatim",
    "Ultimaker",
    "Raise3D",
]

MATERIALS = [
    ("PLA", 1.24),
    ("PETG", 1.27),
    ("ABS", 1.04),
    ("ASA", 1.07),
    ("TPU", 1.21),
    ("Nylon", 1.14),
    ("PC", 1.20),
    ("PVA", 1.23),
    ("HIPS", 1.04),
    ("PLA+", 1.25),
    ("PA-CF", 1.30),
    ("PET-CF", 1.35),
    ("PPS", 1.41),
    ("PEEK", 1.30),
]

COLOR_NAMES = [
    "Charcoal Black",
    "Arctic White",
    "Galaxy Purple",
    "Fire Engine Red",
    "Ocean Blue",
    "Forest Green",
    "Sunflower Yellow",
    "Hot Pink",
    "Gunmetal Grey",
    "Copper Bronze",
    "Translucent Teal",
    "Glow Green",
    "Silk Gold",
    "Matte Beige",
    "Neon Orange",
    "Marble White",
    "Sparkle Silver",
    "Midnight Navy",
    "Pastel Mint",
    "Wine Red",
]

LOCATIONS = [
    "Shelf A",
    "Shelf B",
    "Shelf C",
    "Dry Box 1",
    "Dry Box 2",
    "Dry Box 3",
    "Printer MK4",
    "Printer Voron",
    "Printer X1C",
    "Storage Bin",
    "Garage",
    "Office Cabinet",
    "Loaned Out",
    None,
]


def rand_hex(rng: random.Random, *, alpha: bool = False) -> str:
    n = 8 if alpha else 6
    return "".join(rng.choice("0123456789ABCDEF") for _ in range(n))


# ---------------------------------------------------------------------------
# Creation
# ---------------------------------------------------------------------------


def create_vendors(api: Api, rng: random.Random, count: int, workers: int) -> list[dict]:
    """Create internal vendors, plus some that pretend to come from an external DB."""
    print(f"Creating {count} vendors...")
    progress = Progress("vendors", count)
    created: list[dict] = []
    lock = threading.Lock()

    def make(i: int) -> None:
        local = random.Random(rng.random())
        base = VENDOR_NAMES[i % len(VENDOR_NAMES)]
        suffix = "" if i < len(VENDOR_NAMES) else f" {i // len(VENDOR_NAMES) + 1}"
        external = local.random() < 0.3
        body: dict[str, Any] = {
            "name": f"{base}{suffix}"[:64],
            "comment": f"{MARKER} vendor #{i} " + rand_text(local),
            "extra": gen_extra(local, "vendor"),
        }
        if local.random() < 0.8:
            body["empty_spool_weight"] = local.choice([140, 190, 200, 220, 250])
        if external:
            body["external_id"] = base.lower().replace(" ", "_")
        try:
            vendor = api.post("/vendor", body)
        except ApiError as e:
            progress.tick(failed=True)
            print(f"\n  vendor #{i} failed: {e}")
            return
        with lock:
            created.append(vendor)
        progress.tick()

    with ThreadPoolExecutor(max_workers=workers) as pool:
        list(pool.map(make, range(count)))
    progress.finish()
    return created


def fetch_external_catalog(api: Api) -> list[dict]:
    """Fetch the external filament catalog, tolerating it not being synced yet."""
    try:
        catalog = api.get("/external/filament")
    except (ApiError, RuntimeError) as e:
        print(f"  external catalog unavailable ({e}); falling back to internal filaments only")
        return []
    if not catalog:
        print("  external catalog is empty; falling back to internal filaments only")
        return []
    print(f"  external catalog has {len(catalog)} entries")
    return catalog


def create_filaments(
    api: Api,
    rng: random.Random,
    count: int,
    vendors: list[dict],
    catalog: list[dict],
    external_ratio: float,
    workers: int,
) -> list[dict]:
    """Create filaments: a mix of hand-rolled internal ones and external-catalog imports."""
    n_external = int(count * external_ratio) if catalog else 0
    n_internal = count - n_external
    print(f"Creating {count} filaments ({n_internal} internal, {n_external} external)...")
    progress = Progress("filaments", count)
    created: list[dict] = []
    lock = threading.Lock()

    # External imports need a vendor matching the catalog manufacturer; create those
    # up front (serially) so parallel workers don't race to create duplicates.
    external_picks = [rng.choice(catalog) for _ in range(n_external)]
    external_vendors: dict[str, dict] = {}
    if external_picks:
        by_name = {v["name"]: v for v in vendors}
        for pick in external_picks:
            manufacturer = pick["manufacturer"]
            if manufacturer in external_vendors:
                continue
            if manufacturer in by_name:
                external_vendors[manufacturer] = by_name[manufacturer]
                continue
            try:
                external_vendors[manufacturer] = api.post(
                    "/vendor",
                    {
                        "name": manufacturer[:64],
                        "external_id": manufacturer.lower().replace(" ", "_"),
                        "comment": f"{MARKER} external vendor",
                        "extra": gen_extra(rng, "vendor", fill=0.4),
                    },
                )
            except ApiError as e:
                print(f"\n  external vendor {manufacturer!r} failed: {e}")
        print(f"  resolved {len(external_vendors)} external vendors")

    def make_internal(i: int) -> dict | None:
        local = random.Random(rng.random())
        material, density = local.choice(MATERIALS)
        vendor = local.choice(vendors) if vendors and local.random() < 0.9 else None
        color = local.choice(COLOR_NAMES)
        body: dict[str, Any] = {
            "name": f"{material} {color} #{i}"[:64],
            "material": material,
            "density": round(density * local.uniform(0.97, 1.03), 3),
            "diameter": local.choice([1.75, 1.75, 1.75, 2.85, 3.0]),
            "weight": local.choice([250, 500, 750, 1000, 1000, 2000, 3000]),
            "spool_weight": local.choice([0, 140, 180, 200, 250]),
            "price": round(local.uniform(9, 90), 2),
            "article_number": "".join(local.choices(string.ascii_uppercase + string.digits, k=8)),
            "comment": f"{MARKER} filament #{i} " + rand_text(local),
            "settings_extruder_temp": local.randint(180, 300),
            "settings_bed_temp": local.randint(0, 110),
            "extra": gen_extra(local, "filament"),
        }
        if vendor is not None:
            body["vendor_id"] = vendor["id"]
        roll = local.random()
        if roll < 0.15:
            # Multi-color filament.
            hexes = [rand_hex(local) for _ in range(local.randint(2, 5))]
            body["multi_color_hexes"] = ",".join(hexes)
            body["multi_color_direction"] = local.choice(["coaxial", "longitudinal"])
        elif roll < 0.25:
            # Color with alpha channel (translucent).
            body["color_hex"] = rand_hex(local, alpha=True)
        elif roll < 0.95:
            body["color_hex"] = rand_hex(local)
        # remaining ~5%: no color at all
        if local.random() < 0.05:
            # A few minimal filaments: only the required fields.
            body = {
                "density": body["density"],
                "diameter": body["diameter"],
                "comment": f"{MARKER} minimal filament #{i}",
            }
        return body

    def make_external(i: int) -> dict | None:
        local = random.Random(rng.random())
        pick = external_picks[i]
        body: dict[str, Any] = {
            "name": pick["name"][:64],
            "material": pick["material"],
            "density": pick["density"],
            "diameter": pick["diameter"],
            "weight": pick["weight"],
            "external_id": pick["id"],
            "comment": f"{MARKER} imported from external catalog",
            "extra": gen_extra(local, "filament", fill=0.4),
        }
        vendor = external_vendors.get(pick["manufacturer"])
        if vendor is not None:
            body["vendor_id"] = vendor["id"]
        if pick.get("spool_weight") is not None:
            body["spool_weight"] = pick["spool_weight"]
        if pick.get("extruder_temp") is not None:
            body["settings_extruder_temp"] = pick["extruder_temp"]
        if pick.get("bed_temp") is not None:
            body["settings_bed_temp"] = pick["bed_temp"]
        if pick.get("color_hexes"):
            body["multi_color_hexes"] = ",".join(pick["color_hexes"])
            body["multi_color_direction"] = pick.get("multi_color_direction") or "coaxial"
        elif pick.get("color_hex"):
            body["color_hex"] = pick["color_hex"]
        return body

    def make(i: int) -> None:
        body = make_external(i - n_internal) if i >= n_internal else make_internal(i)
        if body is None:
            progress.tick(failed=True)
            return
        try:
            filament = api.post("/filament", body)
        except ApiError as e:
            progress.tick(failed=True)
            print(f"\n  filament #{i} failed: {e}")
            return
        with lock:
            created.append(filament)
        progress.tick()

    with ThreadPoolExecutor(max_workers=workers) as pool:
        list(pool.map(make, range(count)))
    progress.finish()
    return created


def create_spools(
    api: Api,
    rng: random.Random,
    count: int,
    filaments: list[dict],
    workers: int,
    archived_ratio: float,
) -> list[dict]:
    """Create spools across the whole lifecycle: sealed, in-use, nearly empty, archived."""
    print(f"Creating {count} spools...")
    progress = Progress("spools", count)
    created: list[dict] = []
    lock = threading.Lock()

    def make(i: int) -> None:
        local = random.Random(rng.random())
        filament = local.choice(filaments)
        net = filament.get("weight") or local.choice([500, 1000])
        body: dict[str, Any] = {
            "filament_id": filament["id"],
            "comment": f"{MARKER} spool #{i} " + rand_text(local),
            "extra": gen_extra(local, "spool"),
            "archived": local.random() < archived_ratio,
        }
        location = local.choice(LOCATIONS)
        if location is not None:
            body["location"] = location
        if local.random() < 0.7:
            body["lot_nr"] = "".join(local.choices(string.digits, k=6))
        if local.random() < 0.5:
            body["price"] = round(local.uniform(10, 120), 2)
        if local.random() < 0.3:
            # Spools whose net weight differs from the filament type's default.
            body["initial_weight"] = round(net * local.uniform(0.5, 1.5), 1)
        if local.random() < 0.3:
            body["spool_weight"] = local.choice([140, 180, 200, 250])

        roll = local.random()
        if roll < 0.25:
            used = 0.0  # sealed, never used
        elif roll < 0.85:
            used = round(net * local.uniform(0.05, 0.9), 1)
        elif roll < 0.95:
            used = round(net * local.uniform(0.9, 0.999), 1)  # nearly empty
        else:
            used = float(net)  # fully consumed
        body["used_weight"] = used

        if used > 0:
            first = datetime.now(timezone.utc) - timedelta(days=local.randint(1, 700))
            last = first + timedelta(days=local.randint(0, 200))
            body["first_used"] = first.isoformat().replace("+00:00", "Z")
            body["last_used"] = min(last, datetime.now(timezone.utc)).isoformat().replace("+00:00", "Z")

        try:
            spool = api.post("/spool", body)
        except ApiError as e:
            progress.tick(failed=True)
            print(f"\n  spool #{i} failed: {e}")
            return
        with lock:
            created.append(spool)
        progress.tick()

    with ThreadPoolExecutor(max_workers=workers) as pool:
        list(pool.map(make, range(count)))
    progress.finish()
    return created


def exercise_use_endpoints(api: Api, rng: random.Random, spools: list[dict], count: int, workers: int) -> None:
    """Hit /spool/{id}/use and /spool/{id}/measure so consumption paths get real traffic."""
    candidates = [s for s in spools if not s.get("archived")]
    if not candidates:
        return
    count = min(count, len(candidates) * 3)
    print(f"Exercising use/measure endpoints ({count} calls)...")
    progress = Progress("use calls", count)

    def run(_: int) -> None:
        local = random.Random(rng.random())
        spool = local.choice(candidates)
        try:
            if local.random() < 0.5:
                api.put(f"/spool/{spool['id']}/use", {"use_weight": round(local.uniform(1, 50), 1)})
            elif local.random() < 0.5:
                api.put(f"/spool/{spool['id']}/use", {"use_length": round(local.uniform(100, 20000), 1)})
            else:
                tare = spool.get("spool_weight") or spool["filament"].get("spool_weight") or 200
                remaining = spool.get("remaining_weight")
                if remaining is None:
                    # Filament type has no weight set, so there's nothing to measure against.
                    progress.tick()
                    return
                gross = tare + max(remaining - local.uniform(0, 100), 0)
                api.put(f"/spool/{spool['id']}/measure", {"weight": round(gross, 1)})
        except ApiError:
            progress.tick(failed=True)
            return
        progress.tick()

    with ThreadPoolExecutor(max_workers=workers) as pool:
        list(pool.map(run, range(count)))
    progress.finish()


# ---------------------------------------------------------------------------
# Purge
# ---------------------------------------------------------------------------


def _list_all(api: Api, path: str, page: int = 500) -> list[dict]:
    out: list[dict] = []
    offset = 0
    # GET /spool hides archived spools unless asked; without this a purge silently
    # leaves every archived spool behind (and then the filament deletes fail).
    extra = {"allow_archived": "true"} if path == "/spool" else {}
    while True:
        batch = api.get(path, {"limit": page, "offset": offset, **extra})
        if isinstance(batch, dict):  # some endpoints wrap in an object
            batch = batch.get("items", [])
        if not batch:
            break
        out.extend(batch)
        offset += len(batch)
        if len(batch) < page:
            break
    return out


def purge(api: Api, workers: int, *, drop_fields: bool) -> None:
    """Delete every spool, filament and vendor. Order matters: spools reference filaments."""
    for path, label in (("/spool", "spools"), ("/filament", "filaments"), ("/vendor", "vendors")):
        items = _list_all(api, path)
        if not items:
            print(f"  no {label} to delete")
            continue
        progress = Progress(f"deleting {label}", len(items))

        def remove(item: dict, _path: str = path, _p: Progress = progress) -> None:
            try:
                api.delete(f"{_path}/{item['id']}")
            except ApiError:
                _p.tick(failed=True)
                return
            _p.tick()

        with ThreadPoolExecutor(max_workers=workers) as pool:
            list(pool.map(remove, items))
        progress.finish()

    if drop_fields:
        delete_extra_fields(api)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--url", default=DEFAULT_URL, help=f"Spoolman base URL (default: {DEFAULT_URL})")
    parser.add_argument("--vendors", type=int, default=25, help="Number of vendors to create")
    parser.add_argument("--filaments", type=int, default=250, help="Number of filaments to create")
    parser.add_argument("--spools", type=int, default=1000, help="Number of spools to create")
    parser.add_argument(
        "--external-ratio",
        type=float,
        default=0.4,
        help="Fraction of filaments imported from the external catalog (0-1)",
    )
    parser.add_argument("--archived-ratio", type=float, default=0.15, help="Fraction of spools that are archived")
    parser.add_argument("--use-calls", type=int, default=200, help="Number of use/measure API calls to make")
    parser.add_argument("--workers", type=int, default=8, help="Concurrent HTTP requests")
    parser.add_argument("--seed", type=int, default=None, help="RNG seed for reproducible datasets")
    parser.add_argument("--skip-fields", action="store_true", help="Don't create extra field definitions")
    parser.add_argument("--purge", action="store_true", help="Delete all existing data before seeding")
    parser.add_argument("--purge-only", action="store_true", help="Delete all data and exit")
    parser.add_argument(
        "--drop-fields",
        action="store_true",
        help="When purging, also delete the stress-seed extra field definitions",
    )
    args = parser.parse_args()

    api = Api(args.url)
    try:
        info = api.get("/info")
    except RuntimeError as e:
        print(f"error: {e}", file=sys.stderr)
        return 1
    print(f"Connected to Spoolman {info['version']} ({info['db_type']}) at {args.url}\n")

    if args.purge or args.purge_only:
        print("Purging existing data...")
        purge(api, args.workers, drop_fields=args.drop_fields)
        print()
        if args.purge_only:
            return 0

    rng = random.Random(args.seed)
    started = datetime.now(timezone.utc)

    global EXTRA_FIELDS_ENABLED  # noqa: PLW0603
    EXTRA_FIELDS_ENABLED = not args.skip_fields
    if not args.skip_fields:
        setup_extra_fields(api)
        print()

    vendors = create_vendors(api, rng, args.vendors, args.workers)
    if not vendors:
        print("error: no vendors were created, aborting", file=sys.stderr)
        return 1
    print()

    catalog = fetch_external_catalog(api) if args.external_ratio > 0 else []
    filaments = create_filaments(api, rng, args.filaments, vendors, catalog, args.external_ratio, args.workers)
    if not filaments:
        print("error: no filaments were created, aborting", file=sys.stderr)
        return 1
    print()

    spools = create_spools(api, rng, args.spools, filaments, args.workers, args.archived_ratio)
    print()

    if args.use_calls > 0 and spools:
        exercise_use_endpoints(api, rng, spools, args.use_calls, args.workers)
        print()

    elapsed = (datetime.now(timezone.utc) - started).total_seconds()
    total = len(vendors) + len(filaments) + len(spools)
    print(
        f"Done in {elapsed:.1f}s: {len(vendors)} vendors, {len(filaments)} filaments, {len(spools)} spools "
        f"({total / elapsed:.0f} entities/s)"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())

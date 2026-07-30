#!/usr/bin/env python3
"""Populate a Spoolman instance with a small, hand-curated inventory for screenshots.

Unlike ``stress_seed.py`` — which generates a large random dataset to hammer the API —
this builds a plausible *real* inventory: every filament is imported from the external
SpoolmanDB catalog, so names, colors, densities and temperatures all agree with each
other. A spool labelled "Prusa Orange" is actually orange.

The spools on top of those filaments are made up, because that part is genuinely
per-user data: partially used weights, locations, lot numbers, prices, first/last-used
dates, and a few custom fields, so the UI shows a library that has been lived in
rather than a fresh install.

Stdlib only; talks to a running instance over the public API:

    python scripts/demo_seed.py --url http://localhost:7912 --purge

Also available as `uv run poe demo-seed <args>`.

Only ever point this at a development instance: --purge deletes *all* vendors, filaments
and spools on the target, not just the ones it created.
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any

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

    def delete(self, path: str) -> Any:
        return self._request("DELETE", path)


# ---------------------------------------------------------------------------
# Extra fields - the handful a real user actually defines
# ---------------------------------------------------------------------------

VENDORS_OF_RECORD = ["Prusa Shop", "3DJake", "Amazon", "Local reseller"]

SPOOL_FIELDS: list[tuple[str, dict]] = [
    ("opened", {"name": "Opened", "order": 1, "field_type": "datetime"}),
    ("dried", {"name": "Dried", "order": 2, "field_type": "boolean", "default_value": json.dumps(False)}),
    (
        "bought_from",
        {
            "name": "Bought from",
            "order": 3,
            "field_type": "choice",
            "choices": VENDORS_OF_RECORD,
            "multi_choice": False,
        },
    ),
]

FILAMENT_FIELDS: list[tuple[str, dict]] = [
    ("drying_temp", {"name": "Drying temperature", "order": 1, "field_type": "integer", "unit": "°C"}),
]

ALL_FIELDS = {"spool": SPOOL_FIELDS, "filament": FILAMENT_FIELDS}


def setup_extra_fields(api: Api) -> None:
    print("Creating extra field definitions...")
    for entity_type, fields in ALL_FIELDS.items():
        for key, params in fields:
            api.post(f"/field/{entity_type}/{key}", params)
        print(f"  {entity_type}: {len(fields)} fields")


def delete_extra_fields(api: Api) -> None:
    for entity_type, fields in ALL_FIELDS.items():
        existing = {f["key"] for f in api.get(f"/field/{entity_type}")}
        for key, _ in fields:
            if key in existing:
                api.delete(f"/field/{entity_type}/{key}")


# ---------------------------------------------------------------------------
# The inventory
# ---------------------------------------------------------------------------


@dataclass
class SpoolSpec:
    """One physical spool. ``used`` is the fraction of the filament's net weight consumed."""

    used: float
    #: Hours since this spool was last printed with. None = never opened, still sealed.
    last_used_h: float | None = None
    #: Hours of use history behind it, i.e. how much earlier `first_used` was.
    history_h: float = 24 * 30
    location: str | None = None
    lot_nr: str | None = None
    price: float | None = None
    #: Free-form note. Only the inspector shows it, so length is unconstrained.
    comment: str | None = None
    dried: bool | None = None
    bought_from: str | None = None
    archived: bool = False


@dataclass
class FilamentSpec:
    """A filament from the external catalog, plus the spools of it on the shelf."""

    external_id: str
    spools: list[SpoolSpec] = field(default_factory=list)
    drying_temp: int | None = None


# Ordered roughly by how recently the filament was used, which is also how the library
# sorts by default, so this list reads top-to-bottom like the screenshot does.
INVENTORY: list[FilamentSpec] = [
    FilamentSpec(
        "prusament_pla_prusaorange_1000_175_p",
        drying_temp=55,
        spools=[
            SpoolSpec(
                used=0.658,
                last_used_h=4,
                history_h=24 * 47,
                location="Prusa MK4S",
                lot_nr="24E1707",
                price=29.99,
                dried=True,
                bought_from="Prusa Shop",
                comment="House orange - keep one loaded at all times.",
            ),
            SpoolSpec(used=0.931, last_used_h=24 * 12, history_h=24 * 90, location="Shelf B", lot_nr="24C0912"),
            SpoolSpec(used=0.0, location="Dry Box 1", lot_nr="25A2244", price=29.99, bought_from="Prusa Shop"),
        ],
    ),
    FilamentSpec(
        "prusament_petg_junglegreen_1000_175_p",
        drying_temp=65,
        spools=[
            SpoolSpec(
                used=0.412,
                last_used_h=27,
                history_h=24 * 20,
                location="Voron 2.4",
                lot_nr="24F0431",
                price=27.49,
                dried=True,
                bought_from="Prusa Shop",
            ),
            SpoolSpec(used=0.144, last_used_h=24 * 9, history_h=24 * 12, location="Shelf A", lot_nr="24F0431"),
        ],
    ),
    FilamentSpec(
        "bambulab_pla_bambugreen_1000_175_n",
        drying_temp=55,
        spools=[
            SpoolSpec(
                used=0.547,
                last_used_h=24 * 2,
                history_h=24 * 35,
                location="Bambu X1C",
                lot_nr="B-2411-338",
                price=24.99,
                bought_from="Amazon",
            ),
            SpoolSpec(used=0.885, last_used_h=24 * 21, history_h=24 * 60, location="Shelf A"),
            SpoolSpec(used=0.0, location="Dry Box 2", price=24.99, bought_from="Amazon"),
        ],
    ),
    FilamentSpec(
        "overture_pla_cementgray_1000_175_c",
        spools=[
            SpoolSpec(
                used=0.336,
                last_used_h=24 * 3,
                history_h=24 * 15,
                location="Prusa MK4S",
                lot_nr="OV-8842",
                price=19.99,
                bought_from="Amazon",
                comment="Prints fine at 0.28mm draft, good for jigs.",
            ),
            SpoolSpec(used=0.972, last_used_h=24 * 30, history_h=24 * 120, location="Shelf C"),
        ],
    ),
    FilamentSpec(
        "prusament_asa_lipstickred_800_175_p",
        drying_temp=80,
        spools=[
            SpoolSpec(
                used=0.288,
                last_used_h=24 * 4,
                history_h=24 * 26,
                location="Voron 2.4",
                lot_nr="24D1188",
                price=31.99,
                dried=True,
                bought_from="Prusa Shop",
            ),
            SpoolSpec(used=0.0, location="Dry Box 1", price=31.99, bought_from="Prusa Shop"),
        ],
    ),
    FilamentSpec(
        "ambrosia_pla_silkblue+purple_1000_175_c",
        spools=[
            SpoolSpec(
                used=0.226,
                last_used_h=24 * 5,
                history_h=24 * 8,
                location="Bambu X1C",
                price=26.50,
                bought_from="3DJake",
                comment="Silk finish - slow it down or it strings.",
            ),
        ],
    ),
    FilamentSpec(
        "fillamentum_asa_extrafilldijonmustard_750_175_n",
        drying_temp=80,
        spools=[
            SpoolSpec(
                used=0.618,
                last_used_h=24 * 6,
                history_h=24 * 70,
                location="Shelf B",
                lot_nr="FL-2409-7",
                price=34.90,
                dried=True,
                bought_from="3DJake",
            ),
        ],
    ),
    FilamentSpec(
        "esun_pla_pla-basicaqua_1000_175_c",
        spools=[
            SpoolSpec(used=0.463, last_used_h=24 * 8, history_h=24 * 40, location="Shelf A", price=17.99),
            SpoolSpec(used=0.995, last_used_h=24 * 55, history_h=24 * 150, location="Shelf C", archived=True),
        ],
    ),
    FilamentSpec(
        "bambulab_tpu_blue_1000_175_n",
        drying_temp=70,
        spools=[
            SpoolSpec(
                used=0.187,
                last_used_h=24 * 10,
                history_h=24 * 45,
                location="Dry Box 3",
                lot_nr="B-2408-102",
                price=39.99,
                dried=True,
                bought_from="Amazon",
                comment="Only prints reliably from the dry box.",
            ),
        ],
    ),
    FilamentSpec(
        "overture_petg_gold_1000_175_c",
        spools=[
            SpoolSpec(used=0.724, last_used_h=24 * 11, history_h=24 * 85, location="Shelf B", lot_nr="OV-9107"),
            SpoolSpec(used=0.0, location="Storage Bin", price=21.99, bought_from="Amazon"),
        ],
    ),
    FilamentSpec(
        "prusament_petg_urbangrey_1000_175_p",
        drying_temp=65,
        spools=[
            SpoolSpec(
                used=0.531,
                last_used_h=24 * 13,
                history_h=24 * 65,
                location="Shelf A",
                lot_nr="24B0755",
                price=27.49,
                bought_from="Prusa Shop",
            ),
            SpoolSpec(used=0.089, last_used_h=24 * 41, history_h=24 * 44, location="Shelf A", lot_nr="24B0755"),
        ],
    ),
    FilamentSpec(
        "polymaker_petg_polylitepetgblack_1000_175_c",
        drying_temp=65,
        spools=[
            SpoolSpec(
                used=0.612,
                last_used_h=24 * 15,
                history_h=24 * 95,
                location="Voron 2.4",
                lot_nr="PM-7731",
                price=22.90,
                dried=True,
                bought_from="3DJake",
            ),
            SpoolSpec(used=0.844, last_used_h=24 * 38, history_h=24 * 110, location="Shelf C", lot_nr="PM-7731"),
            SpoolSpec(used=0.0, location="Storage Bin", price=22.90, bought_from="3DJake"),
        ],
    ),
    FilamentSpec(
        "protopasta_petg_candyappleredmetallic_500_175_c",
        spools=[
            SpoolSpec(
                used=0.351,
                last_used_h=24 * 17,
                history_h=24 * 30,
                location="Shelf B",
                price=32.00,
                bought_from="Local reseller",
                comment="Saving the rest for the enclosure badges.",
            ),
        ],
    ),
    FilamentSpec(
        "fillamentum_pla_extrafillcobaltblue_750_175_n",
        spools=[
            SpoolSpec(used=0.279, last_used_h=24 * 19, history_h=24 * 50, location="Shelf A", price=28.90),
            SpoolSpec(used=0.0, location="Dry Box 2", price=28.90, bought_from="3DJake"),
        ],
    ),
    FilamentSpec(
        "bambulab_pva_clear_500_175_n",
        drying_temp=70,
        spools=[
            SpoolSpec(
                used=0.408,
                last_used_h=24 * 22,
                history_h=24 * 75,
                location="Dry Box 3",
                lot_nr="B-2407-045",
                price=34.99,
                dried=True,
                bought_from="Amazon",
                comment="Support interface only - it drinks moisture.",
            ),
        ],
    ),
    FilamentSpec(
        "overture_abs_black_1000_175_c",
        drying_temp=80,
        spools=[
            SpoolSpec(used=0.667, last_used_h=24 * 24, history_h=24 * 130, location="Shelf C", lot_nr="OV-6620"),
            SpoolSpec(used=0.0, location="Storage Bin", price=20.99, bought_from="Amazon"),
        ],
    ),
    FilamentSpec(
        "prusament_pc-cf_pcblendcarbonfiberblack_800_175_p",
        drying_temp=100,
        spools=[
            SpoolSpec(
                used=0.144,
                last_used_h=24 * 27,
                history_h=24 * 60,
                location="Dry Box 3",
                lot_nr="24A0219",
                price=54.99,
                dried=True,
                bought_from="Prusa Shop",
                comment="Hardened nozzle only - it eats brass.",
            ),
        ],
    ),
    FilamentSpec(
        "ambrosia_pla_galacticglowgreen_1000_175_c",
        spools=[
            SpoolSpec(
                used=0.092,
                last_used_h=24 * 33,
                history_h=24 * 35,
                location="Shelf B",
                price=27.50,
                bought_from="3DJake",
            ),
        ],
    ),
    FilamentSpec(
        "prusament_pla_galaxyblack_1000_175_p",
        drying_temp=55,
        spools=[
            SpoolSpec(
                used=0.774,
                last_used_h=24 * 36,
                history_h=24 * 140,
                location="Shelf A",
                lot_nr="23K1902",
                price=29.99,
                bought_from="Prusa Shop",
            ),
            SpoolSpec(used=0.993, last_used_h=24 * 88, history_h=24 * 200, location="Shelf C", archived=True),
            SpoolSpec(used=0.0, location="Dry Box 1", price=29.99, bought_from="Prusa Shop"),
        ],
    ),
    FilamentSpec(
        "bambulab_petg_bluegray_1000_175_n",
        drying_temp=65,
        spools=[
            SpoolSpec(
                used=0.238,
                last_used_h=24 * 44,
                history_h=24 * 55,
                location="Shelf A",
                lot_nr="B-2405-771",
                price=25.99,
                bought_from="Amazon",
            ),
        ],
    ),
]


# ---------------------------------------------------------------------------
# Creation
# ---------------------------------------------------------------------------


def iso(dt: datetime) -> str:
    return dt.isoformat().replace("+00:00", "Z")


def import_external_filament(api: Api, ext: dict, drying_temp: int | None) -> dict:
    """Import a catalog entry the same way the client's "Add spools" flow does."""
    existing = api.get("/filament", {"external_id": ext["id"]})
    if existing:
        return existing[0]

    vendors = api.get("/vendor", {"external_id": ext["manufacturer"]})
    if vendors:
        vendor_id = vendors[0]["id"]
    else:
        vendor_id = api.post("/vendor", {"name": ext["manufacturer"], "external_id": ext["manufacturer"]})["id"]

    body: dict[str, Any] = {
        "name": ext["name"],
        "material": ext["material"],
        "vendor_id": vendor_id,
        "density": ext["density"],
        "diameter": ext["diameter"],
        "weight": ext["weight"],
        "external_id": ext["id"],
    }
    for key, source in (
        ("spool_weight", "spool_weight"),
        ("settings_extruder_temp", "extruder_temp"),
        ("settings_bed_temp", "bed_temp"),
    ):
        if ext.get(source) is not None:
            body[key] = ext[source]
    if ext.get("color_hexes"):
        body["multi_color_hexes"] = ",".join(h.lstrip("#") for h in ext["color_hexes"])
        if ext.get("multi_color_direction"):
            body["multi_color_direction"] = ext["multi_color_direction"]
    elif ext.get("color_hex"):
        body["color_hex"] = ext["color_hex"].lstrip("#")
    if drying_temp is not None:
        body["extra"] = {"drying_temp": json.dumps(drying_temp)}
    return api.post("/filament", body)


def create_spool(api: Api, filament: dict, spec: SpoolSpec, now: datetime, index: int) -> dict:
    # Every timestamp is derived from a single `now`, so without this they would all
    # share its minute-of-the-hour and read as generated. `index` is the spool's
    # position in the inventory, which makes the jitter stable across re-seeds.
    jitter = timedelta(minutes=(index * 37) % 60, seconds=(index * 23) % 60)

    # Consume a whole number of grams, so the list shows "342 g" rather than a
    # decimal that wraps onto a second line in the narrow weight column.
    net = filament["weight"]
    remaining = round(net * (1 - spec.used))
    body: dict[str, Any] = {
        "filament_id": filament["id"],
        "used_weight": net - remaining,
        "archived": spec.archived,
    }
    for key in ("location", "lot_nr", "price", "comment"):
        value = getattr(spec, key)
        if value is not None:
            body[key] = value

    if spec.last_used_h is not None:
        last = now - timedelta(hours=spec.last_used_h) - jitter
        first = last - timedelta(hours=spec.history_h) + jitter
        body["last_used"] = iso(last)
        body["first_used"] = iso(first)

    extra: dict[str, str] = {}
    if spec.last_used_h is not None:
        # A spool is opened a little before it is first printed with.
        extra["opened"] = json.dumps(iso(first - timedelta(hours=26) - jitter))
    if spec.dried is not None:
        extra["dried"] = json.dumps(spec.dried)
    if spec.bought_from is not None:
        extra["bought_from"] = json.dumps(spec.bought_from)
    if extra:
        body["extra"] = extra

    return api.post("/spool", body)


def seed(api: Api) -> None:
    catalog = api.get("/external/filament")
    if not catalog:
        raise RuntimeError(
            "The external filament catalog is empty. It syncs shortly after startup - "
            "wait for it, or check SPOOLMAN_EXTERNAL_DB_URL / network access."
        )
    by_id = {entry["id"]: entry for entry in catalog}
    print(f"External catalog has {len(catalog)} entries\n")

    missing = [spec.external_id for spec in INVENTORY if spec.external_id not in by_id]
    if missing:
        listing = "\n  ".join(missing)
        raise RuntimeError(
            "These curated filaments are no longer in the external catalog, so the "
            "screenshot inventory can't be rebuilt as-is. Pick replacements in "
            f"scripts/demo_seed.py:\n  {listing}",
        )

    print(f"Importing {len(INVENTORY)} filaments from the external catalog...")
    now = datetime.now(timezone.utc)
    spool_count = 0
    for spec in INVENTORY:
        ext = by_id[spec.external_id]
        filament = import_external_filament(api, ext, spec.drying_temp)
        for spool_spec in spec.spools:
            create_spool(api, filament, spool_spec, now, spool_count)
            spool_count += 1
        print(f"  {ext['manufacturer']} {ext['name']} ({ext['material']}) - {len(spec.spools)} spools")

    vendors = api.get("/vendor")
    print(f"\nDone: {len(vendors)} vendors, {len(INVENTORY)} filaments, {spool_count} spools")


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
        if isinstance(batch, dict):
            batch = batch.get("items", [])
        if not batch:
            break
        out.extend(batch)
        offset += len(batch)
        if len(batch) < page:
            break
    return out


def purge(api: Api) -> None:
    """Delete every spool, filament, vendor and extra field. Order matters: spools reference filaments."""
    for path, label in (("/spool", "spools"), ("/filament", "filaments"), ("/vendor", "vendors")):
        items = _list_all(api, path)
        for item in items:
            api.delete(f"{path}/{item['id']}")
        print(f"  deleted {len(items)} {label}")
    delete_extra_fields(api)
    print("  deleted extra field definitions")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--url", default=DEFAULT_URL, help=f"Spoolman base URL (default: {DEFAULT_URL})")
    parser.add_argument("--purge", action="store_true", help="Delete all existing data before seeding")
    parser.add_argument("--purge-only", action="store_true", help="Delete all data and exit")
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
        purge(api)
        print()
        if args.purge_only:
            return 0

    setup_extra_fields(api)
    print()

    try:
        seed(api)
    except RuntimeError as e:
        print(f"error: {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

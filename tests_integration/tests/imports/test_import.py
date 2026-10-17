"""Integration tests for importing vendors, filaments and spools."""

import csv
import io
import json

import httpx

from ..conftest import URL, assert_httpx_success

STATUS_UNPROCESSABLE = 422


def _post(entity: str, body: bytes, fmt: str = "csv", **params: str) -> httpx.Response:
    return httpx.post(
        f"{URL}/api/v1/import/{entity}",
        params={"fmt": fmt, **params},
        content=body,
        headers={"Content-Type": "application/octet-stream"},
    )


def _csv(rows: list[dict]) -> bytes:
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=list(rows[0]))
    writer.writeheader()
    writer.writerows(rows)
    return buffer.getvalue().encode()


def _delete_spool(spool_id: int) -> None:
    assert_httpx_success(httpx.delete(f"{URL}/api/v1/spool/{spool_id}"))


def _delete_filament(filament_id: int) -> None:
    assert_httpx_success(httpx.delete(f"{URL}/api/v1/filament/{filament_id}"))


def _delete_vendor(vendor_id: int) -> None:
    assert_httpx_success(httpx.delete(f"{URL}/api/v1/vendor/{vendor_id}"))


def test_import_spools_creates_the_whole_chain():
    """A spools file carries its filaments and vendors, and all three are created."""
    body = _csv(
        [
            {
                "filament.vendor.name": "ImportTest Vendor",
                "filament.name": "ImportTest Black",
                "filament.material": "PLA",
                "filament.density": "1.24",
                "filament.diameter": "1.75",
                "filament.weight": "1000",
                "remaining_weight": "800",
                "location": "ImportTest Shelf",
            },
        ],
    )

    result = _post("spools", body)
    assert_httpx_success(result)
    summary = result.json()
    assert summary["vendors"]["created"] == 1
    assert summary["filaments"]["created"] == 1
    assert summary["spools"]["created"] == 1
    assert summary["problems"] == []

    spools = httpx.get(f"{URL}/api/v1/spool", params={"location": "ImportTest Shelf"}).json()
    assert len(spools) == 1
    spool = spools[0]
    assert spool["remaining_weight"] == 800
    assert spool["filament"]["name"] == "ImportTest Black"
    assert spool["filament"]["density"] == 1.24
    assert spool["filament"]["vendor"]["name"] == "ImportTest Vendor"

    _delete_spool(spool["id"])
    _delete_filament(spool["filament"]["id"])
    _delete_vendor(spool["filament"]["vendor"]["id"])


def test_repeated_filaments_are_created_once():
    """Ten spools of one filament are one filament and one vendor, not ten of each."""
    rows = [
        {
            "filament.vendor.name": "ImportTest Vendor",
            "filament.name": "ImportTest Black",
            "filament.material": "PLA",
            "filament.density": "1.24",
            "filament.diameter": "1.75",
            "filament.weight": "1000",
            "location": "ImportTest Shelf",
        }
        for _ in range(3)
    ]

    result = _post("spools", _csv(rows))
    assert_httpx_success(result)
    summary = result.json()
    assert summary["vendors"]["created"] == 1
    assert summary["filaments"]["created"] == 1
    assert summary["spools"]["created"] == 3

    spools = httpx.get(f"{URL}/api/v1/spool", params={"location": "ImportTest Shelf"}).json()
    filament_id = spools[0]["filament"]["id"]
    vendor_id = spools[0]["filament"]["vendor"]["id"]
    assert {s["filament"]["id"] for s in spools} == {filament_id}

    for spool in spools:
        _delete_spool(spool["id"])
    _delete_filament(filament_id)
    _delete_vendor(vendor_id)


def test_dry_run_writes_nothing():
    """The counts come back, the database does not change."""
    body = _csv(
        [
            {
                "filament.vendor.name": "ImportTest DryRun",
                "filament.name": "ImportTest DryRun Black",
                "filament.material": "PLA",
                "filament.density": "1.24",
                "filament.diameter": "1.75",
                "location": "ImportTest DryRun Shelf",
            },
        ],
    )

    result = _post("spools", body, dry_run="true")
    assert_httpx_success(result)
    summary = result.json()
    assert summary["dry_run"] is True
    assert summary["spools"]["created"] == 1

    assert httpx.get(f"{URL}/api/v1/spool", params={"location": "ImportTest DryRun Shelf"}).json() == []
    assert httpx.get(f"{URL}/api/v1/vendor", params={"name": "ImportTest DryRun"}).json() == []


def test_a_bad_row_refuses_the_whole_file():
    """One row without a density means nothing at all is written."""
    body = _csv(
        [
            {
                "filament.vendor.name": "ImportTest Refused",
                "filament.name": "ImportTest Good",
                "filament.material": "PLA",
                "filament.density": "1.24",
                "filament.diameter": "1.75",
                "location": "ImportTest Refused Shelf",
            },
            {
                "filament.vendor.name": "ImportTest Refused",
                "filament.name": "ImportTest Bad",
                "filament.material": "PLA",
                "filament.density": "",
                "filament.diameter": "1.75",
                "location": "ImportTest Refused Shelf",
            },
        ],
    )

    result = _post("spools", body)
    assert result.status_code == STATUS_UNPROCESSABLE
    summary = result.json()
    assert [p["row"] for p in summary["problems"]] == [2]
    assert summary["problems"][0]["column"] == "filament.density"

    assert httpx.get(f"{URL}/api/v1/spool", params={"location": "ImportTest Refused Shelf"}).json() == []
    assert httpx.get(f"{URL}/api/v1/vendor", params={"name": "ImportTest Refused"}).json() == []


def test_export_round_trips_through_import():
    """What the export writes, the import reads back as the same spool."""
    vendor = httpx.post(f"{URL}/api/v1/vendor", json={"name": "ImportTest RoundTrip"}).json()
    filament = httpx.post(
        f"{URL}/api/v1/filament",
        json={
            "name": "ImportTest RoundTrip Black",
            "vendor_id": vendor["id"],
            "material": "PLA",
            "density": 1.24,
            "diameter": 1.75,
            "weight": 1000,
            "spool_weight": 140,
            "settings_extruder_temp": 205,
            "settings_bed_temp": 60,
            "color_hex": "0D1D08",
        },
    ).json()
    spool = httpx.post(
        f"{URL}/api/v1/spool",
        json={
            "filament_id": filament["id"],
            "remaining_weight": 800,
            "location": "ImportTest RoundTrip Shelf",
            "lot_nr": "LOT-1",
        },
    ).json()

    exported = httpx.get(f"{URL}/api/v1/export/spools", params={"fmt": "json"})
    assert_httpx_success(exported)
    rows = [r for r in exported.json() if r.get("location") == "ImportTest RoundTrip Shelf"]
    assert len(rows) == 1

    # Import the exported row back. The vendor and filament already exist, so only the
    # spool is created: the same spool twice is two real objects on a shelf.
    result = _post("spools", json.dumps(rows).encode(), fmt="json")
    assert_httpx_success(result)
    summary = result.json()
    assert summary["vendors"]["matched"] == 1
    assert summary["filaments"]["matched"] == 1
    assert summary["spools"]["created"] == 1

    spools = httpx.get(f"{URL}/api/v1/spool", params={"location": "ImportTest RoundTrip Shelf"}).json()
    assert len(spools) == 2
    copy = next(s for s in spools if s["id"] != spool["id"])
    assert copy["remaining_weight"] == spool["remaining_weight"]
    assert copy["lot_nr"] == "LOT-1"
    assert copy["filament"]["id"] == filament["id"]

    for item in spools:
        _delete_spool(item["id"])
    _delete_filament(filament["id"])
    _delete_vendor(vendor["id"])


def test_unknown_columns_are_reported():
    """Columns that describe the source database come back as ignored, not silently dropped."""
    body = _csv(
        [
            {
                "id": "99",
                "registered": "2026-09-04 12:00:26",
                "remaining_length": "268.5",
                "filament.vendor.name": "ImportTest Ignored",
                "filament.name": "ImportTest Ignored Black",
                "filament.material": "PLA",
                "filament.density": "1.24",
                "filament.diameter": "1.75",
                "location": "ImportTest Ignored Shelf",
            },
        ],
    )

    result = _post("spools", body, dry_run="true")
    assert_httpx_success(result)
    ignored = result.json()["ignored_columns"]
    assert "id" in ignored
    assert "registered" in ignored
    assert "remaining_length" in ignored


def test_unknown_extra_field_is_refused():
    """An extra field this database has never heard of names itself instead of vanishing."""
    body = _csv(
        [
            {
                "filament.vendor.name": "ImportTest Extra",
                "filament.name": "ImportTest Extra Black",
                "filament.material": "PLA",
                "filament.density": "1.24",
                "filament.diameter": "1.75",
                "extra.no_such_field": '"x"',
            },
        ],
    )

    result = _post("spools", body)
    assert result.status_code == STATUS_UNPROCESSABLE
    assert "no_such_field" in result.json()["problems"][0]["message"]


def test_import_vendors_reuses_an_existing_name():
    body = _csv([{"name": "ImportTest Reuse", "comment": "from file"}])

    first = _post("vendors", body)
    assert_httpx_success(first)
    assert first.json()["vendors"]["created"] == 1

    second = _post("vendors", body)
    assert_httpx_success(second)
    assert second.json()["vendors"]["created"] == 0
    assert second.json()["vendors"]["matched"] == 1

    vendors = httpx.get(f"{URL}/api/v1/vendor", params={"name": "ImportTest Reuse"}).json()
    assert len(vendors) == 1
    _delete_vendor(vendors[0]["id"])


def test_on_conflict_update_overwrites_the_existing_vendor():
    assert_httpx_success(_post("vendors", _csv([{"name": "ImportTest Update", "comment": "before"}])))

    result = _post("vendors", _csv([{"name": "ImportTest Update", "comment": "after"}]), on_conflict="update")
    assert_httpx_success(result)
    assert result.json()["vendors"]["updated"] == 1

    vendors = httpx.get(f"{URL}/api/v1/vendor", params={"name": "ImportTest Update"}).json()
    assert len(vendors) == 1
    assert vendors[0]["comment"] == "after"
    _delete_vendor(vendors[0]["id"])

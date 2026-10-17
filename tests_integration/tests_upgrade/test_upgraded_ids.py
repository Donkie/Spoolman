"""Checks that a CockroachDB upgraded from pre-#797 IDs works from the web UI's side.

tests_integration/upgrade/harness.py seeds and upgrades the database before Spoolman starts, and
leaves a manifest with the natural key, old ID and new ID of every row. These tests only use the
REST API, and read every response the way the web UI's JavaScript does, so an ID it would round
shows up here just like it did in #797.
"""

from typing import Any

import httpx
import pytest

from .conftest import URL, js_json

UNSAFE_ID = 2**53

# Table, listing and natural key of everything the web UI addresses by ID.
ENTITIES = (
    ("vendor", "vendor", "name"),
    ("filament", "filament", "name"),
    ("spool", "spool?allow_archived=true", "comment"),
)


def migrated(manifest: dict[str, Any], table: str) -> list[str]:
    """Get the natural keys of the rows that started out with an unsafe ID."""
    return sorted(key for key, old_id in manifest["old_ids"][table].items() if old_id >= UNSAFE_ID)


def test_the_old_ids_were_unsafe(manifest: dict[str, Any]):
    """Every table started out with IDs JavaScript rounds, or the rest proves nothing."""
    for table, _, _ in ENTITIES:
        assert any(int(float(old_id)) != old_id for old_id in manifest["old_ids"][table].values()), table


@pytest.mark.parametrize(("table", "listing", "key"), ENTITIES)
def test_every_row_is_addressable_by_the_id_the_web_ui_reads(
    manifest: dict[str, Any],
    table: str,
    listing: str,
    key: str,
):
    """The IDs in a listing come through JavaScript intact and lead back to the same row."""
    with httpx.Client(base_url=f"{URL}/api/v1") as client:
        listed = {item[key]: item["id"] for item in js_json(client.get(listing))}
        assert listed == manifest["ids"][table]
        for natural_key, item_id in listed.items():
            assert js_json(client.get(f"{table}/{item_id}"))[key] == natural_key
        # And the row is no longer at its old ID.
        old_id = manifest["old_ids"][table][migrated(manifest, table)[0]]
        assert client.get(f"{table}/{old_id}").status_code == 404


def test_references_extra_fields_and_tags_survived(manifest: dict[str, Any]):
    """Every row still points at the same rows and carries the same extra fields and tags."""
    rows = manifest["rows"]
    vendors = {item["name"]: item for item in js_json(httpx.get(f"{URL}/api/v1/vendor"))}
    filaments = {item["name"]: item for item in js_json(httpx.get(f"{URL}/api/v1/filament"))}
    spools = {item["comment"]: item for item in js_json(httpx.get(f"{URL}/api/v1/spool?allow_archived=true"))}

    vendor_of = {row["name"]: row["vendor_id"] for row in rows["filament"]}
    for name, filament in filaments.items():
        vendor = filament.get("vendor")
        assert (vendor and vendor["name"], vendor and vendor["id"]) == (
            vendor_of[name],
            manifest["ids"]["vendor"].get(vendor_of[name]),
        )
    for row in rows["spool"]:
        spool = spools[row["comment"]]
        assert spool["filament"]["name"] == row["filament_id"]
        assert spool["filament"]["id"] == manifest["ids"]["filament"][row["filament_id"]]
        assert spool["filament"].get("vendor", {}).get("name") == vendor_of[row["filament_id"]]
        assert spool["archived"] == row["archived"]

    for table, items, owner in (
        ("vendor_field", vendors, "vendor_id"),
        ("filament_field", filaments, "filament_id"),
        ("spool_field", spools, "spool_id"),
    ):
        extra: dict[str, dict[str, str]] = {}
        for row in rows[table]:
            extra.setdefault(row[owner], {})[row["key"]] = row["value"]
        assert {name: item["extra"] for name, item in items.items() if item["extra"]} == extra

    for items, owner in ((spools, "spool_id"), (filaments, "filament_id")):
        tags = {}
        for row in rows["tag"]:
            if row[owner] is not None:
                tags.setdefault(row[owner], []).append((row["uid"], row["format"]))
        assert {
            name: sorted((tag["uid"], tag.get("format")) for tag in item["tags"])
            for name, item in items.items()
            if item["tags"]
        } == {name: sorted(uids) for name, uids in tags.items()}


def test_tag_scans_find_the_renumbered_rows(manifest: dict[str, Any]):
    """A scanned tag resolves to the new ID of its spool or filament."""
    for row in manifest["rows"]["tag"]:
        result = js_json(httpx.post(f"{URL}/api/v1/tag/scan", json={"uid": row["uid"]}))
        assert (result["matched_spool_id"], result["matched_filament_id"]) == (
            manifest["ids"]["spool"].get(row["spool_id"]),
            manifest["ids"]["filament"].get(row["filament_id"]),
        )


# The tests from here on change rows, so they have to run after the ones above, which compare
# every row to the manifest. pytest runs them in file order.


def test_migrated_rows_can_be_edited(manifest: dict[str, Any]):
    """The web UI's edit flows work on renumbered rows."""
    spool_id = manifest["ids"]["spool"][migrated(manifest, "spool")[0]]
    spool = js_json(httpx.patch(f"{URL}/api/v1/spool/{spool_id}", json={"location": "Moved"}))
    assert (spool["id"], spool["location"]) == (spool_id, "Moved")

    filament_id = manifest["ids"]["filament"][migrated(manifest, "filament")[0]]
    js_json(httpx.post(f"{URL}/api/v1/filament/{filament_id}/tag", json={"uid": "04:FF:FF:FF:FF:FF:01"}))
    assert "04FFFFFFFFFF01" in [
        tag["uid"] for tag in js_json(httpx.get(f"{URL}/api/v1/filament/{filament_id}"))["tags"]
    ]
    assert httpx.delete(f"{URL}/api/v1/filament/{filament_id}/tag/04FFFFFFFFFF01").status_code == 204
    assert "04FFFFFFFFFF01" not in [
        tag["uid"] for tag in js_json(httpx.get(f"{URL}/api/v1/filament/{filament_id}"))["tags"]
    ]


def test_deleting_a_migrated_filament_still_unlinks_its_tags(manifest: dict[str, Any]):
    """The tag foreign keys survived the renumbering."""
    name = manifest["deletable_filament"]
    uids = [row["uid"] for row in manifest["rows"]["tag"] if row["filament_id"] == name]
    assert uids

    js_json(httpx.delete(f"{URL}/api/v1/filament/{manifest['ids']['filament'][name]}"))
    for uid in uids:
        assert js_json(httpx.post(f"{URL}/api/v1/tag/scan", json={"uid": uid}))["matched_filament_id"] is None


def test_new_rows_get_safe_ids_after_the_migrated_ones(manifest: dict[str, Any]):
    """Rows created after the upgrade continue from the sequences, not from unique_rowid()."""
    ids = manifest["ids"]
    vendor = js_json(httpx.post(f"{URL}/api/v1/vendor", json={"name": "new vendor"}))
    second_vendor = js_json(httpx.post(f"{URL}/api/v1/vendor", json={"name": "second new vendor"}))
    assert max(ids["vendor"].values()) < vendor["id"] < UNSAFE_ID
    assert second_vendor["id"] == vendor["id"] + 1

    filament = js_json(
        httpx.post(
            f"{URL}/api/v1/filament",
            json={"name": "new filament", "vendor_id": vendor["id"], "density": 1.24, "diameter": 1.75},
        ),
    )
    assert max(ids["filament"].values()) < filament["id"] < UNSAFE_ID

    spool = js_json(httpx.post(f"{URL}/api/v1/spool", json={"filament_id": filament["id"]}))
    assert max(ids["spool"].values()) < spool["id"] < UNSAFE_ID
    assert js_json(httpx.get(f"{URL}/api/v1/spool/{spool['id']}"))["filament"]["vendor"]["id"] == vendor["id"]

"""Integration tests for renaming one value of a spool field everywhere it occurs."""

import json
import uuid
from collections.abc import Iterable
from dataclasses import dataclass
from typing import Any

import httpx
import pytest

from ..conftest import URL


def rename_url(field: str) -> str:
    """Build the rename endpoint URL for one spool field."""
    return f"{URL}/api/v1/spool/field/{field}"


def _spool(spool_id: int) -> dict[str, Any]:
    result = httpx.get(f"{URL}/api/v1/spool/{spool_id}")
    result.raise_for_status()
    return result.json()


@dataclass
class Fixture:
    filament_id: int
    field_key: str
    #: shelf value -> spool ids, plus one archived spool on "Bottom".
    spools: dict[str, list[int]]
    archived_id: int

    @property
    def all_ids(self) -> list[int]:
        """Every spool this fixture created, across all shelf values."""
        return [*(i for ids in self.spools.values() for i in ids)]


@pytest.fixture
def shelf_spools(random_filament: dict[str, Any]) -> Iterable[Fixture]:
    """Spools on a "shelf" text field: two on Bottom (one of them archived), one on Top."""
    field_key = f"shelf_{uuid.uuid4().hex[:8]}"
    httpx.post(
        f"{URL}/api/v1/field/spool/{field_key}",
        json={"name": "Shelf", "field_type": "text"},
    ).raise_for_status()

    filament_id = random_filament["id"]

    def _make(shelf: str, *, archived: bool = False) -> int:
        result = httpx.post(
            f"{URL}/api/v1/spool",
            json={
                "filament_id": filament_id,
                "archived": archived,
                "location": shelf,
                "extra": {field_key: json.dumps(shelf)},
            },
        )
        result.raise_for_status()
        return result.json()["id"]

    archived_id = _make("Bottom", archived=True)
    spools = {"Bottom": [_make("Bottom"), archived_id], "Top": [_make("Top")]}

    yield Fixture(filament_id=filament_id, field_key=field_key, spools=spools, archived_id=archived_id)

    for spool_id in spools["Bottom"] + spools["Top"]:
        httpx.delete(f"{URL}/api/v1/spool/{spool_id}").raise_for_status()
    httpx.delete(f"{URL}/api/v1/field/spool/{field_key}").raise_for_status()


def test_rename_extra_field_value(shelf_spools: Fixture):
    """Renaming an extra-field value changes every spool holding it, archived ones included."""
    result = httpx.patch(
        rename_url(f"extra.{shelf_spools.field_key}"),
        json={"value": "Bottom", "new_value": "Lower"},
    )
    result.raise_for_status()
    assert result.json() == {"spools_updated": 2}

    for spool_id in shelf_spools.spools["Bottom"]:
        # The stored value is JSON-encoded, and readable back as the plain new value.
        assert _spool(spool_id)["extra"][shelf_spools.field_key] == json.dumps("Lower")
    # The other group is untouched.
    assert _spool(shelf_spools.spools["Top"][0])["extra"][shelf_spools.field_key] == json.dumps("Top")


def test_renamed_extra_field_value_is_visible_to_grouping(shelf_spools: Fixture):
    """After a rename the group endpoint reports the new key, and the old one is gone."""
    group_by = f"extra.{shelf_spools.field_key}"
    httpx.patch(rename_url(group_by), json={"value": "Bottom", "new_value": "Lower"}).raise_for_status()

    result = httpx.get(
        f"{URL}/api/v1/spool/group",
        params={
            "group_by": group_by,
            "allow_archived": "true",
            "filament.id": str(shelf_spools.filament_id),
        },
    )
    result.raise_for_status()
    counts = {group.get("key"): group["spool_count"] for group in result.json()}
    assert counts == {"Lower": 2, "Top": 1}


def test_rename_location_value(shelf_spools: Fixture):
    """The same endpoint renames a location, matching the dedicated location endpoint."""
    result = httpx.patch(rename_url("location"), json={"value": "Bottom", "new_value": "Lower"})
    result.raise_for_status()
    assert result.json() == {"spools_updated": 2}

    for spool_id in shelf_spools.spools["Bottom"]:
        assert _spool(spool_id)["location"] == "Lower"
    assert _spool(shelf_spools.spools["Top"][0])["location"] == "Top"


def test_rename_value_merges_into_existing(shelf_spools: Fixture):
    """Renaming onto a value already in use merges the two rather than failing."""
    group_by = f"extra.{shelf_spools.field_key}"
    result = httpx.patch(rename_url(group_by), json={"value": "Bottom", "new_value": "Top"})
    result.raise_for_status()
    assert result.json() == {"spools_updated": 2}

    for spool_id in shelf_spools.all_ids:
        assert _spool(spool_id)["extra"][shelf_spools.field_key] == json.dumps("Top")


def test_rename_absent_value_is_a_no_op(shelf_spools: Fixture):
    """Renaming a value nothing holds changes nothing, and isn't an error."""
    result = httpx.patch(
        rename_url(f"extra.{shelf_spools.field_key}"),
        json={"value": "Nowhere", "new_value": "Somewhere"},
    )
    result.raise_for_status()
    assert result.json() == {"spools_updated": 0}


def test_rename_rejects_fields_the_spool_does_not_own():
    """material/vendor/filament belong to another entity, so they can't be renamed here."""
    for field in ("material", "vendor", "filament"):
        result = httpx.patch(rename_url(field), json={"value": "PLA", "new_value": "PETG"})
        assert result.status_code == 400, field


def test_rename_rejects_unknown_extra_field():
    """An extra field that isn't registered can't be renamed."""
    result = httpx.patch(rename_url("extra.does_not_exist"), json={"value": "a", "new_value": "b"})
    assert result.status_code == 400


def test_rename_rejects_multi_value_extra_field():
    """A field that doesn't hold one plain string has no single value to rename."""
    numeric_key = f"count_{uuid.uuid4().hex[:8]}"
    httpx.post(
        f"{URL}/api/v1/field/spool/{numeric_key}",
        json={"name": "Count", "field_type": "integer"},
    ).raise_for_status()
    try:
        result = httpx.patch(rename_url(f"extra.{numeric_key}"), json={"value": "1", "new_value": "2"})
        assert result.status_code == 400
    finally:
        httpx.delete(f"{URL}/api/v1/field/spool/{numeric_key}").raise_for_status()


def test_rename_rejects_empty_values():
    """Neither the value being renamed nor its replacement may be empty."""
    for body in (
        {"value": "", "new_value": "Somewhere"},
        {"value": "Somewhere", "new_value": ""},
    ):
        assert httpx.patch(rename_url("location"), json=body).status_code == 422


def test_rename_location_rejects_too_long_a_value():
    """The location column is 64 characters, so an over-long value is a 400 and not a crash."""
    result = httpx.patch(rename_url("location"), json={"value": "Bottom", "new_value": "x" * 65})
    assert result.status_code == 400

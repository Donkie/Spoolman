"""Integration tests for the Spool API endpoint."""

from collections.abc import Iterable
from dataclasses import dataclass
from typing import Any

import httpx
import pytest

URL = "http://spoolman:8000"


def spool_lists_equal(a: Iterable[dict[str, Any]], b: Iterable[dict[str, Any]]) -> bool:
    """Compare two lists of spools where the order of the spools is not guaranteed."""
    return sorted(a, key=lambda x: x["id"]) == sorted(b, key=lambda x: x["id"])


@dataclass
class Fixture:
    spools: list[dict[str, Any]]
    spools_by_id: dict[str, dict[str, Any]]
    filament: dict[str, Any]


@pytest.fixture(scope="module")
def spools(
    random_filament_mod: dict[str, Any],
    random_empty_filament_mod: dict[str, Any],
    random_empty_filament_empty_vendor_mod: dict[str, Any],
) -> Iterable[Fixture]:
    """Add some spools to the database."""
    result = httpx.post(
        f"{URL}/api/v1/spool",
        json={
            "filament_id": random_filament_mod["id"],
            "remaining_weight": 1000,
            "location": "The Pantry",
            "lot_nr": "123456789",
        },
    )
    result.raise_for_status()
    spool_1 = result.json()

    result = httpx.post(
        f"{URL}/api/v1/spool",
        json={
            "filament_id": random_filament_mod["id"],
            "remaining_weight": 1000,
            "location": "Living Room",
            "lot_nr": "987654321",
        },
    )
    result.raise_for_status()
    spool_2 = result.json()

    result = httpx.post(
        f"{URL}/api/v1/spool",
        json={
            "filament_id": random_filament_mod["id"],
            "remaining_weight": 1000,
            "archived": True,
        },
    )
    result.raise_for_status()
    spool_3 = result.json()

    result = httpx.post(
        f"{URL}/api/v1/spool",
        json={
            "filament_id": random_empty_filament_mod["id"],
        },
    )
    result.raise_for_status()
    spool_4 = result.json()

    result = httpx.post(
        f"{URL}/api/v1/spool",
        json={
            "filament_id": random_empty_filament_empty_vendor_mod["id"],
        },
    )
    result.raise_for_status()
    spool_5 = result.json()

    added_spools_by_id = {
        spool_1["id"]: spool_1,
        spool_2["id"]: spool_2,
        spool_3["id"]: spool_3,
        spool_4["id"]: spool_4,
        spool_5["id"]: spool_5,
    }

    yield Fixture(
        spools=[spool_1, spool_2, spool_3, spool_4, spool_5],
        spools_by_id=added_spools_by_id,
        filament=random_filament_mod,
    )

    httpx.delete(f"{URL}/api/v1/spool/{spool_1['id']}").raise_for_status()
    httpx.delete(f"{URL}/api/v1/spool/{spool_2['id']}").raise_for_status()
    httpx.delete(f"{URL}/api/v1/spool/{spool_3['id']}").raise_for_status()
    httpx.delete(f"{URL}/api/v1/spool/{spool_4['id']}").raise_for_status()
    httpx.delete(f"{URL}/api/v1/spool/{spool_5['id']}").raise_for_status()


def test_find_all_spools(spools: Fixture):
    # Execute
    result = httpx.get(f"{URL}/api/v1/spool")
    result.raise_for_status()

    # Verify
    spools_result = result.json()
    assert spool_lists_equal(spools_result, (spools.spools[0], spools.spools[1], spools.spools[3], spools.spools[4]))


def test_find_all_spools_including_archived(spools: Fixture):
    # Execute
    result = httpx.get(f"{URL}/api/v1/spool?allow_archived=true")
    result.raise_for_status()

    # Verify
    spools_result = result.json()
    assert spool_lists_equal(
        spools_result,
        (
            spools.spools[0],
            spools.spools[1],
            spools.spools[2],
            spools.spools[3],
            spools.spools[4],
        ),
    )


def test_find_all_spools_sort_asc(spools: Fixture):
    # Execute
    result = httpx.get(f"{URL}/api/v1/spool?sort=location:asc")
    result.raise_for_status()

    # Verify
    spools_result = result.json()
    assert len(spools_result) == 4
    assert spools_result[3] == spools.spools[0]


def test_find_all_spools_sort_desc(spools: Fixture):
    # Execute
    result = httpx.get(f"{URL}/api/v1/spool?sort=location:desc")
    result.raise_for_status()

    # Verify
    spools_result = result.json()
    assert len(spools_result) == 4
    assert spools_result[0] == spools.spools[0]


def test_find_all_spools_limit_asc(spools: Fixture):
    # Execute
    result = httpx.get(f"{URL}/api/v1/spool?sort=id:asc&limit=2")
    result.raise_for_status()

    # Verify
    spools_result = result.json()
    assert len(spools_result) == 2
    assert spools_result == [spools.spools[0], spools.spools[1]]


def test_find_all_spools_limit_desc(spools: Fixture):
    # Execute
    result = httpx.get(f"{URL}/api/v1/spool?sort=id:desc&limit=2")
    result.raise_for_status()

    # Verify
    spools_result = result.json()
    assert len(spools_result) == 2
    assert spools_result == [spools.spools[-1], spools.spools[-2]]


def test_find_all_spools_limit_asc_offset(spools: Fixture):
    # Execute
    result = httpx.get(f"{URL}/api/v1/spool?sort=id:asc&limit=2&offset=1&allow_archived=true")
    result.raise_for_status()

    # Verify
    spools_result = result.json()
    assert len(spools_result) == 2
    assert spools_result == [spools.spools[1], spools.spools[2]]


def test_find_all_spools_limit_desc_offset(spools: Fixture):
    # Execute
    result = httpx.get(f"{URL}/api/v1/spool?sort=id:desc&limit=2&offset=1&allow_archived=true")
    result.raise_for_status()

    # Verify
    spools_result = result.json()
    assert len(spools_result) == 2
    assert spools_result == [spools.spools[-2], spools.spools[-3]]


def test_find_all_spools_limit_asc_offset_outside_range(spools: Fixture):  # noqa: ARG001
    # Execute
    result = httpx.get(f"{URL}/api/v1/spool?sort=id:asc&limit=2&offset=100")
    result.raise_for_status()

    # Verify
    spools_result = result.json()
    assert len(spools_result) == 0


@pytest.mark.parametrize(
    "field_name",
    [
        "id",
        "registered",
        "first_used",
        "last_used",
        "filament_id",
        "used_weight",
        "location",
        "lot_nr",
        "comment",
        "archived",
        "filament.id",
        "filament.registered",
        "filament.name",
        "filament.vendor_id",
        "filament.material",
        "filament.price",
        "filament.density",
        "filament.diameter",
        "filament.weight",
        "filament.spool_weight",
        "filament.article_number",
        "filament.comment",
        "filament.settings_extruder_temp",
        "filament.settings_bed_temp",
        "filament.color_hex",
        "filament.vendor.id",
        "filament.vendor.registered",
        "filament.vendor.name",
        "filament.vendor.comment",
    ],
)
def test_find_all_spools_sort_fields(spools: Fixture, field_name: str):  # noqa: ARG001
    """Test sorting by all fields."""
    # Execute
    result = httpx.get(f"{URL}/api/v1/spool?sort={field_name}:asc")
    result.raise_for_status()

    # Verify
    spools_result = result.json()
    assert len(spools_result) == 4


@pytest.mark.parametrize("field_name", ["filament_name", "filament.name"])
def test_find_spools_by_filament_name(spools: Fixture, field_name: str):
    # Execute
    result = httpx.get(
        f"{URL}/api/v1/spool",
        params={field_name: spools.filament["name"]},
    )
    result.raise_for_status()

    # Verify
    spools_result = result.json()
    assert spool_lists_equal(spools_result, (spools.spools[0], spools.spools[1]))


def test_find_spools_by_empty_filament_name(spools: Fixture):
    # Execute
    result = httpx.get(
        f"{URL}/api/v1/spool",
        params={"filament.name": ""},
    )
    result.raise_for_status()

    # Verify
    spools_result = result.json()
    assert spool_lists_equal(spools_result, (spools.spools[3], spools.spools[4]))


@pytest.mark.parametrize("field_name", ["filament_id", "filament.id"])
def test_find_spools_by_filament_id(spools: Fixture, field_name: str):
    # Execute
    result = httpx.get(
        f"{URL}/api/v1/spool",
        params={field_name: spools.filament["id"]},
    )
    result.raise_for_status()

    # Verify
    spools_result = result.json()
    assert spool_lists_equal(spools_result, (spools.spools[0], spools.spools[1]))


@pytest.mark.parametrize("field_name", ["filament_material", "filament.material"])
def test_find_spools_by_filament_material(spools: Fixture, field_name: str):
    # Execute
    result = httpx.get(
        f"{URL}/api/v1/spool",
        params={field_name: spools.filament["material"]},
    )
    result.raise_for_status()

    # Verify
    spools_result = result.json()
    assert spool_lists_equal(spools_result, (spools.spools[0], spools.spools[1]))


def test_find_spools_by_empty_filament_material(spools: Fixture):
    # Execute
    result = httpx.get(
        f"{URL}/api/v1/spool",
        params={"filament.material": ""},
    )
    result.raise_for_status()

    # Verify
    spools_result = result.json()
    assert spool_lists_equal(spools_result, (spools.spools[3], spools.spools[4]))


@pytest.mark.parametrize("field_name", ["vendor_name", "vendor.name"])
def test_find_spools_by_filament_vendor_name(spools: Fixture, field_name: str):
    # Execute
    result = httpx.get(
        f"{URL}/api/v1/spool",
        params={field_name: spools.filament["vendor"]["name"]},
    )
    result.raise_for_status()

    # Verify
    spools_result = result.json()
    assert spool_lists_equal(spools_result, (spools.spools[0], spools.spools[1]))


def test_find_spools_by_empty_filament_vendor_name(spools: Fixture):
    # Execute
    result = httpx.get(
        f"{URL}/api/v1/spool",
        params={"vendor.name": ""},
    )
    result.raise_for_status()

    # Verify
    spools_result = result.json()
    assert spools_result == [spools.spools[4]]


@pytest.mark.parametrize("field_name", ["vendor_id", "vendor.id"])
def test_find_spools_by_filament_vendor_id(spools: Fixture, field_name: str):
    # Execute
    result = httpx.get(
        f"{URL}/api/v1/spool",
        params={field_name: spools.filament["vendor"]["id"]},
    )
    result.raise_for_status()

    # Verify
    spools_result = result.json()
    assert spool_lists_equal(spools_result, (spools.spools[0], spools.spools[1]))


def test_find_spools_by_empty_filament_vendor_id(spools: Fixture):
    # Execute
    result = httpx.get(
        f"{URL}/api/v1/spool",
        params={"vendor.id": -1},
    )
    result.raise_for_status()

    # Verify
    spools_result = result.json()
    assert spools_result == [spools.spools[3]]


def test_find_spools_by_location(spools: Fixture):
    # Execute
    result = httpx.get(
        f"{URL}/api/v1/spool",
        params={"location": "The Pantry"},
    )
    result.raise_for_status()

    # Verify
    spools_result = result.json()
    assert spools_result == [spools.spools[0]]


def test_find_spools_by_empty_location(spools: Fixture):
    # Execute
    result = httpx.get(
        f"{URL}/api/v1/spool",
        params={"location": ""},
    )
    result.raise_for_status()

    # Verify
    spools_result = result.json()
    assert spool_lists_equal(spools_result, (spools.spools[3], spools.spools[4]))


def test_find_spools_by_lot_nr(spools: Fixture):
    # Execute
    result = httpx.get(
        f"{URL}/api/v1/spool",
        params={"lot_nr": "123456789"},
    )
    result.raise_for_status()

    # Verify
    spools_result = result.json()
    assert spools_result == [spools.spools[0]]


def test_find_spools_by_empty_lot_nr(spools: Fixture):
    # Execute
    result = httpx.get(
        f"{URL}/api/v1/spool",
        params={"lot_nr": ""},
    )
    result.raise_for_status()

    # Verify
    spools_result = result.json()
    assert spool_lists_equal(spools_result, (spools.spools[3], spools.spools[4]))

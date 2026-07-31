"""Integration tests for the Spool API endpoint."""

from collections.abc import Iterable
from dataclasses import dataclass
from typing import Any

import httpx
import pytest

from ..conftest import URL, assert_lists_compatible


@dataclass
class Fixture:
    spools: list[dict[str, Any]]
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
            "used_weight": 1000,
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

    yield Fixture(
        spools=[spool_1, spool_2, spool_3, spool_4, spool_5],
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
    assert_lists_compatible(
        spools_result,
        (spools.spools[0], spools.spools[1], spools.spools[3], spools.spools[4]),
    )


def test_find_all_spools_including_archived(spools: Fixture):
    # Execute
    result = httpx.get(f"{URL}/api/v1/spool?allow_archived=true")
    result.raise_for_status()

    # Verify
    spools_result = result.json()
    assert_lists_compatible(
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
    result = httpx.get(f"{URL}/api/v1/spool?sort=id:asc&allow_archived=true")
    result.raise_for_status()

    # Verify
    spools_result = result.json()
    assert len(spools_result) == len(spools.spools)
    assert spools_result[0] == spools.spools[0]


def test_find_all_spools_sort_desc(spools: Fixture):
    # Execute
    result = httpx.get(f"{URL}/api/v1/spool?sort=id:desc&allow_archived=true")
    result.raise_for_status()

    # Verify
    spools_result = result.json()
    assert len(spools_result) == len(spools.spools)
    assert spools_result[-1] == spools.spools[0]


def test_find_all_spools_sort_multiple(spools: Fixture):
    # Execute
    result = httpx.get(f"{URL}/api/v1/spool?sort=used_weight:desc,id:asc&allow_archived=true")
    result.raise_for_status()

    # Verify
    spools_result = result.json()
    assert len(spools_result) == len(spools.spools)
    assert spools_result == [spools.spools[3], spools.spools[0], spools.spools[1], spools.spools[2], spools.spools[4]]


def test_find_all_spools_limit_asc(spools: Fixture):
    # Execute
    result = httpx.get(f"{URL}/api/v1/spool?sort=id:asc&limit=2")
    result.raise_for_status()

    # Verify
    assert result.headers["X-Total-Count"] == "4"
    spools_result = result.json()
    assert len(spools_result) == 2
    assert spools_result == [spools.spools[0], spools.spools[1]]


def test_find_all_spools_limit_desc(spools: Fixture):
    # Execute
    result = httpx.get(f"{URL}/api/v1/spool?sort=id:desc&limit=2")
    result.raise_for_status()

    # Verify
    assert result.headers["X-Total-Count"] == "4"
    spools_result = result.json()
    assert len(spools_result) == 2
    assert spools_result == [spools.spools[-1], spools.spools[-2]]


def test_find_all_spools_limit_asc_offset(spools: Fixture):
    # Execute
    result = httpx.get(f"{URL}/api/v1/spool?sort=id:asc&limit=2&offset=1&allow_archived=true")
    result.raise_for_status()

    # Verify
    assert result.headers["X-Total-Count"] == "5"
    spools_result = result.json()
    assert len(spools_result) == 2
    assert spools_result == [spools.spools[1], spools.spools[2]]


def test_find_all_spools_limit_desc_offset(spools: Fixture):
    # Execute
    result = httpx.get(f"{URL}/api/v1/spool?sort=id:desc&limit=2&offset=1&allow_archived=true")
    result.raise_for_status()

    # Verify
    assert result.headers["X-Total-Count"] == "5"
    spools_result = result.json()
    assert len(spools_result) == 2
    assert spools_result == [spools.spools[-2], spools.spools[-3]]


def test_find_all_spools_limit_asc_offset_outside_range(spools: Fixture):  # noqa: ARG001
    # Execute
    result = httpx.get(f"{URL}/api/v1/spool?sort=id:asc&limit=2&offset=100")
    result.raise_for_status()

    # Verify
    assert result.headers["X-Total-Count"] == "4"
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
        "remaining_weight",
        "used_length",
        "remaining_length",
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
def test_find_all_spools_sort_fields(spools: Fixture, field_name: str):
    """Test sorting by all fields."""
    # Execute
    result = httpx.get(f"{URL}/api/v1/spool?sort={field_name}:asc&allow_archived=true")
    result.raise_for_status()

    # Verify
    spools_result = result.json()
    assert len(spools_result) == len(spools.spools)


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
    assert_lists_compatible(spools_result, (spools.spools[0], spools.spools[1]))


def test_find_spools_by_empty_filament_name(spools: Fixture):
    # Execute
    result = httpx.get(
        f"{URL}/api/v1/spool",
        params={"filament.name": ""},
    )
    result.raise_for_status()

    # Verify
    spools_result = result.json()
    assert_lists_compatible(spools_result, (spools.spools[3], spools.spools[4]))


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
    assert_lists_compatible(spools_result, (spools.spools[0], spools.spools[1]))


def test_find_spools_by_multiple_filament_ids(spools: Fixture):
    # Execute
    filament_1 = spools.spools[0]["filament"]["id"]
    filament_2 = spools.spools[3]["filament"]["id"]

    result = httpx.get(
        f"{URL}/api/v1/spool",
        params={"filament.id": f"{filament_1},{filament_2}"},
    )
    result.raise_for_status()

    # Verify
    spools_result = result.json()
    assert_lists_compatible(spools_result, (spools.spools[0], spools.spools[1], spools.spools[3]))


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
    assert_lists_compatible(spools_result, (spools.spools[0], spools.spools[1]))


def test_find_spools_by_empty_filament_material(spools: Fixture):
    # Execute
    result = httpx.get(
        f"{URL}/api/v1/spool",
        params={"filament.material": ""},
    )
    result.raise_for_status()

    # Verify
    spools_result = result.json()
    assert_lists_compatible(spools_result, (spools.spools[3], spools.spools[4]))


@pytest.mark.parametrize("field_name", ["vendor_name", "filament.vendor.name"])
def test_find_spools_by_filament_vendor_name(spools: Fixture, field_name: str):
    # Execute
    result = httpx.get(
        f"{URL}/api/v1/spool",
        params={field_name: spools.filament["vendor"]["name"]},
    )
    result.raise_for_status()

    # Verify
    spools_result = result.json()
    assert_lists_compatible(spools_result, (spools.spools[0], spools.spools[1]))


def test_find_spools_by_empty_filament_vendor_name(spools: Fixture):
    # Execute
    result = httpx.get(
        f"{URL}/api/v1/spool",
        params={"filament.vendor.name": ""},
    )
    result.raise_for_status()

    # Verify
    spools_result = result.json()
    assert spools_result == [spools.spools[4]]


@pytest.mark.parametrize("field_name", ["vendor_id", "filament.vendor.id"])
def test_find_spools_by_filament_vendor_id(spools: Fixture, field_name: str):
    # Execute
    result = httpx.get(
        f"{URL}/api/v1/spool",
        params={field_name: spools.filament["vendor"]["id"]},
    )
    result.raise_for_status()

    # Verify
    spools_result = result.json()
    assert_lists_compatible(spools_result, (spools.spools[0], spools.spools[1]))


def test_find_spools_by_multiple_vendor_ids(spools: Fixture):
    # Execute
    vendor_1 = spools.spools[0]["filament"]["vendor"]["id"]
    vendor_2 = spools.spools[4]["filament"]["vendor"]["id"]

    result = httpx.get(
        f"{URL}/api/v1/spool",
        params={
            "filament.vendor.id": f"{vendor_1},{vendor_2}",
            "allow_archived": True,
        },
    )
    result.raise_for_status()

    # Verify
    spools_result = result.json()
    assert len(spools_result) == 4
    assert_lists_compatible(
        spools_result,
        (spools.spools[0], spools.spools[1], spools.spools[2], spools.spools[4]),
    )


def test_find_spools_by_empty_filament_vendor_id(spools: Fixture):
    # Execute
    result = httpx.get(
        f"{URL}/api/v1/spool",
        params={"filament.vendor.id": -1},
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
    assert_lists_compatible(spools_result, (spools.spools[3], spools.spools[4]))


def test_find_spools_by_empty_and_filled_location(spools: Fixture):
    # Execute
    result = httpx.get(
        f"{URL}/api/v1/spool",
        params={"location": "The Pantry,"},
    )
    result.raise_for_status()

    # Verify
    spools_result = result.json()
    assert_lists_compatible(spools_result, (spools.spools[0], spools.spools[3], spools.spools[4]))


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
    assert_lists_compatible(spools_result, (spools.spools[3], spools.spools[4]))


@pytest.mark.parametrize("order", ["desc", "asc"])
def test_find_spools_sort_last_used_puts_never_used_last(random_filament: dict[str, Any], order: str):
    """Spools that have never been used sort last, in both directions.

    `last_used` is NULL until a spool is first used, and the databases disagree on where a NULL
    goes: PostgreSQL and CockroachDB put it first on DESC, SQLite and MariaDB first on ASC. The
    library's default "last used, newest first" ordering therefore led with every never-used
    spool on PostgreSQL (#984, #985). An absent date sorts last either way round.
    """
    filament_id = random_filament["id"]
    spool_ids: list[int] = []
    for _ in range(3):
        result = httpx.post(f"{URL}/api/v1/spool", json={"filament_id": filament_id})
        result.raise_for_status()
        spool_ids.append(result.json()["id"])

    try:
        # Use the middle spool only; the other two keep a NULL last_used.
        httpx.put(f"{URL}/api/v1/spool/{spool_ids[1]}/use", json={"use_weight": 100}).raise_for_status()

        result = httpx.get(
            f"{URL}/api/v1/spool", params={"filament.id": str(filament_id), "sort": f"last_used:{order}"}
        )
        result.raise_for_status()

        spools_result = result.json()
        assert len(spools_result) == 3
        assert spools_result[0]["id"] == spool_ids[1]
        assert all(spool.get("last_used") is None for spool in spools_result[1:])
    finally:
        for spool_id in spool_ids:
            httpx.delete(f"{URL}/api/v1/spool/{spool_id}").raise_for_status()

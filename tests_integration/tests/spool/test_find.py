"""Integration tests for the Spool API endpoint."""

from collections.abc import Iterator
from dataclasses import dataclass
from typing import Any

import httpx
import pytest

URL = "http://spoolman:8000"


@dataclass
class Fixture:
    spools: list[dict[str, Any]]
    spools_by_id: dict[str, dict[str, Any]]
    filament: dict[str, Any]


@pytest.fixture()
def spools(random_filament: dict[str, Any]) -> Iterator[Fixture]:
    """Add some spools to the database."""
    result = httpx.post(
        f"{URL}/api/v1/spool",
        json={
            "filament_id": random_filament["id"],
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
            "filament_id": random_filament["id"],
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
            "filament_id": random_filament["id"],
            "remaining_weight": 1000,
            "archived": True,
        },
    )
    result.raise_for_status()
    spool_3 = result.json()

    added_spools_by_id = {
        spool_1["id"]: spool_1,
        spool_2["id"]: spool_2,
        spool_3["id"]: spool_3,
    }

    yield Fixture(
        spools=[spool_1, spool_2, spool_3],
        spools_by_id=added_spools_by_id,
        filament=random_filament,
    )

    httpx.delete(f"{URL}/api/v1/spool/{spool_1['id']}").raise_for_status()
    httpx.delete(f"{URL}/api/v1/spool/{spool_2['id']}").raise_for_status()
    httpx.delete(f"{URL}/api/v1/spool/{spool_3['id']}").raise_for_status()


def test_find_all_spools(spools: Fixture):
    """Test finding all non-archived spools in the database."""
    # Execute
    result = httpx.get(f"{URL}/api/v1/spool")
    result.raise_for_status()

    # Verify
    spools_result = result.json()
    assert len(spools_result) == 2
    for spool in spools_result:
        assert spool == spools.spools_by_id[spool["id"]]
        assert spool["archived"] is False


def test_find_all_spools_including_archived(spools: Fixture):
    """Test finding all spools in the database, including archived ones."""
    # Execute
    result = httpx.get(f"{URL}/api/v1/spool?allow_archived=true")
    result.raise_for_status()

    # Verify
    spools_result = result.json()
    assert len(spools_result) == 3
    for spool in spools_result:
        assert spool == spools.spools_by_id[spool["id"]]


def test_find_spools_by_filament_name(spools: Fixture):
    """Test finding spools by filament name."""
    # Execute
    result = httpx.get(
        f"{URL}/api/v1/spool",
        params={"filament_name": spools.filament["name"]},
    )
    result.raise_for_status()

    # Verify
    spools_result = result.json()
    assert len(spools_result) == 2
    for spool in spools_result:
        assert spool == spools.spools_by_id[spool["id"]]


def test_find_spools_by_filament_id(spools: Fixture):
    """Test finding spools by filament id."""
    # Execute
    result = httpx.get(
        f"{URL}/api/v1/spool",
        params={"filament_id": spools.filament["id"]},
    )
    result.raise_for_status()

    # Verify
    spools_result = result.json()
    assert len(spools_result) == 2
    for spool in spools_result:
        assert spool == spools.spools_by_id[spool["id"]]


def test_find_spools_by_filament_material(spools: Fixture):
    """Test finding spools by filament material."""
    # Execute
    result = httpx.get(
        f"{URL}/api/v1/spool",
        params={"filament_material": spools.filament["material"]},
    )
    result.raise_for_status()

    # Verify
    spools_result = result.json()
    assert len(spools_result) == 2
    for spool in spools_result:
        assert spool == spools.spools_by_id[spool["id"]]


def test_find_spools_by_filament_vendor_name(spools: Fixture):
    """Test finding spools by filament vendor name."""
    # Execute
    result = httpx.get(
        f"{URL}/api/v1/spool",
        params={"vendor_name": spools.filament["vendor"]["name"]},
    )
    result.raise_for_status()

    # Verify
    spools_result = result.json()
    assert len(spools_result) == 2
    for spool in spools_result:
        assert spool == spools.spools_by_id[spool["id"]]


def test_find_spools_by_filament_vendor_id(spools: Fixture):
    """Test finding spools by filament vendor id."""
    # Execute
    result = httpx.get(
        f"{URL}/api/v1/spool",
        params={"vendor_id": spools.filament["vendor"]["id"]},
    )
    result.raise_for_status()

    # Verify
    spools_result = result.json()
    assert len(spools_result) == 2
    for spool in spools_result:
        assert spool == spools.spools_by_id[spool["id"]]


def test_find_spools_by_location(spools: Fixture):
    """Test finding spools by location."""
    # Execute
    result = httpx.get(
        f"{URL}/api/v1/spool",
        params={"location": "The Pantry"},
    )
    result.raise_for_status()

    # Verify
    spools_result = result.json()
    assert len(spools_result) == 1
    assert spools_result[0] == spools.spools[0]


def test_find_spools_by_lot_nr(spools: Fixture):
    """Test finding spools by lot nr."""
    # Execute
    result = httpx.get(
        f"{URL}/api/v1/spool",
        params={"lot_nr": "123456789"},
    )
    result.raise_for_status()

    # Verify
    spools_result = result.json()
    assert len(spools_result) == 1
    assert spools_result[0] == spools.spools[0]

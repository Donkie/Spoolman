"""Integration tests for the Spool API endpoint."""

import math
from typing import Any

import httpx
import pytest

URL = "http://spoolman:8000"


def test_add_spool_remaining_weight(random_filament: dict[str, Any]):
    """Test adding a spool to the database."""
    # Execute
    first_used = "2023-01-01T00:00:00"
    last_used = "2023-01-02T00:00:00"
    remaining_weight = 750
    location = "The Pantry"
    lot_nr = "123456789"
    comment = "abcdefghåäö"
    result = httpx.post(
        f"{URL}/api/v1/spool",
        json={
            "first_used": first_used,
            "last_used": last_used,
            "filament_id": random_filament["id"],
            "remaining_weight": remaining_weight,
            "location": location,
            "lot_nr": lot_nr,
            "comment": comment,
        },
    )
    result.raise_for_status()

    # Verify
    spool = result.json()
    assert spool["first_used"] == first_used
    assert spool["last_used"] == last_used
    assert spool["filament"] == random_filament
    assert spool["remaining_weight"] == pytest.approx(remaining_weight)
    assert spool["used_weight"] == pytest.approx(random_filament["weight"] - remaining_weight)
    assert spool["location"] == location
    assert spool["lot_nr"] == lot_nr
    assert spool["comment"] == comment

    # Clean up
    httpx.delete(f"{URL}/api/v1/spool/{spool['id']}").raise_for_status()


def test_add_spool_used_weight(random_filament: dict[str, Any]):
    """Test adding a spool to the database."""
    # Execute
    first_used = "2023-01-01T00:00:00"
    last_used = "2023-01-02T00:00:00"
    used_weight = 250
    location = "The Pantry"
    lot_nr = "123456789"
    comment = "abcdefghåäö"
    result = httpx.post(
        f"{URL}/api/v1/spool",
        json={
            "first_used": first_used,
            "last_used": last_used,
            "filament_id": random_filament["id"],
            "used_weight": used_weight,
            "location": location,
            "lot_nr": lot_nr,
            "comment": comment,
        },
    )
    result.raise_for_status()

    # Verify
    spool = result.json()
    assert spool["first_used"] == first_used
    assert spool["last_used"] == last_used
    assert spool["filament"] == random_filament
    assert spool["remaining_weight"] == pytest.approx(random_filament["weight"] - used_weight)
    assert spool["used_weight"] == pytest.approx(used_weight)
    assert spool["location"] == location
    assert spool["lot_nr"] == lot_nr
    assert spool["comment"] == comment

    # Clean up
    httpx.delete(f"{URL}/api/v1/spool/{spool['id']}").raise_for_status()


def test_add_spool_both_used_and_remaining_weight(random_filament: dict[str, Any]):
    """Test adding a spool to the database."""
    # Execute
    result = httpx.post(
        f"{URL}/api/v1/spool",
        json={
            "filament_id": random_filament["id"],
            "remaining_weight": 750,
            "used_weight": 250,
        },
    )
    assert result.status_code == 400  # Cannot set both used and remaining weight


def test_get_spool(random_filament: dict[str, Any]):
    """Test getting a spool from the database."""
    # Setup
    first_used = "2023-01-01T00:00:00"
    last_used = "2023-01-02T00:00:00"
    remaining_weight = 750
    location = "The Pantry"
    lot_nr = "123456789"
    comment = "abcdefghåäö"
    result = httpx.post(
        f"{URL}/api/v1/spool",
        json={
            "first_used": first_used,
            "last_used": last_used,
            "filament_id": random_filament["id"],
            "remaining_weight": remaining_weight,
            "location": location,
            "lot_nr": lot_nr,
            "comment": comment,
        },
    )
    result.raise_for_status()
    spool = result.json()

    # Execute
    result = httpx.get(f"{URL}/api/v1/spool/{spool['id']}")
    result.raise_for_status()

    # Verify
    assert result.json() == spool

    # Clean up
    httpx.delete(f"{URL}/api/v1/spool/{spool['id']}").raise_for_status()


def test_get_spool_not_found():
    """Test getting a spool that does not exist."""
    # Execute
    result = httpx.get(f"{URL}/api/v1/spool/123456789")

    # Verify
    assert result.status_code == 404


def test_find_spools(random_filament: dict[str, Any]):  # noqa: PLR0915
    """Test finding spools in the database."""
    # Setup
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

    added_spools_by_id = {
        spool_1["id"]: spool_1,
        spool_2["id"]: spool_2,
    }

    # Execute - find all spools
    result = httpx.get(f"{URL}/api/v1/spool")
    result.raise_for_status()

    # Verify
    spools = result.json()
    assert len(spools) == 2
    for spool in spools:
        assert spool == added_spools_by_id[spool["id"]]

    # Execute - find spools by filament name
    result = httpx.get(
        f"{URL}/api/v1/spool",
        params={"filament_name": random_filament["name"]},
    )
    result.raise_for_status()

    # Verify
    spools = result.json()
    assert len(spools) == 2
    for spool in spools:
        assert spool == added_spools_by_id[spool["id"]]

    # Execute - find spools by filament id
    result = httpx.get(
        f"{URL}/api/v1/spool",
        params={"filament_id": random_filament["id"]},
    )
    result.raise_for_status()

    # Verify
    spools = result.json()
    assert len(spools) == 2
    for spool in spools:
        assert spool == added_spools_by_id[spool["id"]]

    # Execute - find spools by filament material
    result = httpx.get(
        f"{URL}/api/v1/spool",
        params={"filament_material": random_filament["material"]},
    )
    result.raise_for_status()

    # Verify
    spools = result.json()
    assert len(spools) == 2
    for spool in spools:
        assert spool == added_spools_by_id[spool["id"]]

    # Execute - find spools by filament vendor name
    result = httpx.get(
        f"{URL}/api/v1/spool",
        params={"vendor_name": random_filament["vendor"]["name"]},
    )
    result.raise_for_status()

    # Verify
    spools = result.json()
    assert len(spools) == 2
    for spool in spools:
        assert spool == added_spools_by_id[spool["id"]]

    # Execute - find spools by filament vendor id
    result = httpx.get(
        f"{URL}/api/v1/spool",
        params={"vendor_id": random_filament["vendor"]["id"]},
    )
    result.raise_for_status()

    # Verify
    spools = result.json()
    assert len(spools) == 2
    for spool in spools:
        assert spool == added_spools_by_id[spool["id"]]

    # Execute - find spools by location
    result = httpx.get(
        f"{URL}/api/v1/spool",
        params={"location": "The Pantry"},
    )
    result.raise_for_status()

    # Verify
    spools = result.json()
    assert len(spools) == 1
    assert spools[0] == added_spools_by_id[spool_1["id"]]

    # Execute - find spools by lot nr
    result = httpx.get(
        f"{URL}/api/v1/spool",
        params={"lot_nr": "123456789"},
    )
    result.raise_for_status()

    # Verify
    spools = result.json()
    assert len(spools) == 1
    assert spools[0] == added_spools_by_id[spool_1["id"]]

    # Clean up
    httpx.delete(f"{URL}/api/v1/spool/{spool_1['id']}").raise_for_status()
    httpx.delete(f"{URL}/api/v1/spool/{spool_2['id']}").raise_for_status()


def test_delete_spool(random_filament: dict[str, Any]):
    """Test deleting a spool from the database."""
    # Setup
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
    spool = result.json()

    # Execute
    httpx.delete(f"{URL}/api/v1/spool/{spool['id']}").raise_for_status()

    # Verify
    result = httpx.get(f"{URL}/api/v1/spool/{spool['id']}")
    assert result.status_code == 404


def test_delete_spool_not_found():
    """Test deleting a spool that does not exist."""
    # Execute
    result = httpx.delete(f"{URL}/api/v1/spool/123456789")

    # Verify
    assert result.status_code == 404


def test_update_spool(random_filament: dict[str, Any]):
    """Test updating a spool in the database."""
    # Setup
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
    spool = result.json()

    # Execute
    first_used = "2023-01-01T00:00:00"
    last_used = "2023-01-02T00:00:00"
    remaining_weight = 750
    location = "Living Room"
    lot_nr = "987654321"
    comment = "abcdefghåäö"
    result = httpx.patch(
        f"{URL}/api/v1/spool/{spool['id']}",
        json={
            "first_used": first_used,
            "last_used": last_used,
            "remaining_weight": remaining_weight,
            "location": location,
            "lot_nr": lot_nr,
            "comment": comment,
        },
    )
    result.raise_for_status()

    # Verify
    spool = result.json()
    assert spool["first_used"] == first_used
    assert spool["last_used"] == last_used
    assert spool["remaining_weight"] == pytest.approx(remaining_weight)
    assert spool["used_weight"] == pytest.approx(random_filament["weight"] - remaining_weight)
    assert spool["location"] == location
    assert spool["lot_nr"] == lot_nr
    assert spool["comment"] == comment

    # Clean up
    httpx.delete(f"{URL}/api/v1/spool/{spool['id']}").raise_for_status()


def test_update_spool_both_used_and_remaining_weight(random_filament: dict[str, Any]):
    """Test updating a spool in the database."""
    # Setup
    result = httpx.post(
        f"{URL}/api/v1/spool",
        json={"filament_id": random_filament["id"]},
    )
    result.raise_for_status()
    spool = result.json()

    # Execute
    result = httpx.patch(
        f"{URL}/api/v1/spool/{spool['id']}",
        json={
            "remaining_weight": 750,
            "used_weight": 250,
        },
    )
    assert result.status_code == 400  # Cannot update both used and remaining weight

    # Clean up
    httpx.delete(f"{URL}/api/v1/spool/{spool['id']}").raise_for_status()


def test_update_spool_not_found(random_filament: dict[str, Any]):
    """Test updating a spool that does not exist."""
    # Execute
    result = httpx.patch(
        f"{URL}/api/v1/spool/123456789",
        json={"filament_id": random_filament["id"]},
    )
    assert result.status_code == 404


def test_use_spool_weight(random_filament: dict[str, Any]):
    """Test using a spool in the database."""
    # Setup
    start_weight = 1000
    result = httpx.post(
        f"{URL}/api/v1/spool",
        json={
            "filament_id": random_filament["id"],
            "remaining_weight": start_weight,
        },
    )
    result.raise_for_status()
    spool = result.json()

    # Execute
    used_weight = 0.05
    result = httpx.put(
        f"{URL}/api/v1/spool/{spool['id']}/use",
        json={
            "use_weight": used_weight,
        },
    )
    result.raise_for_status()

    # Verify
    spool = result.json()
    assert spool["remaining_weight"] == pytest.approx(start_weight - used_weight)

    # Clean up
    httpx.delete(f"{URL}/api/v1/spool/{spool['id']}").raise_for_status()


def test_use_spool_length(random_filament: dict[str, Any]):
    """Test using a spool in the database."""
    # Setup
    start_weight = 1000
    result = httpx.post(
        f"{URL}/api/v1/spool",
        json={
            "filament_id": random_filament["id"],
            "remaining_weight": start_weight,
        },
    )
    result.raise_for_status()
    spool = result.json()

    # Execute
    used_length = 10  # mm
    result = httpx.put(
        f"{URL}/api/v1/spool/{spool['id']}/use",
        json={
            "use_length": used_length,
        },
    )
    result.raise_for_status()

    # Verify
    spool = result.json()
    used_weight = (
        random_filament["density"] * (used_length * 1e-1) * math.pi * ((random_filament["diameter"] * 1e-1 / 2) ** 2)
    )
    assert spool["remaining_weight"] == pytest.approx(start_weight - used_weight)

    # Clean up
    httpx.delete(f"{URL}/api/v1/spool/{spool['id']}").raise_for_status()


def test_use_spool_weight_and_length(random_filament: dict[str, Any]):
    """Test using a spool in the database."""
    # Setup
    result = httpx.post(
        f"{URL}/api/v1/spool",
        json={"filament_id": random_filament["id"]},
    )
    result.raise_for_status()
    spool = result.json()

    # Execute
    result = httpx.put(
        f"{URL}/api/v1/spool/{spool['id']}/use",
        json={
            "use_weight": 0.05,
            "use_length": 10,
        },
    )
    assert result.status_code == 400  # Cannot use both weight and length

    # Clean up
    httpx.delete(f"{URL}/api/v1/spool/{spool['id']}").raise_for_status()


def test_use_spool_not_found():
    """Test using a spool that does not exist."""
    # Execute
    result = httpx.put(
        f"{URL}/api/v1/spool/123456789/use",
        json={"use_weight": 0.05},
    )
    assert result.status_code == 404

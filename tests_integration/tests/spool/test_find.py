"""Integration tests for the Spool API endpoint."""

from typing import Any

import httpx

URL = "http://spoolman:8000"


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

    # Execute - find all spools
    result = httpx.get(f"{URL}/api/v1/spool")
    result.raise_for_status()

    # Verify
    spools = result.json()
    assert len(spools) == 2
    for spool in spools:
        assert spool == added_spools_by_id[spool["id"]]
        assert spool["archived"] is False

    # Execute - find all spools, including archived
    result = httpx.get(f"{URL}/api/v1/spool?allow_archived=true")
    result.raise_for_status()

    # Verify
    spools = result.json()
    assert len(spools) == 3
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
    httpx.delete(f"{URL}/api/v1/spool/{spool_3['id']}").raise_for_status()

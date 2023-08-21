"""Integration tests for the Filament API endpoint."""

from typing import Any

import httpx

URL = "http://spoolman:8000"


def test_find_filaments(random_vendor: dict[str, Any]):
    """Test finding filaments from the database."""
    # Setup
    result = httpx.post(
        f"{URL}/api/v1/filament",
        json={
            "name": "Filament X",
            "vendor_id": random_vendor["id"],
            "material": "PLA",
            "price": 100,
            "density": 1.25,
            "diameter": 1.75,
            "weight": 1000,
            "spool_weight": 250,
            "article_number": "123456789",
            "comment": "abcdefghåäö",
        },
    )
    result.raise_for_status()
    filament_1 = result.json()

    result = httpx.post(
        f"{URL}/api/v1/filament",
        json={
            "name": "Filament Y",
            "vendor_id": random_vendor["id"],
            "material": "ABS",
            "price": 200,
            "density": 1.25,
            "diameter": 1.75,
            "weight": 1000,
            "spool_weight": 250,
            "article_number": "987654321",
            "comment": "abcdefghåäö",
        },
    )
    result.raise_for_status()
    filament_2 = result.json()

    added_filaments_by_id = {
        filament_1["id"]: filament_1,
        filament_2["id"]: filament_2,
    }

    # Execute - find all filaments
    result = httpx.get(
        f"{URL}/api/v1/filament",
    )
    result.raise_for_status()

    # Verify
    filaments = result.json()
    assert len(filaments) == 2
    for filament in filaments:
        assert filament == added_filaments_by_id[filament["id"]]

    # Execute - find filaments by name
    result = httpx.get(
        f"{URL}/api/v1/filament",
        params={"name": "Filament X"},
    )
    result.raise_for_status()

    # Verify
    filaments = result.json()
    assert len(filaments) == 1
    assert filaments[0] == added_filaments_by_id[filament_1["id"]]

    # Execute - find filaments by material
    result = httpx.get(
        f"{URL}/api/v1/filament",
        params={"material": "abs"},
    )
    result.raise_for_status()

    # Verify
    filaments = result.json()
    assert len(filaments) == 1
    assert filaments[0] == added_filaments_by_id[filament_2["id"]]

    # Execute - find filaments by vendor id
    result = httpx.get(
        f"{URL}/api/v1/filament",
        params={"vendor_id": random_vendor["id"]},
    )
    result.raise_for_status()

    # Verify
    filaments = result.json()
    assert len(filaments) == 2
    for filament in filaments:
        assert filament == added_filaments_by_id[filament["id"]]

    # Execute - find filaments by vendor name
    result = httpx.get(
        f"{URL}/api/v1/filament",
        params={"vendor_name": random_vendor["name"]},
    )
    result.raise_for_status()

    # Verify
    filaments = result.json()
    assert len(filaments) == 2
    for filament in filaments:
        assert filament == added_filaments_by_id[filament["id"]]

    # Execute - find filaments by article number
    result = httpx.get(
        f"{URL}/api/v1/filament",
        params={"article_number": "321"},
    )
    result.raise_for_status()

    # Verify
    filaments = result.json()
    assert len(filaments) == 1
    assert filaments[0] == added_filaments_by_id[filament_2["id"]]

    # Clean up
    httpx.delete(f"{URL}/api/v1/filament/{filament_1['id']}").raise_for_status()
    httpx.delete(f"{URL}/api/v1/filament/{filament_2['id']}").raise_for_status()

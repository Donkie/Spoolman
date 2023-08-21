"""Integration tests for the Filament API endpoint."""

from typing import Any

import httpx

URL = "http://spoolman:8000"


def test_delete_filament(random_vendor: dict[str, Any]):
    """Test deleting a filament from the database."""
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
    added_filament = result.json()

    # Execute
    httpx.delete(
        f"{URL}/api/v1/filament/{added_filament['id']}",
    ).raise_for_status()

    # Verify
    result = httpx.get(
        f"{URL}/api/v1/filament/{added_filament['id']}",
    )
    assert result.status_code == 404


def test_delete_filament_not_found():
    """Test deleting a filament that does not exist."""
    # Execute
    result = httpx.delete(f"{URL}/api/v1/filament/123456789")

    # Verify
    assert result.status_code == 404
    message = result.json()["message"].lower()
    assert "filament" in message
    assert "id" in message
    assert "123456789" in message

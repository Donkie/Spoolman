"""Integration tests for the Spool API endpoint."""

from typing import Any

import httpx

URL = "http://spoolman:8000"


def test_get_spool(random_filament: dict[str, Any]):
    """Test getting a spool from the database."""
    # Setup
    first_used = "2023-01-01T00:00:00"
    last_used = "2023-01-02T00:00:00"
    remaining_weight = 750
    location = "The Pantry"
    lot_nr = "123456789"
    comment = "abcdefghåäö"
    archived = True
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
            "archived": archived,
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
    message = result.json()["message"].lower()
    assert "spool" in message
    assert "id" in message
    assert "123456789" in message

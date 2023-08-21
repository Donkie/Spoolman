"""Integration tests for the Spool API endpoint."""

from typing import Any

import httpx

URL = "http://spoolman:8000"


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
    message = result.json()["message"].lower()
    assert "spool" in message
    assert "id" in message
    assert "123456789" in message

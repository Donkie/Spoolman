"""Integration tests for the Filament API endpoint."""

from typing import Any

import httpx

from ..conftest import URL


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


def test_delete_filament_with_spools(random_filament: dict[str, Any]):
    """Test that a filament which still has spools is refused, not silently deleted.

    The spool.filament_id foreign key is not nullable, so the delete cannot go through.
    Clients rely on the 403 to tell the user why instead of showing a generic failure.
    """
    # Setup
    result = httpx.post(
        f"{URL}/api/v1/spool",
        json={"filament_id": random_filament["id"], "remaining_weight": 1000},
    )
    result.raise_for_status()
    spool = result.json()

    try:
        # Execute
        result = httpx.delete(f"{URL}/api/v1/filament/{random_filament['id']}")

        # Verify: refused, and both the filament and its spool are untouched.
        assert result.status_code == 403
        assert "message" in result.json()

        result = httpx.get(f"{URL}/api/v1/filament/{random_filament['id']}")
        assert result.status_code == 200

        result = httpx.get(f"{URL}/api/v1/spool/{spool['id']}")
        assert result.status_code == 200
    finally:
        httpx.delete(f"{URL}/api/v1/spool/{spool['id']}")


def test_delete_filament_with_archived_spools(random_filament: dict[str, Any]):
    """Test that archiving a spool does not make its filament deletable.

    Archiving is a flag, not a deletion — the foreign key still holds. The client
    counts archived spools for exactly this reason.
    """
    # Setup
    result = httpx.post(
        f"{URL}/api/v1/spool",
        json={"filament_id": random_filament["id"], "remaining_weight": 1000, "archived": True},
    )
    result.raise_for_status()
    spool = result.json()
    assert spool["archived"] is True

    try:
        # Execute
        result = httpx.delete(f"{URL}/api/v1/filament/{random_filament['id']}")

        # Verify
        assert result.status_code == 403
        assert httpx.get(f"{URL}/api/v1/filament/{random_filament['id']}").status_code == 200
    finally:
        httpx.delete(f"{URL}/api/v1/spool/{spool['id']}")


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

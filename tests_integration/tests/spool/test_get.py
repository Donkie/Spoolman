"""Integration tests for the Spool API endpoint."""

from typing import Any

import httpx
import pytest

from ..conftest import URL


def test_get_spool(random_filament: dict[str, Any]):
    """Test getting a spool from the database."""
    # Setup
    first_used = "2023-01-01T00:00:00"
    last_used = "2023-01-02T00:00:00"
    remaining_weight = 750
    location = "The Pantry"
    lot_nr = "123456789"
    comment = "abcdefghåäö"
    price = 25
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
            "price": price,
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


def test_get_spool_default_weights(random_filament: dict[str, Any]):
    """Test getting a spool from the database."""
    # Setup
    first_used = "2023-01-01T00:00:00"
    last_used = "2023-01-02T00:00:00"
    remaining_weight = 750
    location = "The Pantry"
    lot_nr = "123456789"
    comment = "abcdefghåäö"
    price = 25
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
            "price": price,
            "archived": archived,
        },
    )
    result.raise_for_status()
    spool = result.json()

    # Execute
    result = httpx.get(f"{URL}/api/v1/spool/{spool['id']}")
    result.raise_for_status()

    result_spool = result.json()

    # Verify
    assert result_spool == spool
    assert result_spool["initial_weight"] == pytest.approx(random_filament["weight"] + random_filament["spool_weight"])
    assert result_spool["empty_weight"] == pytest.approx(random_filament["spool_weight"])

    # Clean up
    httpx.delete(f"{URL}/api/v1/spool/{spool['id']}").raise_for_status()


def test_get_spool_weights(random_filament: dict[str, Any]):
    """Test getting a spool from the database."""
    # Setup
    first_used = "2023-01-01T00:00:00"
    last_used = "2023-01-02T00:00:00"
    remaining_weight = 750
    initial_weight = 1255
    empty_weight = 246
    location = "The Pantry"
    lot_nr = "123456789"
    comment = "abcdefghåäö"
    price = 25
    archived = True
    result = httpx.post(
        f"{URL}/api/v1/spool",
        json={
            "first_used": first_used,
            "last_used": last_used,
            "filament_id": random_filament["id"],
            "remaining_weight": remaining_weight,
            "initial_weight": initial_weight,
            "empty_weight": empty_weight,
            "location": location,
            "lot_nr": lot_nr,
            "comment": comment,
            "price": price,
            "archived": archived,
        },
    )
    result.raise_for_status()
    spool = result.json()

    # Execute
    result = httpx.get(f"{URL}/api/v1/spool/{spool['id']}")
    result.raise_for_status()

    result_spool = result.json()

    # Verify
    assert result_spool == spool

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

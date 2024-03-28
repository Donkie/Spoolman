"""Integration tests for the Spool API endpoint."""

from typing import Any

import httpx
import pytest

from ..conftest import URL, length_from_weight


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
    first_used = "2023-01-01T12:00:00+02:00"
    last_used = "2023-01-02T12:00:00+02:00"
    remaining_weight = 750
    location = "Living Room"
    lot_nr = "987654321"
    comment = "abcdefghåäö"
    archived = True
    price = 25
    result = httpx.patch(
        f"{URL}/api/v1/spool/{spool['id']}",
        json={
            "first_used": first_used,
            "last_used": last_used,
            "remaining_weight": remaining_weight,
            "location": location,
            "lot_nr": lot_nr,
            "comment": comment,
            "archived": archived,
            "price": price,
        },
    )
    result.raise_for_status()

    # Verify
    used_weight = random_filament["weight"] - remaining_weight
    used_length = length_from_weight(
        weight=used_weight,
        density=random_filament["density"],
        diameter=random_filament["diameter"],
    )
    remaining_length = length_from_weight(
        weight=remaining_weight,
        density=random_filament["density"],
        diameter=random_filament["diameter"],
    )

    spool = result.json()
    assert spool["first_used"] == "2023-01-01T10:00:00Z"
    assert spool["last_used"] == "2023-01-02T10:00:00Z"
    assert spool["remaining_weight"] == pytest.approx(remaining_weight)
    assert spool["used_weight"] == pytest.approx(used_weight)
    assert spool["remaining_length"] == pytest.approx(remaining_length)
    assert spool["used_length"] == pytest.approx(used_length)
    assert spool["location"] == location
    assert spool["lot_nr"] == lot_nr
    assert spool["comment"] == comment
    assert spool["archived"] == archived
    assert spool["price"] == price

    # Clean up
    httpx.delete(f"{URL}/api/v1/spool/{spool['id']}").raise_for_status()


def test_update_spool_weights(random_filament: dict[str, Any]):
    """Test updating a spool in the database."""
    # Setup
    result = httpx.post(
        f"{URL}/api/v1/spool",
        json={
            "filament_id": random_filament["id"],
            "remaining_weight": 1000,
            "initial_weight": 1255,
            "empty_weight": 246,
            "location": "The Pantry",
            "lot_nr": "123456789",
        },
    )
    result.raise_for_status()
    spool = result.json()

    # Execute
    first_used = "2023-01-01T12:00:00+02:00"
    last_used = "2023-01-02T12:00:00+02:00"
    remaining_weight = 750
    initial_weight = 1250
    empty_weight = 245
    location = "Living Room"
    lot_nr = "987654321"
    comment = "abcdefghåäö"
    archived = True
    price = 25
    result = httpx.patch(
        f"{URL}/api/v1/spool/{spool['id']}",
        json={
            "first_used": first_used,
            "last_used": last_used,
            "remaining_weight": remaining_weight,
            "location": location,
            "lot_nr": lot_nr,
            "comment": comment,
            "archived": archived,
            "price": price,
            "initial_weight": initial_weight,
            "empty_weight": empty_weight,
        },
    )
    result.raise_for_status()

    # Verify
    used_weight = initial_weight - empty_weight - remaining_weight
    used_length = length_from_weight(
        weight=used_weight,
        density=random_filament["density"],
        diameter=random_filament["diameter"],
    )
    remaining_length = length_from_weight(
        weight=remaining_weight,
        density=random_filament["density"],
        diameter=random_filament["diameter"],
    )

    spool = result.json()
    assert spool["first_used"] == "2023-01-01T10:00:00Z"
    assert spool["last_used"] == "2023-01-02T10:00:00Z"
    assert spool["initial_weight"] == pytest.approx(initial_weight)
    assert spool["empty_weight"] == pytest.approx(empty_weight)
    assert spool["remaining_weight"] == pytest.approx(remaining_weight)
    assert spool["used_weight"] == pytest.approx(used_weight)
    assert spool["remaining_length"] == pytest.approx(remaining_length)
    assert spool["used_length"] == pytest.approx(used_length)
    assert spool["location"] == location
    assert spool["lot_nr"] == lot_nr
    assert spool["comment"] == comment
    assert spool["archived"] == archived
    assert spool["price"] == price

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
    message = result.json()["message"].lower()
    assert "spool" in message
    assert "id" in message
    assert "123456789" in message

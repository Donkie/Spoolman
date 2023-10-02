"""Integration tests for the Spool API endpoint."""

from datetime import datetime, timezone
from typing import Any

import httpx
import pytest

from ..conftest import length_from_weight  # noqa: TID252

URL = "http://spoolman:8000"


def test_add_spool_remaining_weight(random_filament: dict[str, Any]):
    """Test adding a spool to the database."""
    # Execute
    remaining_weight = 750
    location = "The Pantry"
    lot_nr = "123456789"
    comment = "abcdefghåäö"
    archived = True
    result = httpx.post(
        f"{URL}/api/v1/spool",
        json={
            "first_used": "2023-01-02T12:00:00+01:00",
            "last_used": "2023-01-02T11:00:00Z",
            "filament_id": random_filament["id"],
            "remaining_weight": remaining_weight,
            "location": location,
            "lot_nr": lot_nr,
            "comment": comment,
            "archived": archived,
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
    assert spool == {
        "id": spool["id"],
        "registered": spool["registered"],
        "first_used": "2023-01-02T11:00:00Z",
        "last_used": "2023-01-02T11:00:00Z",
        "filament": random_filament,
        "remaining_weight": pytest.approx(remaining_weight),
        "used_weight": pytest.approx(used_weight),
        "remaining_length": pytest.approx(remaining_length),
        "used_length": pytest.approx(used_length),
        "location": location,
        "lot_nr": lot_nr,
        "comment": comment,
        "archived": archived,
    }

    # Verify that registered happened almost now (within 1 minute)
    diff = abs((datetime.now(tz=timezone.utc) - datetime.fromisoformat(spool["registered"])).total_seconds())
    assert diff < 60

    # Clean up
    httpx.delete(f"{URL}/api/v1/spool/{spool['id']}").raise_for_status()


def test_add_spool_used_weight(random_filament: dict[str, Any]):
    """Test adding a spool to the database."""
    # Execute
    first_used = "2023-01-01T00:00:00Z"
    last_used = "2023-01-02T00:00:00Z"
    used_weight = 250
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
            "used_weight": used_weight,
            "location": location,
            "lot_nr": lot_nr,
            "comment": comment,
            "archived": archived,
        },
    )
    result.raise_for_status()

    # Verify
    remaining_weight = random_filament["weight"] - used_weight
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
    assert spool == {
        "id": spool["id"],
        "registered": spool["registered"],
        "first_used": first_used,
        "last_used": last_used,
        "filament": random_filament,
        "remaining_weight": pytest.approx(remaining_weight),
        "used_weight": pytest.approx(used_weight),
        "remaining_length": pytest.approx(remaining_length),
        "used_length": pytest.approx(used_length),
        "location": location,
        "lot_nr": lot_nr,
        "comment": comment,
        "archived": archived,
    }

    # Clean up
    httpx.delete(f"{URL}/api/v1/spool/{spool['id']}").raise_for_status()


def test_add_spool_required(random_filament: dict[str, Any]):
    """Test adding a spool with only the required fields to the database."""
    # Execute
    used_weight = 250
    result = httpx.post(
        f"{URL}/api/v1/spool",
        json={
            "filament_id": random_filament["id"],
            "used_weight": used_weight,
        },
    )
    result.raise_for_status()

    # Verify
    remaining_weight = random_filament["weight"] - used_weight
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
    assert spool == {
        "id": spool["id"],
        "registered": spool["registered"],
        "filament": random_filament,
        "used_weight": pytest.approx(used_weight),
        "remaining_weight": pytest.approx(remaining_weight),
        "used_length": pytest.approx(used_length),
        "remaining_length": pytest.approx(remaining_length),
        "archived": False,
    }

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

"""Integration tests for the Spool API endpoint."""

from datetime import datetime, timezone
from typing import Any

import httpx
import pytest

from ..conftest import URL


@pytest.mark.parametrize("measurement", [0, 0.05, -0.05, 1000])
def test_measure_spool(random_filament: dict[str, Any], measurement: float):
    """Test using a spool in the database."""
    # Setup
    random_filament["weight"]
    initial_weight = 1255
    empty_weight = 246
    start_weight = 1000
    result = httpx.post(
        f"{URL}/api/v1/spool",
        json={
            "filament_id": random_filament["id"],
            "remaining_weight": start_weight,
            "initial_weight": initial_weight,
            "empty_weight": empty_weight,
        },
    )
    result.raise_for_status()
    spool = result.json()

    # Execute
    result = httpx.put(
        f"{URL}/api/v1/spool/{spool['id']}/measure",
        json={
            "weight": measurement,
        },
    )
    result.raise_for_status()

    # Verify
    spool = result.json()
    # remaining_weight should be clamped so it's never negative, but used_weight should not be clamped to the net weight
    expected_use = min(initial_weight - measurement, initial_weight - empty_weight)
    assert spool["used_weight"] == pytest.approx(expected_use)
    expected_remaining = max(measurement - empty_weight, 0)
    assert spool["remaining_weight"] == pytest.approx(expected_remaining)
    # Verify that first_used has been updated
    diff = abs((datetime.now(tz=timezone.utc) - datetime.fromisoformat(spool["first_used"])).total_seconds())
    assert diff < 60

    # Verify that last_used has been updated
    diff = abs((datetime.now(tz=timezone.utc) - datetime.fromisoformat(spool["last_used"])).total_seconds())
    assert diff < 60

    # Clean up
    httpx.delete(f"{URL}/api/v1/spool/{spool['id']}").raise_for_status()


@pytest.mark.parametrize("measurement", [1500])  # 1500 is more than the initial weight
def test_measure_spool_invalid(random_filament: dict[str, Any], measurement: float):
    """Test using a spool in the database."""
    # Setup
    random_filament["weight"]
    initial_weight = 1255
    empty_weight = 246
    start_weight = 1000
    result = httpx.post(
        f"{URL}/api/v1/spool",
        json={
            "filament_id": random_filament["id"],
            "remaining_weight": start_weight,
            "initial_weight": initial_weight,
            "empty_weight": empty_weight,
        },
    )
    result.raise_for_status()
    spool = result.json()

    # Execute
    result = httpx.put(
        f"{URL}/api/v1/spool/{spool['id']}/measure",
        json={
            "weight": measurement,
        },
    )
    # Update is invalid if the weight is more than the initial weight
    assert result.status_code == 400

    # Clean up
    httpx.delete(f"{URL}/api/v1/spool/{spool['id']}").raise_for_status()

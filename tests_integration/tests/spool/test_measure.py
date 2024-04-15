"""Integration tests for the Spool API endpoint."""

from datetime import datetime, timezone
from typing import Any

import httpx
import pytest

from ..conftest import URL


@pytest.mark.parametrize("measurement", [246, 500, 600, 1000])
def test_measure_spool(random_filament: dict[str, Any], measurement: float):
    """Test using a spool in the database."""
    # Setup
    random_filament["weight"]
    spool_weight = 246
    start_weight = 1000
    result = httpx.post(
        f"{URL}/api/v1/spool",
        json={
            "filament_id": random_filament["id"],
            "remaining_weight": start_weight,
            "initial_weight": start_weight,
            "spool_weight": spool_weight,
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
    expected_use = min(start_weight - (measurement - spool_weight), start_weight)
    assert spool["used_weight"] == pytest.approx(expected_use)
    expected_remaining = max(measurement - spool_weight, 0)
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
def test_measure_spool_higher_initial(random_filament: dict[str, Any], measurement: float):
    """Test using a spool in the database."""
    # Setup
    random_filament["weight"]
    spool_weight = 246
    start_weight = 1000
    result = httpx.post(
        f"{URL}/api/v1/spool",
        json={
            "filament_id": random_filament["id"],
            "remaining_weight": start_weight,
            "initial_weight": start_weight,
            "spool_weight": spool_weight,
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
    result.raise_for_status()

    # Verify
    spool = result.json()
    # remaining_weight should be clamped so it's never negative,
    # but used_weight should not be clamped to the net weight
    expected_use = 0
    expected_initial_weight = measurement - spool_weight
    expected_remaining = max(measurement - spool_weight, 0)

    assert spool["used_weight"] == pytest.approx(expected_use)
    assert spool["remaining_weight"] == pytest.approx(expected_remaining)
    assert spool["initial_weight"] == pytest.approx(expected_initial_weight)
    # Clean up
    httpx.delete(f"{URL}/api/v1/spool/{spool['id']}").raise_for_status()


@pytest.mark.parametrize(
    "measurements",
    [[1244, 1233, 1200], [1000, 900, 800], [1000, 1000, 1000], [1000, 900, 800, 815]],
)
def test_measure_spool_sequence(random_filament: dict[str, Any], measurements: list[float]):
    """Test using a spool in the database."""
    # Setup
    random_filament["weight"]
    spool_weight = 246
    start_weight = 1009
    initial_weight = start_weight + spool_weight
    current_weight = initial_weight
    result = httpx.post(
        f"{URL}/api/v1/spool",
        json={
            "filament_id": random_filament["id"],
            "remaining_weight": start_weight,
            "initial_weight": start_weight,
            "spool_weight": spool_weight,
        },
    )
    result.raise_for_status()
    spool = result.json()

    for m in measurements:
        # Execute
        result = httpx.put(
            f"{URL}/api/v1/spool/{spool['id']}/measure",
            json={
                "weight": m,
            },
        )
        result.raise_for_status()

        # Verify
        spool = result.json()
        # remaining_weight should be clamped so it's never negative,
        # but used_weight should not be clamped to the net weight
        expected_use = min(initial_weight - m, initial_weight - spool_weight)
        assert spool["used_weight"] == pytest.approx(expected_use)
        expected_remaining = max(m - spool_weight, 0)
        assert spool["remaining_weight"] == pytest.approx(expected_remaining)
        # Verify that first_used has been updated
        diff = abs((datetime.now(tz=timezone.utc) - datetime.fromisoformat(spool["first_used"])).total_seconds())
        assert diff < 60

        # Verify that last_used has been updated
        diff = abs((datetime.now(tz=timezone.utc) - datetime.fromisoformat(spool["last_used"])).total_seconds())
        assert diff < 60

        current_weight = current_weight - expected_use

    # Clean up
    httpx.delete(f"{URL}/api/v1/spool/{spool['id']}").raise_for_status()


@pytest.mark.parametrize("measurements", [[1244, 1233, 1200], [1000, 900, 800], [1000, 1000, 1000]])
def test_measure_spool_empty(random_empty_filament: dict[str, Any], measurements: list[float]):
    """Test using a spool in the database."""
    # Setup
    spool_weight = 246
    start_weight = 1000
    initial_weight = start_weight + spool_weight
    current_weight = initial_weight
    result = httpx.post(
        f"{URL}/api/v1/spool",
        json={
            "filament_id": random_empty_filament["id"],
            "remaining_weight": start_weight,
            "initial_weight": start_weight,
            "spool_weight": spool_weight,
        },
    )
    result.raise_for_status()
    spool = result.json()

    for m in measurements:
        # Execute
        result = httpx.put(
            f"{URL}/api/v1/spool/{spool['id']}/measure",
            json={
                "weight": m,
            },
        )
        result.raise_for_status()

        # Verify
        spool = result.json()
        # remaining_weight should be clamped so it's never negative,
        # but used_weight should not be clamped to the net weight
        expected_use = min(initial_weight - m, initial_weight - spool_weight)
        assert spool["used_weight"] == pytest.approx(expected_use)
        expected_remaining = max(m - spool_weight, 0)
        assert spool["remaining_weight"] == pytest.approx(expected_remaining)
        # Verify that first_used has been updated
        diff = abs((datetime.now(tz=timezone.utc) - datetime.fromisoformat(spool["first_used"])).total_seconds())
        assert diff < 60

        # Verify that last_used has been updated
        diff = abs((datetime.now(tz=timezone.utc) - datetime.fromisoformat(spool["last_used"])).total_seconds())
        assert diff < 60

        current_weight = current_weight - expected_use

    # Clean up
    httpx.delete(f"{URL}/api/v1/spool/{spool['id']}").raise_for_status()

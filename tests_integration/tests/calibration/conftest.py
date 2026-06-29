"""Fixtures for calibration integration tests."""

from contextlib import contextmanager
from typing import Any

import httpx
import pytest

from ..conftest import URL, random_filament_impl


@contextmanager
def random_session_impl(filament_id: int):
    """Create a calibration session and yield it; delete on exit."""
    result = httpx.post(
        f"{URL}/api/v1/calibration/session",
        json={
            "filament_id": filament_id,
            "status": "planned",
            "printer_name": "Test Printer",
            "nozzle_diameter": 0.4,
            "notes": "Integration test session",
        },
    )
    result.raise_for_status()
    session: dict[str, Any] = result.json()
    yield session
    httpx.delete(f"{URL}/api/v1/calibration/session/{session['id']}")


@pytest.fixture
def random_filament():
    """Return a random filament."""
    with random_filament_impl() as f:
        yield f


@pytest.fixture
def random_session(random_filament: dict[str, Any]):
    """Return a random calibration session."""
    with random_session_impl(random_filament["id"]) as session:
        yield session

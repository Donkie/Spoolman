"""Integration tests for calibration session endpoints."""

from typing import Any

import httpx
import pytest

from ..conftest import URL, assert_dicts_compatible, assert_httpx_code


def test_create_session(random_filament: dict[str, Any]):
    """Create a calibration session and verify the response."""
    result = httpx.post(
        f"{URL}/api/v1/calibration/session",
        json={
            "filament_id": random_filament["id"],
            "status": "planned",
            "printer_name": "Ender 3",
            "nozzle_diameter": 0.4,
            "notes": "First calibration run",
        },
    )
    result.raise_for_status()
    session = result.json()

    assert_dicts_compatible(
        session,
        {
            "filament_id": random_filament["id"],
            "status": "planned",
            "printer_name": "Ender 3",
            "nozzle_diameter": pytest.approx(0.4),
            "notes": "First calibration run",
        },
    )
    assert "id" in session
    assert "registered" in session
    assert session["steps"] == []

    # Cleanup
    httpx.delete(f"{URL}/api/v1/calibration/session/{session['id']}").raise_for_status()


def test_create_session_minimal(random_filament: dict[str, Any]):
    """Create a session with only required fields."""
    result = httpx.post(
        f"{URL}/api/v1/calibration/session",
        json={"filament_id": random_filament["id"]},
    )
    result.raise_for_status()
    session = result.json()
    assert session["filament_id"] == random_filament["id"]
    assert session["status"] == "planned"
    assert session["steps"] == []

    httpx.delete(f"{URL}/api/v1/calibration/session/{session['id']}").raise_for_status()


def test_create_session_unknown_filament():
    """Creating a session for a non-existent filament returns 404."""
    result = httpx.post(
        f"{URL}/api/v1/calibration/session",
        json={"filament_id": 999999},
    )
    assert_httpx_code(result, 404)


def test_get_session(random_session: dict[str, Any]):
    """Get a session by ID."""
    session_id = random_session["id"]
    result = httpx.get(f"{URL}/api/v1/calibration/session/{session_id}")
    result.raise_for_status()
    assert result.json()["id"] == session_id


def test_get_session_not_found():
    """Getting a non-existent session returns 404."""
    result = httpx.get(f"{URL}/api/v1/calibration/session/999999")
    assert_httpx_code(result, 404)


def test_list_sessions_by_filament(random_filament: dict[str, Any]):
    """List sessions filtered by filament_id."""
    # Create two sessions
    s1 = httpx.post(
        f"{URL}/api/v1/calibration/session",
        json={"filament_id": random_filament["id"], "status": "planned"},
    ).json()
    s2 = httpx.post(
        f"{URL}/api/v1/calibration/session",
        json={"filament_id": random_filament["id"], "status": "complete"},
    ).json()

    result = httpx.get(f"{URL}/api/v1/calibration/session?filament_id={random_filament['id']}")
    result.raise_for_status()
    sessions = result.json()
    ids = {s["id"] for s in sessions}
    assert s1["id"] in ids
    assert s2["id"] in ids
    assert "x-total-count" in result.headers
    assert int(result.headers["x-total-count"]) >= 2

    # Cleanup
    httpx.delete(f"{URL}/api/v1/calibration/session/{s1['id']}").raise_for_status()
    httpx.delete(f"{URL}/api/v1/calibration/session/{s2['id']}").raise_for_status()


def test_update_session(random_session: dict[str, Any]):
    """Update a session's status and printer name."""
    session_id = random_session["id"]
    result = httpx.patch(
        f"{URL}/api/v1/calibration/session/{session_id}",
        json={"status": "in_progress", "printer_name": "Prusa MK4"},
    )
    result.raise_for_status()
    updated = result.json()
    assert updated["status"] == "in_progress"
    assert updated["printer_name"] == "Prusa MK4"


def test_update_session_not_found():
    """Updating a non-existent session returns 404."""
    result = httpx.patch(
        f"{URL}/api/v1/calibration/session/999999",
        json={"status": "complete"},
    )
    assert_httpx_code(result, 404)


def test_delete_session(random_filament: dict[str, Any]):
    """Delete a session."""
    session = httpx.post(
        f"{URL}/api/v1/calibration/session",
        json={"filament_id": random_filament["id"]},
    ).json()
    session_id = session["id"]

    result = httpx.delete(f"{URL}/api/v1/calibration/session/{session_id}")
    result.raise_for_status()

    # Confirm it's gone
    assert_httpx_code(httpx.get(f"{URL}/api/v1/calibration/session/{session_id}"), 404)


def test_delete_filament_cascades_to_sessions():
    """Deleting a filament cascades to its calibration sessions."""
    filament = httpx.post(
        f"{URL}/api/v1/filament",
        json={
            "name": "Cascade Test Filament",
            "material": "PLA",
            "density": 1.24,
            "diameter": 1.75,
        },
    ).json()
    filament_id = filament["id"]

    session = httpx.post(
        f"{URL}/api/v1/calibration/session",
        json={"filament_id": filament_id},
    ).json()
    session_id = session["id"]

    # Delete the filament
    httpx.delete(f"{URL}/api/v1/filament/{filament_id}").raise_for_status()

    # Session should be gone too
    assert_httpx_code(httpx.get(f"{URL}/api/v1/calibration/session/{session_id}"), 404)

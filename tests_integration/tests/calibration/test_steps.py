"""Integration tests for calibration step result endpoints."""

from typing import Any

import httpx

from ..conftest import URL, assert_dicts_compatible, assert_httpx_code


def test_add_step_result(random_session: dict[str, Any]):
    """Add a step result to a session."""
    session_id = random_session["id"]
    result = httpx.post(
        f"{URL}/api/v1/calibration/session/{session_id}/step",
        json={
            "step_type": "temperature",
            "inputs": {"start_temp": 195, "end_temp": 235, "step": 5},
            "outputs": {"best_temp": 215},
            "selected_values": {"temperature": 215},
            "notes": "Tower looked good at 215",
            "confidence": "high",
        },
    )
    result.raise_for_status()
    step = result.json()

    assert_dicts_compatible(
        step,
        {
            "session_id": session_id,
            "step_type": "temperature",
            "inputs": {"start_temp": 195, "end_temp": 235, "step": 5},
            "outputs": {"best_temp": 215},
            "selected_values": {"temperature": 215},
            "notes": "Tower looked good at 215",
            "confidence": "high",
        },
    )
    assert "id" in step
    assert "recorded_at" in step

    # Cleanup
    httpx.delete(f"{URL}/api/v1/calibration/step/{step['id']}").raise_for_status()


def test_add_step_minimal(random_session: dict[str, Any]):
    """Add a step result with only required fields."""
    session_id = random_session["id"]
    result = httpx.post(
        f"{URL}/api/v1/calibration/session/{session_id}/step",
        json={"step_type": "flow_rate"},
    )
    result.raise_for_status()
    step = result.json()
    assert step["step_type"] == "flow_rate"
    assert step["session_id"] == session_id

    httpx.delete(f"{URL}/api/v1/calibration/step/{step['id']}").raise_for_status()


def test_add_step_invalid_session():
    """Adding a step to a non-existent session returns 404."""
    result = httpx.post(
        f"{URL}/api/v1/calibration/session/999999/step",
        json={"step_type": "temperature"},
    )
    assert_httpx_code(result, 404)


def test_all_valid_step_types(random_session: dict[str, Any]):
    """All OrcaSlicer-defined step types are accepted."""
    valid_types = [
        "temperature",
        "volumetric_speed",
        "pressure_advance",
        "flow_rate",
        "retraction",
        "tolerance",
        "cornering",
        "input_shaping",
        "vfa",
    ]
    session_id = random_session["id"]
    created_ids = []
    for step_type in valid_types:
        result = httpx.post(
            f"{URL}/api/v1/calibration/session/{session_id}/step",
            json={"step_type": step_type},
        )
        result.raise_for_status()
        created_ids.append(result.json()["id"])

    # Verify session now has all steps
    session = httpx.get(f"{URL}/api/v1/calibration/session/{session_id}").json()
    assert len(session["steps"]) == len(valid_types)

    # Cleanup
    for step_id in created_ids:
        httpx.delete(f"{URL}/api/v1/calibration/step/{step_id}").raise_for_status()


def test_get_step(random_session: dict[str, Any]):
    """Get a specific step result by ID."""
    session_id = random_session["id"]
    step = httpx.post(
        f"{URL}/api/v1/calibration/session/{session_id}/step",
        json={"step_type": "retraction"},
    ).json()
    step_id = step["id"]

    result = httpx.get(f"{URL}/api/v1/calibration/step/{step_id}")
    result.raise_for_status()
    assert result.json()["id"] == step_id

    httpx.delete(f"{URL}/api/v1/calibration/step/{step_id}").raise_for_status()


def test_get_step_not_found():
    """Getting a non-existent step returns 404."""
    result = httpx.get(f"{URL}/api/v1/calibration/step/999999")
    assert_httpx_code(result, 404)


def test_update_step(random_session: dict[str, Any]):
    """Update a step result."""
    session_id = random_session["id"]
    step = httpx.post(
        f"{URL}/api/v1/calibration/session/{session_id}/step",
        json={"step_type": "flow_rate"},
    ).json()
    step_id = step["id"]

    result = httpx.patch(
        f"{URL}/api/v1/calibration/step/{step_id}",
        json={
            "outputs": {"flow_ratio": 0.98},
            "selected_values": {"flow_ratio": 0.98},
            "confidence": "medium",
        },
    )
    result.raise_for_status()
    updated = result.json()
    assert updated["outputs"] == {"flow_ratio": 0.98}
    assert updated["selected_values"] == {"flow_ratio": 0.98}
    assert updated["confidence"] == "medium"

    httpx.delete(f"{URL}/api/v1/calibration/step/{step_id}").raise_for_status()


def test_delete_step(random_session: dict[str, Any]):
    """Delete a step result."""
    session_id = random_session["id"]
    step = httpx.post(
        f"{URL}/api/v1/calibration/session/{session_id}/step",
        json={"step_type": "cornering"},
    ).json()
    step_id = step["id"]

    httpx.delete(f"{URL}/api/v1/calibration/step/{step_id}").raise_for_status()
    assert_httpx_code(httpx.get(f"{URL}/api/v1/calibration/step/{step_id}"), 404)


def test_delete_session_cascades_to_steps(random_filament: dict[str, Any]):
    """Deleting a session removes its step results."""
    session = httpx.post(
        f"{URL}/api/v1/calibration/session",
        json={"filament_id": random_filament["id"]},
    ).json()
    session_id = session["id"]

    step = httpx.post(
        f"{URL}/api/v1/calibration/session/{session_id}/step",
        json={"step_type": "input_shaping"},
    ).json()
    step_id = step["id"]

    httpx.delete(f"{URL}/api/v1/calibration/session/{session_id}").raise_for_status()

    assert_httpx_code(httpx.get(f"{URL}/api/v1/calibration/step/{step_id}"), 404)

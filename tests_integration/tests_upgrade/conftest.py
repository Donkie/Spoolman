"""Test fixtures for checking an upgraded database over the REST API."""

import json
import os
import time
from pathlib import Path
from typing import Any

import httpx
import pytest

# Spoolman only starts once the upgrade harness has run, which takes a few minutes.
TIMEOUT = 600

URL = os.environ.get("SPOOLMAN_URL", "http://spoolman:8000")

# Written by tests_integration/upgrade/harness.py, and only once all its checks passed.
MANIFEST = Path(os.environ.get("UPGRADE_MANIFEST", "/manifest/manifest.json"))


def pytest_sessionstart(session):  # noqa: ARG001, ANN001
    """Wait for the server to start up."""
    print("pytest: Waiting for spoolman, which starts once the upgrade harness is done...")  # noqa: T201
    start_time = time.time()
    while True:
        try:
            response = httpx.get(f"{URL}/api/v1/health", timeout=1)
            response.raise_for_status()
            print("pytest: Spoolman now seems to be up!")  # noqa: T201
        except httpx.HTTPError:  # noqa: PERF203
            if time.time() - start_time > TIMEOUT:
                raise
            time.sleep(2)
        else:
            break


def js_json(response: httpx.Response) -> Any:  # noqa: ANN401
    """Parse a response like the web UI does: JavaScript reads every number as a double."""
    if not response.is_success:
        pytest.fail(f"Request failed: {response.status_code} {response.text}")
    return json.loads(response.text, parse_int=lambda text: int(float(text)))


@pytest.fixture(scope="session")
def manifest() -> dict[str, Any]:
    """Get what the harness seeded and what it upgraded it to."""
    return json.loads(MANIFEST.read_text())

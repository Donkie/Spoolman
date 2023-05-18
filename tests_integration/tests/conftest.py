"""Test fixtures for integration tests."""

import time

import httpx
import pytest

TIMEOUT = 10


@pytest.fixture(scope="session", autouse=True)
def _wait_for_server():  # noqa: ANN202
    """Wait for the server to start up."""
    start_time = time.time()
    while True:
        try:
            response = httpx.get("http://spoolman:8000")
            response.raise_for_status()
        except httpx.HTTPError:
            if time.time() - start_time > TIMEOUT:
                raise
        else:
            break

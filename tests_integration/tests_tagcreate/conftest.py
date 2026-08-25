"""Fixtures for the tag-auto-create integration stack.

Deliberately its own small conftest rather than a subpackage of tests_integration/tests/:
this suite mounts and runs standalone against docker-compose-sqlite-tagcreate.yml (see that
file's comment), so it never shares a test run with the DB-type matrix, whose compose files
leave SPOOLMAN_TAG_AUTO_CREATE_ENABLED off. Only the handful of fixtures this suite actually
needs are ported over, from tests_integration/tests/conftest.py.
"""

import os
import time
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any

import httpx
import pytest

TIMEOUT = 30

URL = "http://" + os.environ.get("SPOOLMAN_HOST", "spoolman") + ":" + os.environ.get("SPOOLMAN_PORT", "8000")


def pytest_sessionstart(session) -> None:  # noqa: ARG001, ANN001
    """Wait for the server to start up."""
    start_time = time.time()
    while True:
        try:
            print("pytest: Waiting for spoolman to be available...")  # noqa: T201
            response = httpx.get(URL, timeout=1)
            response.raise_for_status()
            print("pytest: Spoolman now seems to be up!")  # noqa: T201
        except httpx.HTTPError:  # noqa: PERF203
            if time.time() - start_time > TIMEOUT:
                raise
            time.sleep(0.5)
        else:
            break


@contextmanager
def _random_vendor() -> Iterator[dict[str, Any]]:
    result = httpx.post(f"{URL}/api/v1/vendor", json={"name": "John", "empty_spool_weight": 246})
    result.raise_for_status()
    vendor: dict[str, Any] = result.json()
    try:
        yield vendor
    finally:
        httpx.delete(f"{URL}/api/v1/vendor/{vendor['id']}")


@contextmanager
def _random_filament() -> Iterator[dict[str, Any]]:
    with _random_vendor() as vendor:
        result = httpx.post(
            f"{URL}/api/v1/filament",
            json={
                "name": "Filament X",
                "vendor_id": vendor["id"],
                "material": "PLA",
                "density": 1.25,
                "diameter": 1.75,
                "weight": 1000,
                "spool_weight": 250,
            },
        )
        result.raise_for_status()
        filament: dict[str, Any] = result.json()
        try:
            yield filament
        finally:
            httpx.delete(f"{URL}/api/v1/filament/{filament['id']}")


@pytest.fixture
def random_filament() -> Iterator[dict[str, Any]]:
    """Return a random filament, cleaned up (along with its vendor) after the test."""
    with _random_filament() as filament:
        yield filament


def assert_httpx_success(response: httpx.Response) -> None:
    """Assert that a response is successful."""
    if not response.is_success:
        pytest.fail(f"Request failed: {response.status_code} {response.text}")


def assert_httpx_code(response: httpx.Response, code: int) -> None:
    """Assert that a response has the expected status code."""
    if response.status_code != code:
        pytest.fail(f"Request failed: {response.status_code} {response.text}")

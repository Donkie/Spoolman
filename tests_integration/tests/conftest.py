"""Test fixtures for integration tests."""

import time
from typing import Any

import httpx
import pytest

TIMEOUT = 10

URL = "http://spoolman:8000"


@pytest.fixture(scope="session", autouse=True)
def _wait_for_server():  # noqa: ANN202
    """Wait for the server to start up."""
    start_time = time.time()
    while True:
        try:
            response = httpx.get("http://spoolman:8000", timeout=1)
            response.raise_for_status()
        except httpx.HTTPError:
            if time.time() - start_time > TIMEOUT:
                raise
        else:
            break


@pytest.fixture()
def random_vendor():
    """Return a random vendor."""
    # Add vendor
    result = httpx.post(
        f"{URL}/api/v1/vendor",
        json={"name": "John"},
    )
    result.raise_for_status()

    vendor = result.json()
    yield vendor

    # Delete vendor
    httpx.delete(f"{URL}/api/v1/vendor/{vendor['id']}").raise_for_status()


@pytest.fixture()
def random_filament(random_vendor: dict[str, Any]):
    """Return a random filament."""
    # Add filament
    result = httpx.post(
        f"{URL}/api/v1/filament",
        json={
            "name": "Filament X",
            "vendor_id": random_vendor["id"],
            "material": "PLA",
            "price": 100,
            "density": 1.25,
            "diameter": 1.75,
            "weight": 1000,
            "spool_weight": 250,
            "article_number": "123456789",
            "comment": "abcdefghåäö",
        },
    )
    result.raise_for_status()

    filament = result.json()
    yield filament

    # Delete filament
    httpx.delete(f"{URL}/api/v1/filament/{filament['id']}").raise_for_status()

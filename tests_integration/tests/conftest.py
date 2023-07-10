"""Test fixtures for integration tests."""

import math
import os
import time
from enum import Enum
from typing import Any

import httpx
import pytest

TIMEOUT = 10

URL = "http://spoolman:8000"


class DbType(str, Enum):
    """Enum for database types."""

    SQLITE = "sqlite"
    POSTGRES = "postgres"
    MYSQL = "mysql"
    COCKROACHDB = "cockroachdb"


def get_db_type() -> DbType:
    """Return the database type from environment variables."""
    env_db_type = os.environ.get("DB_TYPE")
    if env_db_type is None:
        raise RuntimeError("DB_TYPE environment variable not set")
    try:
        db_type = DbType(env_db_type)
    except ValueError as e:
        raise RuntimeError(f"Unknown database type: {env_db_type}") from e
    return db_type


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


def length_from_weight(*, weight: float, diameter: float, density: float) -> float:
    """Calculate the length of a piece of filament.

    Args:
        weight (float): Filament weight in g
        diameter (float): Filament diameter in mm
        density (float): Density of filament material in g/cm3

    Returns:
        float: Length in mm
    """
    volume_cm3 = weight / density
    volume_mm3 = volume_cm3 * 1000
    return volume_mm3 / (math.pi * (diameter / 2) ** 2)

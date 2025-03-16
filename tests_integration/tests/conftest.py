"""Test fixtures for integration tests."""

import math
import os
import time
from collections.abc import Iterable
from contextlib import contextmanager
from enum import StrEnum
from typing import Any

import httpx
import pytest

TIMEOUT = 30

URL = "http://spoolman:" + os.environ.get("SPOOLMAN_PORT", "8000")


class DbType(StrEnum):
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


def pytest_sessionstart(session):  # noqa: ARG001, ANN001
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
def random_vendor_impl():
    """Return a random vendor."""
    # Add vendor
    result = httpx.post(
        f"{URL}/api/v1/vendor",
        json={
            "name": "John",
            "empty_spool_weight": 246,
        },
    )
    result.raise_for_status()

    vendor: dict[str, Any] = result.json()
    yield vendor

    # Delete vendor
    httpx.delete(f"{URL}/api/v1/vendor/{vendor['id']}").raise_for_status()


@contextmanager
def random_empty_vendor_impl():
    """Return a random vendor with only required fields specified."""
    # Add vendor
    result = httpx.post(
        f"{URL}/api/v1/vendor",
        json={"name": ""},
    )
    result.raise_for_status()

    vendor: dict[str, Any] = result.json()
    yield vendor

    # Delete vendor
    httpx.delete(f"{URL}/api/v1/vendor/{vendor['id']}").raise_for_status()


@contextmanager
def random_filament_impl():
    """Return a random filament."""
    with random_vendor_impl() as random_vendor:
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

        filament: dict[str, Any] = result.json()
        yield filament

        # Delete filament
        httpx.delete(f"{URL}/api/v1/filament/{filament['id']}").raise_for_status()


@contextmanager
def random_empty_filament_impl():
    """Return a random filament with only required fields specified."""
    # Add filament
    result = httpx.post(
        f"{URL}/api/v1/filament",
        json={
            "density": 1.25,
            "diameter": 1.75,
        },
    )
    result.raise_for_status()

    filament: dict[str, Any] = result.json()
    yield filament

    # Delete filament
    httpx.delete(f"{URL}/api/v1/filament/{filament['id']}").raise_for_status()


@contextmanager
def random_empty_filament_empty_vendor_impl():
    """Return a random filament with only required fields specified and a vendor with only required fields specified."""
    with random_empty_vendor_impl() as random_empty_vendor:
        # Add filament
        result = httpx.post(
            f"{URL}/api/v1/filament",
            json={
                "vendor_id": random_empty_vendor["id"],
                "density": 1.25,
                "diameter": 1.75,
            },
        )
        result.raise_for_status()

        filament: dict[str, Any] = result.json()
        yield filament

        # Delete filament
        httpx.delete(f"{URL}/api/v1/filament/{filament['id']}").raise_for_status()


@pytest.fixture
def random_vendor():
    """Return a random vendor."""
    with random_vendor_impl() as random_vendor:
        yield random_vendor


@pytest.fixture
def random_empty_vendor():
    """Return a random vendor with only required fields specified."""
    with random_empty_vendor_impl() as random_empty_vendor:
        yield random_empty_vendor


@pytest.fixture
def random_filament():
    """Return a random filament."""
    with random_filament_impl() as random_filament:
        yield random_filament


@pytest.fixture
def random_empty_filament():
    """Return a random filament with only required fields specified."""
    with random_empty_filament_impl() as random_empty_filament:
        yield random_empty_filament


@pytest.fixture
def random_empty_filament_empty_vendor():
    """Return a random filament with only required fields specified and a vendor with only required fields specified."""
    with random_empty_filament_empty_vendor_impl() as random_empty_filament_empty_vendor:
        yield random_empty_filament_empty_vendor


@pytest.fixture(scope="module")
def random_vendor_mod():
    """Return a random vendor."""
    with random_vendor_impl() as random_vendor:
        yield random_vendor


@pytest.fixture(scope="module")
def random_empty_vendor_mod():
    """Return a random vendor with only required fields specified."""
    with random_empty_vendor_impl() as random_empty_vendor:
        yield random_empty_vendor


@pytest.fixture(scope="module")
def random_filament_mod():
    """Return a random filament."""
    with random_filament_impl() as random_filament:
        yield random_filament


@pytest.fixture(scope="module")
def random_empty_filament_mod():
    """Return a random filament with only required fields specified."""
    with random_empty_filament_impl() as random_empty_filament:
        yield random_empty_filament


@pytest.fixture(scope="module")
def random_empty_filament_empty_vendor_mod():
    """Return a random filament with only required fields specified and a vendor with only required fields specified."""
    with random_empty_filament_empty_vendor_impl() as random_empty_filament_empty_vendor:
        yield random_empty_filament_empty_vendor


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


def assert_dicts_compatible(actual: Any, expected: Any, path: str = "") -> None:  # noqa: ANN401
    """Assert that two dictionaries are compatible for unit testing a REST API.

    Args:
        actual (dict): The actual dictionary.
        expected (dict): The expected dictionary.
        path (str): The path to the current level in the dictionary (used for error messages).

    Raises:
        AssertionError: If dictionaries are not compatible.

    """
    # Check if both inputs are dictionaries
    if not (isinstance(actual, dict) and isinstance(expected, dict)):
        raise TypeError(f"At {path}: Actual and expected values must be dictionaries.")

    # Check if actual dictionary contains all keys of the expected dictionary
    missing_keys = [key for key in expected if key not in actual]
    if missing_keys:
        raise AssertionError(f"At {path}: Missing keys in actual dictionary: {missing_keys}")

    # Recursively check values if the corresponding keys exist
    for key, expected_value in expected.items():
        actual_value = actual[key]
        subpath = f"{path}.{key}" if path else key  # Update the path for the current level

        # If the value is another dictionary, recurse into it
        if isinstance(expected_value, dict):
            assert_dicts_compatible(actual_value, expected_value, path=subpath)
        elif actual_value != expected_value:  # Check if values are equal
            raise AssertionError(
                f"At {subpath}: Values do not match. Expected: {expected_value}, Actual: {actual_value}",
            )


def assert_lists_compatible(a: Iterable[dict[str, Any]], b: Iterable[dict[str, Any]], sort_key: str = "id") -> None:
    """Compare two lists of items where the order of the items is not guaranteed."""
    a_sorted = sorted(a, key=lambda x: x[sort_key])
    b_sorted = sorted(b, key=lambda x: x[sort_key])
    if len(a_sorted) != len(b_sorted):
        pytest.fail(f"Lists have different lengths: {len(a_sorted)} != {len(b_sorted)}")

    for a_filament, b_filament in zip(a_sorted, b_sorted):
        assert_dicts_compatible(a_filament, b_filament)


def assert_httpx_success(response: httpx.Response) -> None:
    """Assert that a response is successful."""
    if not response.is_success:
        pytest.fail(f"Request failed: {response.status_code} {response.text}")


def assert_httpx_code(response: httpx.Response, code: int) -> None:
    """Assert that a response has the expected status code."""
    if response.status_code != code:
        pytest.fail(f"Request failed: {response.status_code} {response.text}")

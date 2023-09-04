"""Integration tests for the Filament API endpoint."""

from collections.abc import Iterable
from dataclasses import dataclass
from typing import Any

import httpx
import pytest

URL = "http://spoolman:8000"


@dataclass
class Fixture:
    filaments: list[dict[str, Any]]
    filaments_by_id: dict[str, dict[str, Any]]


@pytest.fixture()
def filaments(random_vendor: dict[str, Any]) -> Iterable[Fixture]:
    """Add some filaments to the database."""
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
    filament_1 = result.json()

    result = httpx.post(
        f"{URL}/api/v1/filament",
        json={
            "name": "Filament Y",
            "vendor_id": random_vendor["id"],
            "material": "ABS",
            "price": 200,
            "density": 1.25,
            "diameter": 1.75,
            "weight": 1000,
            "spool_weight": 250,
            "article_number": "987654321",
            "comment": "abcdefghåäö",
        },
    )
    result.raise_for_status()
    filament_2 = result.json()

    result = httpx.post(
        f"{URL}/api/v1/filament",
        json={
            "name": "Filament Y",
            "material": "PETG",
            "price": 200,
            "density": 1.25,
            "diameter": 1.75,
            "weight": 1000,
            "spool_weight": 250,
            "article_number": "abc",
            "comment": "abcdefghåäö",
        },
    )
    result.raise_for_status()
    filament_3 = result.json()

    added_filaments_by_id = {
        filament_1["id"]: filament_1,
        filament_2["id"]: filament_2,
        filament_3["id"]: filament_3,
    }

    yield Fixture(
        filaments=[filament_1, filament_2, filament_3],
        filaments_by_id=added_filaments_by_id,
    )

    httpx.delete(f"{URL}/api/v1/filament/{filament_1['id']}").raise_for_status()
    httpx.delete(f"{URL}/api/v1/filament/{filament_2['id']}").raise_for_status()
    httpx.delete(f"{URL}/api/v1/filament/{filament_3['id']}").raise_for_status()


def test_find_all_filaments(filaments: Fixture):
    """Test finding filaments from the database."""
    # Execute
    result = httpx.get(
        f"{URL}/api/v1/filament",
    )
    result.raise_for_status()

    # Verify
    filaments_result = result.json()
    assert len(filaments_result) == 3
    for filament in filaments_result:
        assert filament == filaments.filaments_by_id[filament["id"]]


def test_find_filaments_by_name(filaments: Fixture):
    """Test finding filaments from the database."""
    # Execute
    result = httpx.get(
        f"{URL}/api/v1/filament",
        params={"name": "Filament X"},
    )
    result.raise_for_status()

    # Verify
    filaments_result = result.json()
    assert len(filaments_result) == 1
    assert filaments_result[0] == filaments.filaments[0]


def test_find_filaments_by_material(filaments: Fixture):
    """Test finding filaments from the database."""
    # Execute
    result = httpx.get(
        f"{URL}/api/v1/filament",
        params={"material": "abs"},
    )
    result.raise_for_status()

    # Verify
    filaments_result = result.json()
    assert len(filaments_result) == 1
    assert filaments_result[0] == filaments.filaments[1]


@pytest.mark.parametrize("field_name", ["vendor_id", "vendor.id"])
def test_find_filaments_by_vendor_id(filaments: Fixture, field_name: str):
    """Test finding filaments from the database."""
    # Execute
    result = httpx.get(
        f"{URL}/api/v1/filament",
        params={field_name: filaments.filaments[0]["vendor"]["id"]},
    )
    result.raise_for_status()

    # Verify
    filaments_result = result.json()
    assert len(filaments_result) == 2
    for filament in filaments_result:
        assert filament == filaments.filaments_by_id[filament["id"]]


@pytest.mark.parametrize("field_name", ["vendor_name", "vendor.name"])
def test_find_filaments_by_vendor_name(filaments: Fixture, field_name: str):
    """Test finding filaments from the database."""
    # Execute
    result = httpx.get(
        f"{URL}/api/v1/filament",
        params={field_name: filaments.filaments[0]["vendor"]["name"]},
    )
    result.raise_for_status()

    # Verify
    filaments_result = result.json()
    assert len(filaments_result) == 2
    for filament in filaments_result:
        assert filament == filaments.filaments_by_id[filament["id"]]


def test_find_filaments_by_article_number(filaments: Fixture):
    """Test finding filaments from the database."""
    # Execute
    result = httpx.get(
        f"{URL}/api/v1/filament",
        params={"article_number": "321"},
    )
    result.raise_for_status()

    # Verify
    filaments_result = result.json()
    assert len(filaments_result) == 1
    assert filaments_result[0] == filaments.filaments[1]

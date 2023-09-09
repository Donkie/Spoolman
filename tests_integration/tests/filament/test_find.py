"""Integration tests for the Filament API endpoint."""

from collections.abc import Iterable
from dataclasses import dataclass
from typing import Any

import httpx
import pytest

URL = "http://spoolman:8000"


def filament_lists_equal(a: Iterable[dict[str, Any]], b: Iterable[dict[str, Any]]) -> bool:
    """Compare two lists of filaments where the order of the filaments is not guaranteed."""
    return sorted(a, key=lambda x: x["id"]) == sorted(b, key=lambda x: x["id"])


@dataclass
class Fixture:
    filaments: list[dict[str, Any]]


@pytest.fixture(scope="module")
def filaments(random_vendor_mod: dict[str, Any], random_empty_vendor_mod: dict[str, Any]) -> Iterable[Fixture]:
    """Add some filaments to the database."""
    result = httpx.post(
        f"{URL}/api/v1/filament",
        json={
            "name": "Filament X",
            "vendor_id": random_vendor_mod["id"],
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
            "vendor_id": random_vendor_mod["id"],
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
            "name": "Filament Z",
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

    result = httpx.post(
        f"{URL}/api/v1/filament",
        json={
            "density": 1.25,
            "diameter": 1.75,
        },
    )
    result.raise_for_status()
    filament_4 = result.json()

    result = httpx.post(
        f"{URL}/api/v1/filament",
        json={
            "vendor_id": random_empty_vendor_mod["id"],
            "density": 1.5,
            "diameter": 1.75,
        },
    )
    result.raise_for_status()
    filament_5 = result.json()

    yield Fixture(
        filaments=[filament_1, filament_2, filament_3, filament_4, filament_5],
    )

    httpx.delete(f"{URL}/api/v1/filament/{filament_1['id']}").raise_for_status()
    httpx.delete(f"{URL}/api/v1/filament/{filament_2['id']}").raise_for_status()
    httpx.delete(f"{URL}/api/v1/filament/{filament_3['id']}").raise_for_status()
    httpx.delete(f"{URL}/api/v1/filament/{filament_4['id']}").raise_for_status()
    httpx.delete(f"{URL}/api/v1/filament/{filament_5['id']}").raise_for_status()


def test_find_all_filaments(filaments: Fixture):
    # Execute
    result = httpx.get(
        f"{URL}/api/v1/filament",
    )
    result.raise_for_status()

    # Verify
    filaments_result = result.json()
    assert filament_lists_equal(filaments_result, filaments.filaments)


def test_find_all_filaments_sort_asc(filaments: Fixture):
    # Execute
    result = httpx.get(f"{URL}/api/v1/filament?sort=id:asc")
    result.raise_for_status()

    # Verify
    filaments_result = result.json()
    assert len(filaments_result) == len(filaments.filaments)
    assert filaments_result[0] == filaments.filaments[0]


def test_find_all_filaments_sort_desc(filaments: Fixture):
    # Execute
    result = httpx.get(f"{URL}/api/v1/filament?sort=id:desc")
    result.raise_for_status()

    # Verify
    filaments_result = result.json()
    assert len(filaments_result) == len(filaments.filaments)
    assert filaments_result[-1] == filaments.filaments[0]


def test_find_all_filaments_sort_multiple(filaments: Fixture):
    # Execute
    result = httpx.get(f"{URL}/api/v1/filament?sort=density:desc,id:asc")
    result.raise_for_status()

    # Verify
    filaments_result = result.json()
    assert len(filaments_result) == len(filaments.filaments)
    assert filaments_result == [
        filaments.filaments[4],
        filaments.filaments[0],
        filaments.filaments[1],
        filaments.filaments[2],
        filaments.filaments[3],
    ]


def test_find_all_filaments_limit_asc(filaments: Fixture):
    # Execute
    result = httpx.get(f"{URL}/api/v1/filament?sort=id:asc&limit=2")
    result.raise_for_status()

    # Verify
    assert result.headers["X-Total-Count"] == "5"
    filaments_result = result.json()
    assert len(filaments_result) == 2
    assert filaments_result == [filaments.filaments[0], filaments.filaments[1]]


def test_find_all_filaments_limit_desc(filaments: Fixture):
    # Execute
    result = httpx.get(f"{URL}/api/v1/filament?sort=id:desc&limit=2")
    result.raise_for_status()

    # Verify
    assert result.headers["X-Total-Count"] == "5"
    filaments_result = result.json()
    assert len(filaments_result) == 2
    assert filaments_result == [filaments.filaments[-1], filaments.filaments[-2]]


def test_find_all_filaments_limit_asc_offset(filaments: Fixture):
    # Execute
    result = httpx.get(f"{URL}/api/v1/filament?sort=id:asc&limit=2&offset=1")
    result.raise_for_status()

    # Verify
    assert result.headers["X-Total-Count"] == "5"
    filaments_result = result.json()
    assert len(filaments_result) == 2
    assert filaments_result == [filaments.filaments[1], filaments.filaments[2]]


def test_find_all_filaments_limit_desc_offset(filaments: Fixture):
    # Execute
    result = httpx.get(f"{URL}/api/v1/filament?sort=id:desc&limit=2&offset=1")
    result.raise_for_status()

    # Verify
    assert result.headers["X-Total-Count"] == "5"
    filaments_result = result.json()
    assert len(filaments_result) == 2
    assert filaments_result == [filaments.filaments[-2], filaments.filaments[-3]]


def test_find_all_filaments_limit_asc_offset_outside_range(filaments: Fixture):  # noqa: ARG001
    # Execute
    result = httpx.get(f"{URL}/api/v1/filament?sort=id:asc&limit=2&offset=100")
    result.raise_for_status()

    # Verify
    assert result.headers["X-Total-Count"] == "5"
    filaments_result = result.json()
    assert len(filaments_result) == 0


@pytest.mark.parametrize(
    "field_name",
    [
        "id",
        "registered",
        "name",
        "vendor_id",
        "material",
        "price",
        "density",
        "diameter",
        "weight",
        "spool_weight",
        "article_number",
        "comment",
        "settings_extruder_temp",
        "settings_bed_temp",
        "color_hex",
        "vendor.id",
        "vendor.registered",
        "vendor.name",
        "vendor.comment",
    ],
)
def test_find_all_filaments_sort_fields(filaments: Fixture, field_name: str):
    """Test sorting by all fields."""
    # Execute
    result = httpx.get(f"{URL}/api/v1/filament?sort={field_name}:asc")
    result.raise_for_status()

    # Verify
    filaments_result = result.json()
    assert len(filaments_result) == len(filaments.filaments)


def test_find_filaments_by_name(filaments: Fixture):
    # Execute
    result = httpx.get(
        f"{URL}/api/v1/filament",
        params={"name": "Filament X"},
    )
    result.raise_for_status()

    # Verify
    filaments_result = result.json()
    assert filaments_result[0] == filaments.filaments[0]


def test_find_filaments_by_empty_name(filaments: Fixture):
    # Execute
    result = httpx.get(
        f"{URL}/api/v1/filament",
        params={"name": ""},
    )
    result.raise_for_status()

    # Verify
    filaments_result = result.json()
    assert filament_lists_equal(filaments_result, filaments.filaments[3:])


def test_find_filaments_by_material(filaments: Fixture):
    # Execute
    result = httpx.get(
        f"{URL}/api/v1/filament",
        params={"material": "abs"},
    )
    result.raise_for_status()

    # Verify
    filaments_result = result.json()
    assert filaments_result == [filaments.filaments[1]]


def test_find_filaments_by_multiple_materials(filaments: Fixture):
    # Execute
    result = httpx.get(
        f"{URL}/api/v1/filament",
        params={"material": "abs,pla"},
    )
    result.raise_for_status()

    # Verify
    filaments_result = result.json()
    assert filament_lists_equal(filaments_result, filaments.filaments[:2])


def test_find_filaments_by_empty_material(filaments: Fixture):
    # Execute
    result = httpx.get(
        f"{URL}/api/v1/filament",
        params={"material": ""},
    )
    result.raise_for_status()

    # Verify
    filaments_result = result.json()
    assert filament_lists_equal(filaments_result, filaments.filaments[3:])


@pytest.mark.parametrize("field_name", ["vendor_id", "vendor.id"])
def test_find_filaments_by_vendor_id(filaments: Fixture, field_name: str):
    # Execute
    result = httpx.get(
        f"{URL}/api/v1/filament",
        params={field_name: filaments.filaments[0]["vendor"]["id"]},
    )
    result.raise_for_status()

    # Verify
    filaments_result = result.json()
    assert filament_lists_equal(filaments_result, filaments.filaments[:2])


def test_find_filaments_by_multiple_vendor_ids(filaments: Fixture):
    # Execute
    vendor_1 = filaments.filaments[0]["vendor"]["id"]
    vendor_2 = filaments.filaments[4]["vendor"]["id"]
    result = httpx.get(
        f"{URL}/api/v1/filament",
        params={"vendor.id": f"{vendor_1},{vendor_2}"},
    )
    result.raise_for_status()

    # Verify
    filaments_result = result.json()
    assert filament_lists_equal(
        filaments_result,
        [
            filaments.filaments[0],
            filaments.filaments[1],
            filaments.filaments[4],
        ],
    )


def test_find_filaments_by_empty_vendor_id(filaments: Fixture):
    # Execute
    result = httpx.get(
        f"{URL}/api/v1/filament",
        params={"vendor.id": -1},
    )
    result.raise_for_status()

    # Verify
    filaments_result = result.json()
    assert filament_lists_equal(filaments_result, filaments.filaments[2:4])


@pytest.mark.parametrize("field_name", ["vendor_name", "vendor.name"])
def test_find_filaments_by_vendor_name(filaments: Fixture, field_name: str):
    # Execute
    result = httpx.get(
        f"{URL}/api/v1/filament",
        params={field_name: filaments.filaments[0]["vendor"]["name"]},
    )
    result.raise_for_status()

    # Verify
    filaments_result = result.json()
    assert filament_lists_equal(filaments_result, filaments.filaments[:2])


def test_find_filaments_by_empty_vendor_name(filaments: Fixture):
    # Execute
    result = httpx.get(
        f"{URL}/api/v1/filament",
        params={"vendor.name": ""},
    )
    result.raise_for_status()

    # Verify
    filaments_result = result.json()
    assert filaments_result == [filaments.filaments[4]]


def test_find_filaments_by_article_number(filaments: Fixture):
    # Execute
    result = httpx.get(
        f"{URL}/api/v1/filament",
        params={"article_number": "321"},
    )
    result.raise_for_status()

    # Verify
    filaments_result = result.json()
    assert filaments_result[0] == filaments.filaments[1]


def test_find_filaments_by_empty_article_number(filaments: Fixture):
    # Execute
    result = httpx.get(
        f"{URL}/api/v1/filament",
        params={"article_number": ""},
    )
    result.raise_for_status()

    # Verify
    filaments_result = result.json()
    assert filament_lists_equal(filaments_result, filaments.filaments[3:])

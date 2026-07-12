"""Integration tests for the Spool group (aggregate) API endpoint."""

from collections.abc import Iterable
from dataclasses import dataclass
from typing import Any

import httpx
import pytest

from ..conftest import URL


@dataclass
class Fixture:
    filament: dict[str, Any]
    spool_ids: list[int]


@pytest.fixture(scope="module")
def group_spools(random_filament_mod: dict[str, Any]) -> Iterable[Fixture]:
    """Two non-archived spools (1000 g + 400 g remaining) and one archived, on one filament."""
    filament_id = random_filament_mod["id"]
    spool_ids: list[int] = []
    for payload in (
        {"filament_id": filament_id, "remaining_weight": 1000, "location": "Shelf A"},
        {"filament_id": filament_id, "remaining_weight": 400, "location": "Shelf B"},
        {"filament_id": filament_id, "remaining_weight": 1000, "archived": True, "location": "Shelf B"},
    ):
        result = httpx.post(f"{URL}/api/v1/spool", json=payload)
        result.raise_for_status()
        spool_ids.append(result.json()["id"])

    yield Fixture(filament=random_filament_mod, spool_ids=spool_ids)

    for spool_id in spool_ids:
        httpx.delete(f"{URL}/api/v1/spool/{spool_id}").raise_for_status()


def test_group_by_filament(group_spools: Fixture):
    """Grouping by filament returns one group with correct aggregates over non-archived spools."""
    filament_id = group_spools.filament["id"]
    result = httpx.get(
        f"{URL}/api/v1/spool/group",
        params={"group_by": "filament", "filament.id": str(filament_id)},
    )
    result.raise_for_status()
    assert result.headers["x-total-count"] == "1"

    groups = result.json()
    assert len(groups) == 1
    group = groups[0]
    assert group["group_by"] == "filament"
    assert group["key"] == str(filament_id)
    assert group["spool_count"] == 2  # archived excluded by default
    assert group["in_use_count"] == 1  # the 400 g spool has been used
    assert group["total_remaining_weight"] == pytest.approx(1400)
    assert group["filament"]["id"] == filament_id


def test_group_by_filament_allow_archived(group_spools: Fixture):
    """allow_archived includes the archived spool in the aggregates."""
    filament_id = group_spools.filament["id"]
    result = httpx.get(
        f"{URL}/api/v1/spool/group",
        params={"group_by": "filament", "filament.id": str(filament_id), "allow_archived": "true"},
    )
    result.raise_for_status()
    group = result.json()[0]
    assert group["spool_count"] == 3
    assert group["total_remaining_weight"] == pytest.approx(2400)


def test_group_by_location(group_spools: Fixture):
    """Grouping by location yields one group per location, scoped by the filament filter."""
    filament_id = group_spools.filament["id"]
    result = httpx.get(
        f"{URL}/api/v1/spool/group",
        params={"group_by": "location", "filament.id": str(filament_id), "sort": "group.title:asc"},
    )
    result.raise_for_status()
    assert result.headers["x-total-count"] == "2"

    groups = result.json()
    assert [group["key"] for group in groups] == ["Shelf A", "Shelf B"]
    assert [group["spool_count"] for group in groups] == [1, 1]
    # Location groups embed no filament/vendor object.
    assert "filament" not in groups[0]


def test_group_pagination(group_spools: Fixture):
    """limit/offset paginate whole groups; x-total-count reports the total group count."""
    filament_id = group_spools.filament["id"]
    result = httpx.get(
        f"{URL}/api/v1/spool/group",
        params={
            "group_by": "location",
            "filament.id": str(filament_id),
            "sort": "group.title:asc",
            "limit": 1,
            "offset": 1,
        },
    )
    result.raise_for_status()
    assert result.headers["x-total-count"] == "2"
    groups = result.json()
    assert len(groups) == 1
    assert groups[0]["key"] == "Shelf B"


def test_group_invalid_group_by():
    """An unsupported group_by is rejected by request validation."""
    result = httpx.get(f"{URL}/api/v1/spool/group", params={"group_by": "banana"})
    assert result.status_code == 422

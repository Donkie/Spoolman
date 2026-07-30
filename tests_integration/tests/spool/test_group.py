"""Integration tests for the Spool group (aggregate) API endpoint."""

import json
import uuid
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


def test_group_total_remaining_clamps_over_used_spool(random_filament: dict[str, Any]):
    """An over-used spool contributes 0, not a negative, keeping the group total equal to the per-spool sum."""
    filament_id = random_filament["id"]
    spool_ids: list[int] = []
    # One healthy spool (300 g left) and one used past empty (per-spool remaining clamps to 0).
    for payload in (
        {"filament_id": filament_id, "initial_weight": 500, "used_weight": 200},
        {"filament_id": filament_id, "initial_weight": 500, "used_weight": 800},
    ):
        result = httpx.post(f"{URL}/api/v1/spool", json=payload)
        result.raise_for_status()
        spool_ids.append(result.json()["id"])

    try:
        result = httpx.get(f"{URL}/api/v1/spool/{spool_ids[1]}")
        result.raise_for_status()
        assert result.json()["remaining_weight"] == pytest.approx(0)

        result = httpx.get(
            f"{URL}/api/v1/spool/group",
            params={"group_by": "filament", "filament.id": str(filament_id)},
        )
        result.raise_for_status()
        group = result.json()[0]
        # Without the clamp this would be 300 + (-300) = 0.
        assert group["total_remaining_weight"] == pytest.approx(300)
    finally:
        for spool_id in spool_ids:
            httpx.delete(f"{URL}/api/v1/spool/{spool_id}").raise_for_status()


def test_group_invalid_group_by():
    """An unsupported group_by is rejected."""
    result = httpx.get(f"{URL}/api/v1/spool/group", params={"group_by": "banana"})
    assert result.status_code == 400


@dataclass
class ExtraFixture:
    filament_id: int
    field_key: str
    other_field_key: str
    spool_ids: list[int]


@pytest.fixture
def extra_field_spools(random_filament: dict[str, Any]) -> Iterable[ExtraFixture]:
    """Spools carrying a "shelf" text field: two on A, one on B, one with the field unset.

    A second, unrelated text field is set on every spool so a query can both group by one
    extra field and filter by another.
    """
    field_key = f"shelf_{uuid.uuid4().hex[:8]}"
    other_field_key = f"room_{uuid.uuid4().hex[:8]}"
    for key, name in ((field_key, "Shelf"), (other_field_key, "Room")):
        httpx.post(f"{URL}/api/v1/field/spool/{key}", json={"name": name, "field_type": "text"}).raise_for_status()

    filament_id = random_filament["id"]
    spool_ids: list[int] = []
    for shelf in ("A", "A", "B", None):
        extra = {other_field_key: json.dumps("Workshop")}
        if shelf is not None:
            extra[field_key] = json.dumps(shelf)
        result = httpx.post(f"{URL}/api/v1/spool", json={"filament_id": filament_id, "extra": extra})
        result.raise_for_status()
        spool_ids.append(result.json()["id"])

    yield ExtraFixture(
        filament_id=filament_id,
        field_key=field_key,
        other_field_key=other_field_key,
        spool_ids=spool_ids,
    )

    for spool_id in spool_ids:
        httpx.delete(f"{URL}/api/v1/spool/{spool_id}").raise_for_status()
    for key in (field_key, other_field_key):
        httpx.delete(f"{URL}/api/v1/field/spool/{key}").raise_for_status()


def _counts_by_key(groups: list[dict[str, Any]]) -> dict[str | None, int]:
    """Group spool counts keyed by group key.

    Keyed rather than ordered because the databases disagree on where a NULL key sorts
    (SQLite/MariaDB put it first, PostgreSQL/CockroachDB last), and none of these tests
    are about that. The dashboard orders its cards from its own saved layout anyway.
    """
    return {group.get("key"): group["spool_count"] for group in groups}


def test_group_by_extra_field(extra_field_spools: ExtraFixture):
    """Grouping by a spool extra field keys on the decoded value, with a null group for unset."""
    result = httpx.get(
        f"{URL}/api/v1/spool/group",
        params={
            "group_by": f"extra.{extra_field_spools.field_key}",
            "filament.id": str(extra_field_spools.filament_id),
        },
    )
    result.raise_for_status()
    assert result.headers["x-total-count"] == "3"

    groups = result.json()
    # The value is the key, decoded — not the "A" the JSON encoding would give.
    assert _counts_by_key(groups) == {None: 1, "A": 2, "B": 1}
    assert groups[0]["group_by"] == f"extra.{extra_field_spools.field_key}"


def test_group_by_extra_field_with_extra_filter(extra_field_spools: ExtraFixture):
    """Grouping by one extra field while filtering on another keeps both intact.

    The filter is a subquery over the same extra-field table the grouping joins, so this
    guards against the two collapsing into each other.
    """
    result = httpx.get(
        f"{URL}/api/v1/spool/group",
        params={
            "group_by": f"extra.{extra_field_spools.field_key}",
            f"extra.{extra_field_spools.other_field_key}": '"Workshop"',
            "filament.id": str(extra_field_spools.filament_id),
        },
    )
    result.raise_for_status()
    assert _counts_by_key(result.json()) == {None: 1, "A": 2, "B": 1}

    # A filter that matches nothing leaves no groups at all.
    result = httpx.get(
        f"{URL}/api/v1/spool/group",
        params={
            "group_by": f"extra.{extra_field_spools.field_key}",
            f"extra.{extra_field_spools.other_field_key}": '"Garage"',
            "filament.id": str(extra_field_spools.filament_id),
        },
    )
    result.raise_for_status()
    assert result.json() == []


def test_group_by_extra_field_scope_matches_spool_search(extra_field_spools: ExtraFixture):
    """Each group's spools can be fetched back with an exact-match filter on the same field."""
    result = httpx.get(
        f"{URL}/api/v1/spool",
        params={
            f"extra.{extra_field_spools.field_key}": '"A"',
            "filament.id": str(extra_field_spools.filament_id),
        },
    )
    result.raise_for_status()
    assert len(result.json()) == 2

    # An empty filter is how the client scopes the unset group.
    result = httpx.get(
        f"{URL}/api/v1/spool",
        params={
            f"extra.{extra_field_spools.field_key}": "",
            "filament.id": str(extra_field_spools.filament_id),
        },
    )
    result.raise_for_status()
    assert len(result.json()) == 1


def test_group_by_unknown_extra_field():
    """Grouping by an extra field that isn't registered is a client error."""
    result = httpx.get(f"{URL}/api/v1/spool/group", params={"group_by": "extra.does_not_exist"})
    assert result.status_code == 400


def test_group_by_ungroupable_extra_field():
    """Numeric and multi-choice fields hold no single repeatable value, so they can't be grouped by."""
    numeric_key = f"count_{uuid.uuid4().hex[:8]}"
    multi_key = f"tags_{uuid.uuid4().hex[:8]}"
    httpx.post(
        f"{URL}/api/v1/field/spool/{numeric_key}",
        json={"name": "Count", "field_type": "integer"},
    ).raise_for_status()
    httpx.post(
        f"{URL}/api/v1/field/spool/{multi_key}",
        json={"name": "Tags", "field_type": "choice", "choices": ["a", "b"], "multi_choice": True},
    ).raise_for_status()

    try:
        for key in (numeric_key, multi_key):
            result = httpx.get(f"{URL}/api/v1/spool/group", params={"group_by": f"extra.{key}"})
            assert result.status_code == 400, key
    finally:
        for key in (numeric_key, multi_key):
            httpx.delete(f"{URL}/api/v1/field/spool/{key}").raise_for_status()

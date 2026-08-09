"""Integration tests for the spool search endpoint's date-range filters."""

from collections.abc import Iterable
from dataclasses import dataclass
from typing import Any

import httpx
import pytest

from ..conftest import URL, assert_lists_compatible

# The three spools' usage dates. Far enough in the past that "registered" (always now) can never
# be confused with them, and far enough apart that a bound can sit cleanly between two of them.
OLD = "2023-01-01T00:00:00Z"
MIDDLE = "2023-06-01T00:00:00Z"
RECENT = "2024-01-01T00:00:00Z"


@dataclass
class Fixture:
    old: dict[str, Any]
    middle: dict[str, Any]
    recent: dict[str, Any]
    never_used: dict[str, Any]
    filament_id: int


@pytest.fixture(scope="module")
def dated_spools(random_filament_mod: dict[str, Any]) -> Iterable[Fixture]:
    """Four spools on one filament: three used at known times, one never used."""
    filament_id = random_filament_mod["id"]
    spools = []
    for last_used in (OLD, MIDDLE, RECENT):
        result = httpx.post(
            f"{URL}/api/v1/spool",
            json={"filament_id": filament_id, "first_used": last_used, "last_used": last_used},
        )
        result.raise_for_status()
        spools.append(result.json())

    result = httpx.post(f"{URL}/api/v1/spool", json={"filament_id": filament_id})
    result.raise_for_status()
    never_used = result.json()

    yield Fixture(old=spools[0], middle=spools[1], recent=spools[2], never_used=never_used, filament_id=filament_id)

    for spool in [*spools, never_used]:
        httpx.delete(f"{URL}/api/v1/spool/{spool['id']}").raise_for_status()


def find(filament_id: int, **params: str) -> list[dict[str, Any]]:
    """Search this fixture's spools with the given extra query params."""
    result = httpx.get(f"{URL}/api/v1/spool", params={"filament.id": str(filament_id), **params})
    result.raise_for_status()
    return result.json()


def test_find_spools_last_used_after(dated_spools: Fixture):
    found = find(dated_spools.filament_id, last_used_after="2023-03-01T00:00:00Z")
    assert_lists_compatible(found, (dated_spools.middle, dated_spools.recent))


def test_find_spools_last_used_before(dated_spools: Fixture):
    found = find(dated_spools.filament_id, last_used_before="2023-03-01T00:00:00Z")
    assert_lists_compatible(found, (dated_spools.old,))


def test_find_spools_last_used_between(dated_spools: Fixture):
    found = find(
        dated_spools.filament_id,
        last_used_after="2023-03-01T00:00:00Z",
        last_used_before="2023-09-01T00:00:00Z",
    )
    assert_lists_compatible(found, (dated_spools.middle,))


def test_find_spools_first_used_after(dated_spools: Fixture):
    """The same filtering exists for first_used, on its own column."""
    found = find(dated_spools.filament_id, first_used_after="2023-03-01T00:00:00Z")
    assert_lists_compatible(found, (dated_spools.middle, dated_spools.recent))


@pytest.mark.parametrize("param", ["last_used_after", "last_used_before"])
def test_find_spools_date_filter_excludes_never_used(dated_spools: Fixture, param: str):
    """A spool that has never been used matches neither end of a range.

    It has no last_used at all, so it is not "used since March" and not "used before March"
    either -- an absent date is not an early one.
    """
    found = find(dated_spools.filament_id, **{param: "2023-03-01T00:00:00Z"})
    assert all(spool["id"] != dated_spools.never_used["id"] for spool in found)


def test_find_spools_never_used(dated_spools: Fixture):
    """`last_used_unset` is how the never-used spools are reached, since no bound can."""
    found = find(dated_spools.filament_id, last_used_unset="true")
    assert_lists_compatible(found, (dated_spools.never_used,))


def test_find_spools_ever_used(dated_spools: Fixture):
    """And its complement: false selects exactly the spools that do carry a timestamp."""
    found = find(dated_spools.filament_id, last_used_unset="false")
    assert_lists_compatible(found, (dated_spools.old, dated_spools.middle, dated_spools.recent))


def test_find_spools_never_first_used(dated_spools: Fixture):
    """first_used has the same filter, on its own column."""
    found = find(dated_spools.filament_id, first_used_unset="true")
    assert_lists_compatible(found, (dated_spools.never_used,))


def test_find_spool_groups_count_never_used(dated_spools: Fixture):
    """The grouped view answers it too, so a "never used" group count is real."""
    result = httpx.get(
        f"{URL}/api/v1/spool/group",
        params={
            "group_by": "filament",
            "filament.id": str(dated_spools.filament_id),
            "last_used_unset": "true",
        },
    )
    result.raise_for_status()
    groups = result.json()

    assert len(groups) == 1
    assert groups[0]["spool_count"] == 1


def test_find_spools_date_bounds_are_inclusive(dated_spools: Fixture):
    """A bound exactly on a spool's timestamp includes that spool, from either side."""
    assert_lists_compatible(
        find(dated_spools.filament_id, last_used_after=RECENT),
        (dated_spools.recent,),
    )
    assert_lists_compatible(
        find(dated_spools.filament_id, last_used_before=OLD),
        (dated_spools.old,),
    )


def test_find_spools_date_filter_honours_utc_offset(dated_spools: Fixture):
    """An offset-aware bound is converted, not read as if it were already UTC.

    2023-06-01T02:00+02:00 is the same instant as the middle spool's 2023-06-01T00:00Z, so the
    inclusive lower bound keeps it. Read as naive UTC it would be two hours later and drop it.
    """
    assert_lists_compatible(
        find(dated_spools.filament_id, last_used_after="2023-06-01T02:00:00+02:00"),
        (dated_spools.middle, dated_spools.recent),
    )


def test_find_spools_registered_range(dated_spools: Fixture):
    """Registered is set by the server at creation, so every fixture spool is in "recent"."""
    found = find(dated_spools.filament_id, registered_after="2020-01-01T00:00:00Z")
    assert len(found) == 4

    found = find(dated_spools.filament_id, registered_before="2020-01-01T00:00:00Z")
    assert found == []


def test_find_spool_groups_share_the_date_filters(dated_spools: Fixture):
    """The grouped view filters identically, so a group's count matches what opening it shows."""
    result = httpx.get(
        f"{URL}/api/v1/spool/group",
        params={
            "group_by": "filament",
            "filament.id": str(dated_spools.filament_id),
            "last_used_after": "2023-03-01T00:00:00Z",
        },
    )
    result.raise_for_status()
    groups = result.json()

    assert len(groups) == 1
    assert groups[0]["spool_count"] == 2


def test_find_spools_rejects_a_malformed_date(dated_spools: Fixture):
    result = httpx.get(
        f"{URL}/api/v1/spool",
        params={"filament.id": str(dated_spools.filament_id), "last_used_after": "yesterday"},
    )
    assert result.status_code == 422

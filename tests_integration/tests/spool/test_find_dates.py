"""Integration tests for the spool search endpoint's datetime filters.

The value grammar is the one the extra-field datetime filters have used since v0.26.0:
`<start>|<end>` with either end optional, a bare timestamp for an exact match, an empty value for
"no timestamp at all", and commas to OR several of those together. These tests pin that down for
the built-in columns so the two can't drift apart.
"""

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

BETWEEN_OLD_AND_MIDDLE = "2023-03-01T00:00:00Z"
BETWEEN_MIDDLE_AND_RECENT = "2023-09-01T00:00:00Z"


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


def test_find_spools_last_used_from(dated_spools: Fixture):
    found = find(dated_spools.filament_id, last_used=f"{BETWEEN_OLD_AND_MIDDLE}|")
    assert_lists_compatible(found, (dated_spools.middle, dated_spools.recent))


def test_find_spools_last_used_until(dated_spools: Fixture):
    found = find(dated_spools.filament_id, last_used=f"|{BETWEEN_OLD_AND_MIDDLE}")
    assert_lists_compatible(found, (dated_spools.old,))


def test_find_spools_last_used_between(dated_spools: Fixture):
    found = find(dated_spools.filament_id, last_used=f"{BETWEEN_OLD_AND_MIDDLE}|{BETWEEN_MIDDLE_AND_RECENT}")
    assert_lists_compatible(found, (dated_spools.middle,))


def test_find_spools_first_used_from(dated_spools: Fixture):
    """The same filtering exists for first_used, on its own column."""
    found = find(dated_spools.filament_id, first_used=f"{BETWEEN_OLD_AND_MIDDLE}|")
    assert_lists_compatible(found, (dated_spools.middle, dated_spools.recent))


def test_find_spools_last_used_exact(dated_spools: Fixture):
    """A bare timestamp matches that instant exactly, as it does for a datetime extra field."""
    found = find(dated_spools.filament_id, last_used=MIDDLE)
    assert_lists_compatible(found, (dated_spools.middle,))


def test_find_spools_last_used_comma_ors_ranges(dated_spools: Fixture):
    """Comma-separated parts are OR-ed, matching every other filter on this endpoint."""
    found = find(dated_spools.filament_id, last_used=f"|{BETWEEN_OLD_AND_MIDDLE},{BETWEEN_MIDDLE_AND_RECENT}|")
    assert_lists_compatible(found, (dated_spools.old, dated_spools.recent))


def test_find_spools_never_used(dated_spools: Fixture):
    """An empty value means "no timestamp at all", exactly as it does for `location` or an extra field.

    It is also the only way to reach these spools: a NULL matches no bound, so a spool that has
    never been used is neither used since March nor used before March.
    """
    found = find(dated_spools.filament_id, last_used="")
    assert_lists_compatible(found, (dated_spools.never_used,))


def test_find_spools_never_first_used(dated_spools: Fixture):
    found = find(dated_spools.filament_id, first_used="")
    assert_lists_compatible(found, (dated_spools.never_used,))


@pytest.mark.parametrize("value", [f"{BETWEEN_OLD_AND_MIDDLE}|", f"|{BETWEEN_OLD_AND_MIDDLE}"])
def test_find_spools_range_excludes_never_used(dated_spools: Fixture, value: str):
    """A spool with no timestamp falls outside every range, in either direction."""
    found = find(dated_spools.filament_id, last_used=value)
    assert all(spool["id"] != dated_spools.never_used["id"] for spool in found)


def test_find_spools_date_bounds_are_inclusive(dated_spools: Fixture):
    """A bound exactly on a spool's timestamp includes that spool, from either side."""
    assert_lists_compatible(find(dated_spools.filament_id, last_used=f"{RECENT}|"), (dated_spools.recent,))
    assert_lists_compatible(find(dated_spools.filament_id, last_used=f"|{OLD}"), (dated_spools.old,))


def test_find_spools_date_filter_honours_utc_offset(dated_spools: Fixture):
    """An offset-aware bound is converted, not read as if it were already UTC.

    2023-06-01T02:00+02:00 is the same instant as the middle spool's 2023-06-01T00:00Z, so the
    inclusive lower bound keeps it. Read as naive UTC it would be two hours later and drop it.
    """
    assert_lists_compatible(
        find(dated_spools.filament_id, last_used="2023-06-01T02:00:00+02:00|"),
        (dated_spools.middle, dated_spools.recent),
    )


def test_find_spools_registered_range(dated_spools: Fixture):
    """Registered is set by the server at creation, so every fixture spool is in "recent"."""
    assert len(find(dated_spools.filament_id, registered="2020-01-01T00:00:00Z|")) == 4
    assert find(dated_spools.filament_id, registered="|2020-01-01T00:00:00Z") == []


def test_find_spool_groups_share_the_date_filters(dated_spools: Fixture):
    """The grouped view filters identically, so a group's count matches what opening it shows."""
    result = httpx.get(
        f"{URL}/api/v1/spool/group",
        params={
            "group_by": "filament",
            "filament.id": str(dated_spools.filament_id),
            "last_used": f"{BETWEEN_OLD_AND_MIDDLE}|",
        },
    )
    result.raise_for_status()
    groups = result.json()

    assert len(groups) == 1
    assert groups[0]["spool_count"] == 2


def test_find_spool_groups_count_never_used(dated_spools: Fixture):
    result = httpx.get(
        f"{URL}/api/v1/spool/group",
        params={"group_by": "filament", "filament.id": str(dated_spools.filament_id), "last_used": ""},
    )
    result.raise_for_status()
    groups = result.json()

    assert len(groups) == 1
    assert groups[0]["spool_count"] == 1


@pytest.mark.parametrize("value", ["yesterday", "yesterday|", "|yesterday", "|", "2023-13-45T00:00:00Z|"])
def test_find_spools_rejects_a_malformed_date(dated_spools: Fixture, value: str):
    """Bad input is a 400 with a message, the same as every other unparseable filter here."""
    result = httpx.get(
        f"{URL}/api/v1/spool",
        params={"filament.id": str(dated_spools.filament_id), "last_used": value},
    )
    assert result.status_code == 400
    assert "last_used" in result.json()["message"]

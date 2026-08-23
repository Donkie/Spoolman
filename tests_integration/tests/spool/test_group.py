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


@pytest.mark.parametrize("order", ["desc", "asc"])
def test_group_sort_last_used_puts_unused_groups_last(
    random_filament: dict[str, Any],
    random_empty_filament: dict[str, Any],
    order: str,
):
    """A filament whose spools have never been used sorts last, in both directions.

    A group's `last_used` is the max over its spools, so a group of nothing but unused spools
    aggregates to NULL. PostgreSQL and CockroachDB sort NULLs first on DESC, which floated
    every never-used filament to the top of the library (#984, #985); SQLite and MariaDB did
    the same on ASC. "Never used" is the absence of a date, not the newest or the oldest one,
    so it belongs at the bottom whichever way the list points.
    """
    used_id = random_filament["id"]
    unused_id = random_empty_filament["id"]
    spool_ids: list[int] = []
    # The second filament carries no weight, so its spools are created bare -- which is
    # exactly the case under test: nothing used, nothing dated.
    for payload in (
        {"filament_id": used_id, "remaining_weight": 1000},
        {"filament_id": unused_id},
        {"filament_id": unused_id},
    ):
        result = httpx.post(f"{URL}/api/v1/spool", json=payload)
        result.raise_for_status()
        spool_ids.append(result.json()["id"])

    try:
        # Only the first filament's spool has ever been used, so only its group has a date.
        result = httpx.put(f"{URL}/api/v1/spool/{spool_ids[0]}/use", json={"use_weight": 100})
        result.raise_for_status()

        result = httpx.get(
            f"{URL}/api/v1/spool/group",
            params={
                "group_by": "filament",
                "filament.id": f"{used_id},{unused_id}",
                "sort": f"group.last_used:{order}",
            },
        )
        result.raise_for_status()
        groups = result.json()
        assert [group["key"] for group in groups] == [str(used_id), str(unused_id)]
        assert groups[1].get("last_used") is None
    finally:
        for spool_id in spool_ids:
            httpx.delete(f"{URL}/api/v1/spool/{spool_id}").raise_for_status()


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

    Keyed rather than ordered because none of these tests are about ordering -- the dashboard
    orders its cards from its own saved layout anyway. (Group ordering itself no longer varies
    by database: order_by_clauses puts a NULL key last everywhere, where the four used to
    disagree.)
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


def test_group_by_extra_field_unset_spellings_are_one_group(random_filament: dict[str, Any]):
    """Every way of spelling "no value" is the same group, and that group's filter returns all of it.

    A spool can carry no row for the field, a row holding JSON null, or a row holding the empty
    string that clearing a text box writes. All three read as unset, so they have to group
    together AND come back from the empty filter that scopes the group — issue #1019, where the
    dashboard counted 11 unassigned spools and then listed 3 of them.
    """
    field_key = f"printer_{uuid.uuid4().hex[:8]}"
    httpx.post(
        f"{URL}/api/v1/field/spool/{field_key}",
        json={"name": "Printer", "field_type": "text"},
    ).raise_for_status()

    filament_id = random_filament["id"]
    spool_ids: list[int] = []
    try:
        # No row for the field at all.
        result = httpx.post(f"{URL}/api/v1/spool", json={"filament_id": filament_id})
        result.raise_for_status()
        spool_ids.append(result.json()["id"])
        # A row that was set and then cleared with a null, dropping it.
        for cleared in (None, ""):
            result = httpx.post(
                f"{URL}/api/v1/spool",
                json={"filament_id": filament_id, "extra": {field_key: json.dumps("Prusa")}},
            )
            result.raise_for_status()
            spool_id = result.json()["id"]
            spool_ids.append(spool_id)
            value = None if cleared is None else json.dumps(cleared)
            httpx.patch(f"{URL}/api/v1/spool/{spool_id}", json={"extra": {field_key: value}}).raise_for_status()
        # One spool that really is assigned, as a control.
        result = httpx.post(
            f"{URL}/api/v1/spool",
            json={"filament_id": filament_id, "extra": {field_key: json.dumps("Prusa")}},
        )
        result.raise_for_status()
        spool_ids.append(result.json()["id"])

        result = httpx.get(
            f"{URL}/api/v1/spool/group",
            params={"group_by": f"extra.{field_key}", "filament.id": str(filament_id)},
        )
        result.raise_for_status()
        # One unset group, not one per spelling — the client keys them all as "unassigned".
        assert _counts_by_key(result.json()) == {None: 3, "Prusa": 1}

        result = httpx.get(
            f"{URL}/api/v1/spool",
            params={f"extra.{field_key}": "", "filament.id": str(filament_id)},
        )
        result.raise_for_status()
        assert len(result.json()) == 3
        assert result.headers["x-total-count"] == "3"
    finally:
        for spool_id in spool_ids:
            httpx.delete(f"{URL}/api/v1/spool/{spool_id}").raise_for_status()
        httpx.delete(f"{URL}/api/v1/field/spool/{field_key}").raise_for_status()


def test_group_by_location_blank_and_null_are_one_group(random_filament: dict[str, Any]):
    """A blank location groups with an absent one, the same as the extra-field case above."""
    filament_id = random_filament["id"]
    spool_ids: list[int] = []
    try:
        for payload in (
            {"filament_id": filament_id},
            {"filament_id": filament_id, "location": ""},
            {"filament_id": filament_id, "location": "Shelf A"},
        ):
            result = httpx.post(f"{URL}/api/v1/spool", json=payload)
            result.raise_for_status()
            spool_ids.append(result.json()["id"])

        result = httpx.get(
            f"{URL}/api/v1/spool/group",
            params={"group_by": "location", "filament.id": str(filament_id)},
        )
        result.raise_for_status()
        assert _counts_by_key(result.json()) == {None: 2, "Shelf A": 1}

        result = httpx.get(f"{URL}/api/v1/spool", params={"location": "", "filament.id": str(filament_id)})
        result.raise_for_status()
        assert len(result.json()) == 2
    finally:
        for spool_id in spool_ids:
            httpx.delete(f"{URL}/api/v1/spool/{spool_id}").raise_for_status()


def test_group_by_unknown_extra_field():
    """Grouping by an extra field that isn't registered is a client error."""
    result = httpx.get(f"{URL}/api/v1/spool/group", params={"group_by": "extra.does_not_exist"})
    assert result.status_code == 400


# --- include_empty: filaments with no spools -------------------------------
#
# Grouping aggregates over spools, so a filament nobody owns a spool of can never
# produce a group and simply vanishes from the list -- which reads as "in stock"
# when it means the opposite (#1092). include_empty turns the query around and
# lists it as a group of zero.


@dataclass
class EmptyFixture:
    stocked_id: int
    empty_id: int
    archived_only_id: int
    spool_ids: list[int]


@pytest.fixture(scope="module")
def empty_group_filaments(random_vendor_mod: dict[str, Any]) -> Iterable[EmptyFixture]:
    """Three filaments of one vendor: one stocked, one with only an archived spool, one with none."""
    filament_ids: list[int] = []
    for name, material in (("Stocked", "PLA"), ("Empty", "ABS"), ("ArchivedOnly", "PETG")):
        result = httpx.post(
            f"{URL}/api/v1/filament",
            json={
                "name": f"{name}-{uuid.uuid4().hex[:8]}",
                "vendor_id": random_vendor_mod["id"],
                "material": material,
                "density": 1.25,
                "diameter": 1.75,
                "weight": 1000,
            },
        )
        result.raise_for_status()
        filament_ids.append(result.json()["id"])
    stocked_id, empty_id, archived_only_id = filament_ids

    spool_ids: list[int] = []
    for payload in (
        {"filament_id": stocked_id, "remaining_weight": 1000, "location": "Shelf A"},
        {"filament_id": stocked_id, "remaining_weight": 400, "location": "Shelf B"},
        {"filament_id": archived_only_id, "remaining_weight": 900, "archived": True},
    ):
        result = httpx.post(f"{URL}/api/v1/spool", json=payload)
        result.raise_for_status()
        spool_ids.append(result.json()["id"])

    yield EmptyFixture(
        stocked_id=stocked_id,
        empty_id=empty_id,
        archived_only_id=archived_only_id,
        spool_ids=spool_ids,
    )

    for spool_id in spool_ids:
        httpx.delete(f"{URL}/api/v1/spool/{spool_id}").raise_for_status()
    for filament_id in filament_ids:
        httpx.delete(f"{URL}/api/v1/filament/{filament_id}").raise_for_status()


def _group_by_key(groups: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {group["key"]: group for group in groups}


def _all_ids(fixture: EmptyFixture) -> str:
    return f"{fixture.stocked_id},{fixture.empty_id},{fixture.archived_only_id}"


def test_group_by_filament_omits_empty_by_default(empty_group_filaments: EmptyFixture):
    """Without the flag, only filaments that hold a matching spool are groups."""
    result = httpx.get(
        f"{URL}/api/v1/spool/group",
        params={"group_by": "filament", "filament.id": _all_ids(empty_group_filaments)},
    )
    result.raise_for_status()
    assert result.headers["x-total-count"] == "1"
    assert _group_by_key(result.json()).keys() == {str(empty_group_filaments.stocked_id)}


def test_group_by_filament_include_empty(empty_group_filaments: EmptyFixture):
    """include_empty lists the spool-less filaments too, as groups of zero."""
    result = httpx.get(
        f"{URL}/api/v1/spool/group",
        params={
            "group_by": "filament",
            "filament.id": _all_ids(empty_group_filaments),
            "include_empty": "true",
        },
    )
    result.raise_for_status()
    assert result.headers["x-total-count"] == "3"

    groups = _group_by_key(result.json())
    stocked = groups[str(empty_group_filaments.stocked_id)]
    assert stocked["spool_count"] == 2
    assert stocked["total_remaining_weight"] == pytest.approx(1400)

    for filament_id in (empty_group_filaments.empty_id, empty_group_filaments.archived_only_id):
        group = groups[str(filament_id)]
        assert group["group_by"] == "filament"
        assert group["spool_count"] == 0
        assert group["in_use_count"] == 0
        assert group["total_remaining_weight"] == pytest.approx(0)
        # The filament is hydrated exactly as a populated group's is, so the client can
        # draw the same header (name, colour, manufacturer) for it.
        assert group["filament"]["id"] == filament_id
        # Never used, so no timestamp -- excluded from the response rather than zeroed.
        assert "last_used" not in group


def test_include_empty_respects_allow_archived(empty_group_filaments: EmptyFixture):
    """A filament is only empty relative to the spools being counted."""
    result = httpx.get(
        f"{URL}/api/v1/spool/group",
        params={
            "group_by": "filament",
            "filament.id": _all_ids(empty_group_filaments),
            "include_empty": "true",
            "allow_archived": "true",
        },
    )
    result.raise_for_status()
    groups = _group_by_key(result.json())
    assert groups[str(empty_group_filaments.archived_only_id)]["spool_count"] == 1
    assert groups[str(empty_group_filaments.empty_id)]["spool_count"] == 0


def test_include_empty_applies_filament_filters(empty_group_filaments: EmptyFixture):
    """Filament-level filters select which filaments are groups, empty ones included."""
    result = httpx.get(
        f"{URL}/api/v1/spool/group",
        params={
            "group_by": "filament",
            "filament.id": _all_ids(empty_group_filaments),
            "filament.material": '"ABS"',
            "include_empty": "true",
        },
    )
    result.raise_for_status()
    assert result.headers["x-total-count"] == "1"
    groups = result.json()
    assert groups[0]["key"] == str(empty_group_filaments.empty_id)
    assert groups[0]["spool_count"] == 0


def test_include_empty_sorts_and_pages_over_all_groups(empty_group_filaments: EmptyFixture):
    """Empty groups take part in ordering and pagination like any other group."""
    params = {
        "group_by": "filament",
        "filament.id": _all_ids(empty_group_filaments),
        "include_empty": "true",
        "sort": "group.spool_count:desc",
    }
    result = httpx.get(f"{URL}/api/v1/spool/group", params=params)
    result.raise_for_status()
    assert [g["spool_count"] for g in result.json()] == [2, 0, 0]

    # Paging over the same ordering must partition the groups, never repeat or drop one.
    seen: list[str] = []
    for offset in (0, 2):
        page = httpx.get(f"{URL}/api/v1/spool/group", params={**params, "limit": 2, "offset": offset})
        page.raise_for_status()
        assert page.headers["x-total-count"] == "3"
        seen.extend(g["key"] for g in page.json())
    assert sorted(seen) == sorted(
        [
            str(empty_group_filaments.stocked_id),
            str(empty_group_filaments.empty_id),
            str(empty_group_filaments.archived_only_id),
        ],
    )


def test_include_empty_applies_filament_extra_field_filters():
    """A filament extra field selects empty groups too, which is a different join from the spool query.

    The spool query reaches a filament's extra fields through Spool.filament_id; this one has no
    spool to go through and matches on Filament.id directly (see apply_spool_related_extra_filters'
    link_column). A filament with no spools has to answer the filter on its own.
    """
    grade_key = f"grade_{uuid.uuid4().hex[:8]}"
    httpx.post(
        f"{URL}/api/v1/field/filament/{grade_key}",
        json={"name": "Grade", "field_type": "text"},
    ).raise_for_status()

    filament_ids: list[int] = []
    try:
        for grade in ("Premium", "Standard"):
            result = httpx.post(
                f"{URL}/api/v1/filament",
                json={
                    "name": f"Grade-{grade}-{uuid.uuid4().hex[:8]}",
                    "density": 1.25,
                    "diameter": 1.75,
                    "extra": {grade_key: json.dumps(grade)},
                },
            )
            result.raise_for_status()
            filament_ids.append(result.json()["id"])
        premium_id, _standard_id = filament_ids

        # Neither filament has a single spool, so without include_empty there is nothing at all.
        result = httpx.get(
            f"{URL}/api/v1/spool/group",
            params={"group_by": "filament", f"filament.extra.{grade_key}": '"Premium"'},
        )
        result.raise_for_status()
        assert result.json() == []

        result = httpx.get(
            f"{URL}/api/v1/spool/group",
            params={
                "group_by": "filament",
                f"filament.extra.{grade_key}": '"Premium"',
                "include_empty": "true",
            },
        )
        result.raise_for_status()
        assert result.headers["x-total-count"] == "1"
        group = result.json()[0]
        assert group["key"] == str(premium_id)
        assert group["spool_count"] == 0
    finally:
        for filament_id in filament_ids:
            httpx.delete(f"{URL}/api/v1/filament/{filament_id}").raise_for_status()
        httpx.delete(f"{URL}/api/v1/field/filament/{grade_key}").raise_for_status()


def test_include_empty_rejected_for_other_group_by():
    """Every other axis is keyed by a value read off the spools, so it has no empty groups."""
    for group_by in ("vendor", "material", "location"):
        result = httpx.get(
            f"{URL}/api/v1/spool/group",
            params={"group_by": group_by, "include_empty": "true"},
        )
        assert result.status_code == 400, group_by


def test_include_empty_rejected_with_spool_level_filters(empty_group_filaments: EmptyFixture):
    """Asking for filaments with no spools AND filtering on the spools is a contradiction.

    Answering it either way is worse than refusing: the filter would delete every empty group,
    silently making the flag a no-op, or be dropped, returning the whole catalogue as empty.
    """
    for params in (
        {"location": '"Shelf A"'},
        {"lot_nr": '"B12"'},
        {"first_used": "2024-05-01T00:00:00Z|"},
        {"last_used": "2024-05-01T00:00:00Z|"},
        {"registered": "2024-05-01T00:00:00Z|"},
    ):
        result = httpx.get(
            f"{URL}/api/v1/spool/group",
            params={"group_by": "filament", "include_empty": "true", **params},
        )
        assert result.status_code == 400, params

    # A spool extra field is spool-level too, whatever it is called.
    field_key = f"opened_{uuid.uuid4().hex[:8]}"
    httpx.post(
        f"{URL}/api/v1/field/spool/{field_key}",
        json={"name": "Opened", "field_type": "text"},
    ).raise_for_status()
    try:
        result = httpx.get(
            f"{URL}/api/v1/spool/group",
            params={"group_by": "filament", "include_empty": "true", f"extra.{field_key}": '"yes"'},
        )
        assert result.status_code == 400
    finally:
        httpx.delete(f"{URL}/api/v1/field/spool/{field_key}").raise_for_status()

    # Archiving is the exception: it is the default view, and a filament whose every spool is
    # archived genuinely has none to print with, so it belongs in the list as an empty group.
    result = httpx.get(
        f"{URL}/api/v1/spool/group",
        params={
            "group_by": "filament",
            "include_empty": "true",
            "filament.id": _all_ids(empty_group_filaments),
        },
    )
    result.raise_for_status()
    assert _group_by_key(result.json())[str(empty_group_filaments.archived_only_id)]["spool_count"] == 0


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

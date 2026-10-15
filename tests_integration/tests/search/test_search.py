"""Integration tests for the /search endpoint."""

import json
import uuid
from collections.abc import Iterable
from dataclasses import dataclass
from typing import Any

import httpx
import pytest

from ..conftest import URL, assert_httpx_success

# Unique per test run so our queries can't collide with data from other tests.
SFX = uuid.uuid4().hex[:8]

VENDOR_NAME = f"SearchVendor{SFX}"
FILAMENT_NAME = f"SearchFilament{SFX}"
FILAMENT_NAME_UNICODE = f"Червоний{SFX}"
FILAMENT_COMMENT = f"fcomment{SFX}"
SPOOL_LOCATION = f"SearchLoc{SFX}"
SPOOL_COMMENT = f"scomment{SFX}"
TEXT_VALUE = f"TextVal{SFX}"
CHOICE_VALUE = f"ChoiceVal{SFX}"


@dataclass
class Fixture:
    vendor: dict[str, Any]
    filament: dict[str, Any]
    spool: dict[str, Any]


@pytest.fixture(scope="module")
def data() -> Iterable[Fixture]:
    """Seed one vendor + one red filament + one spool with text/choice extra fields."""
    # Extra field definitions on the spool.
    assert_httpx_success(
        httpx.post(
            f"{URL}/api/v1/field/spool/searchtext",
            json={"name": "Search Text", "field_type": "text"},
        ),
    )
    assert_httpx_success(
        httpx.post(
            f"{URL}/api/v1/field/spool/searchchoice",
            json={
                "name": "Search Choice",
                "field_type": "choice",
                "choices": [CHOICE_VALUE, "other"],
                "multi_choice": False,
            },
        ),
    )

    result = httpx.post(f"{URL}/api/v1/vendor", json={"name": VENDOR_NAME})
    result.raise_for_status()
    vendor = result.json()

    result = httpx.post(
        f"{URL}/api/v1/filament",
        json={
            "name": FILAMENT_NAME,
            "vendor_id": vendor["id"],
            "material": "PLA",
            "density": 1.25,
            "diameter": 1.75,
            "weight": 1000,
            "color_hex": "ff0000",
            "comment": FILAMENT_COMMENT,
        },
    )
    result.raise_for_status()
    filament = result.json()

    result = httpx.post(
        f"{URL}/api/v1/spool",
        json={
            "filament_id": filament["id"],
            "remaining_weight": 1000,
            "location": SPOOL_LOCATION,
            "comment": SPOOL_COMMENT,
            "extra": {
                "searchtext": json.dumps(TEXT_VALUE),
                "searchchoice": json.dumps(CHOICE_VALUE),
            },
        },
    )
    result.raise_for_status()
    spool = result.json()

    yield Fixture(vendor=vendor, filament=filament, spool=spool)

    httpx.delete(f"{URL}/api/v1/spool/{spool['id']}").raise_for_status()
    httpx.delete(f"{URL}/api/v1/filament/{filament['id']}").raise_for_status()
    httpx.delete(f"{URL}/api/v1/vendor/{vendor['id']}").raise_for_status()
    httpx.delete(f"{URL}/api/v1/field/spool/searchtext").raise_for_status()
    httpx.delete(f"{URL}/api/v1/field/spool/searchchoice").raise_for_status()


def _search(
    query: str,
    color_similarity_threshold: float | None = None,
    *,
    allow_archived: bool | None = None,
    spools_per_filament: int | None = None,
) -> dict[str, Any]:
    params: dict[str, Any] = {"q": query}
    if color_similarity_threshold is not None:
        params["color_similarity_threshold"] = color_similarity_threshold
    if allow_archived is not None:
        params["allow_archived"] = allow_archived
    if spools_per_filament is not None:
        params["spools_per_filament"] = spools_per_filament
    result = httpx.get(f"{URL}/api/v1/search", params=params)
    result.raise_for_status()
    return result.json()


def _has(items: list[dict[str, Any]], entity_key: str, entity_id: int, match_field: str) -> bool:
    return any(i[entity_key]["id"] == entity_id and i["match_field"] == match_field for i in items)


def test_search_filament_name(data: Fixture):
    body = _search(FILAMENT_NAME)
    assert body["is_color_query"] is False
    assert _has(body["filaments"], "filament", data.filament["id"], "name")


def test_search_filament_name_unicode():
    result = httpx.post(
        f"{URL}/api/v1/filament",
        json={"name": FILAMENT_NAME_UNICODE, "density": 1.25, "diameter": 1.75},
    )
    result.raise_for_status()
    filament = result.json()
    body = _search(FILAMENT_NAME_UNICODE.lower())
    assert _has(body["filaments"], "filament", filament["id"], "name")
    httpx.delete(f"{URL}/api/v1/filament/{filament['id']}").raise_for_status()


def test_search_vendor_name(data: Fixture):
    body = _search(VENDOR_NAME)
    assert _has(body["vendors"], "vendor", data.vendor["id"], "name")


def test_search_filament_comment(data: Fixture):
    body = _search(FILAMENT_COMMENT)
    assert _has(body["filaments"], "filament", data.filament["id"], "comment")


def test_search_spool_location(data: Fixture):
    body = _search(SPOOL_LOCATION)
    assert _has(body["spools"], "spool", data.spool["id"], "location")


def test_search_spool_comment(data: Fixture):
    body = _search(SPOOL_COMMENT)
    assert _has(body["spools"], "spool", data.spool["id"], "comment")


def test_search_extra_text_field(data: Fixture):
    body = _search(TEXT_VALUE)
    assert _has(body["spools"], "spool", data.spool["id"], "extra.searchtext")


def test_search_extra_choice_field(data: Fixture):
    body = _search(CHOICE_VALUE)
    assert _has(body["spools"], "spool", data.spool["id"], "extra.searchchoice")


def test_search_spool_by_id(data: Fixture):
    body = _search(str(data.spool["id"]))
    assert _has(body["spools"], "spool", data.spool["id"], "id")


def test_search_color_name(data: Fixture):
    body = _search("red", color_similarity_threshold=20.0)
    assert body["is_color_query"] is True
    assert _has(body["filaments"], "filament", data.filament["id"], "color")


def test_search_color_hex(data: Fixture):
    body = _search("#ff0000", color_similarity_threshold=5.0)
    assert body["is_color_query"] is True
    assert _has(body["filaments"], "filament", data.filament["id"], "color")


def test_search_vendor_and_material(data: Fixture):
    """Terms may match different fields: one the vendor name, one the material."""
    body = _search(f"{VENDOR_NAME} PLA")
    assert _has(body["filaments"], "filament", data.filament["id"], "material")


def test_search_terms_match_different_spool_fields(data: Fixture):
    body = _search(f"{SPOOL_LOCATION} {SPOOL_COMMENT}")
    assert any(i["spool"]["id"] == data.spool["id"] for i in body["spools"])


def test_search_term_matching_native_and_extra_field(data: Fixture):
    body = _search(f"{SPOOL_LOCATION} {TEXT_VALUE}")
    assert any(i["spool"]["id"] == data.spool["id"] for i in body["spools"])


def test_search_all_terms_required(data: Fixture):
    """A term that matches nothing excludes the entity, even if the other terms match."""
    assert data.vendor["id"]  # ensure the fixture data exists so the empty result is meaningful
    body = _search(f"{VENDOR_NAME} zzznomatch{SFX}")
    assert body["spools"] == []
    assert body["filaments"] == []
    assert body["vendors"] == []


def test_search_no_match(data: Fixture):
    assert data.spool["id"]  # ensure the fixture data exists so "no match" is meaningful
    body = _search(f"zzznomatch{SFX}")
    assert body["is_color_query"] is False
    assert body["spools"] == []
    assert body["filaments"] == []
    assert body["vendors"] == []


@pytest.fixture
def archived_spool(data: Fixture) -> Iterable[dict[str, Any]]:
    """Create an archived spool sharing the fixture's searchable location."""
    result = httpx.post(
        f"{URL}/api/v1/spool",
        json={
            "filament_id": data.filament["id"],
            "remaining_weight": 1000,
            "location": SPOOL_LOCATION,
            "archived": True,
        },
    )
    result.raise_for_status()
    spool = result.json()
    yield spool
    httpx.delete(f"{URL}/api/v1/spool/{spool['id']}").raise_for_status()


def test_search_excludes_archived_spools_by_default(archived_spool: dict[str, Any]):
    """Archived spools are hidden unless asked for, matching GET /spool."""
    body = _search(SPOOL_LOCATION)
    assert not _has(body["spools"], "spool", archived_spool["id"], "location")


def test_search_includes_archived_spools_when_allowed(archived_spool: dict[str, Any]):
    body = _search(SPOOL_LOCATION, allow_archived=True)
    assert _has(body["spools"], "spool", archived_spool["id"], "location")


def test_search_by_id_respects_allow_archived(archived_spool: dict[str, Any]):
    """The exact-id shortcut must not surface an archived spool either."""
    spool_id = archived_spool["id"]
    assert not _has(_search(str(spool_id))["spools"], "spool", spool_id, "id")
    assert _has(_search(str(spool_id), allow_archived=True)["spools"], "spool", spool_id, "id")


# --- spools attached to filament results (issue #993) -------------------------------


@pytest.fixture
def extra_spools(data: Fixture) -> Iterable[list[dict[str, Any]]]:
    """Two more spools of the fixture's filament, so it has three in total."""
    spools = []
    for _ in range(2):
        result = httpx.post(
            f"{URL}/api/v1/spool",
            json={"filament_id": data.filament["id"], "remaining_weight": 600},
        )
        result.raise_for_status()
        spools.append(result.json())
    yield spools
    for spool in spools:
        httpx.delete(f"{URL}/api/v1/spool/{spool['id']}").raise_for_status()


def _filament_hit(body: dict[str, Any], filament_id: int) -> dict[str, Any]:
    return next(i for i in body["filaments"] if i["filament"]["id"] == filament_id)


def test_filament_spools_omitted_by_default(data: Fixture, extra_spools: list[dict[str, Any]]):
    """Not asking for spools leaves the response exactly as it was before."""
    assert extra_spools  # the filament does have spools to omit
    hit = _filament_hit(_search(FILAMENT_NAME), data.filament["id"])
    assert "spools" not in hit
    assert "spool_count" not in hit


def test_filament_spools_returned_when_requested(data: Fixture, extra_spools: list[dict[str, Any]]):
    """A filament hit carries its spools, oldest id first, plus the total count."""
    hit = _filament_hit(_search(FILAMENT_NAME, spools_per_filament=5), data.filament["id"])
    expected = sorted([data.spool["id"], *(s["id"] for s in extra_spools)])
    assert [s["id"] for s in hit["spools"]] == expected
    assert hit["spool_count"] == 3


def test_filament_spools_have_remaining_weight(data: Fixture, extra_spools: list[dict[str, Any]]):
    """The compact spool derives the same remaining weight the spool endpoint reports."""
    hit = _filament_hit(_search(FILAMENT_NAME, spools_per_filament=5), data.filament["id"])
    by_id = {s["id"]: s for s in hit["spools"]}
    assert by_id[data.spool["id"]]["remaining_weight"] == pytest.approx(1000)
    assert by_id[extra_spools[0]["id"]]["remaining_weight"] == pytest.approx(600)


def test_filament_spools_location(data: Fixture):
    hit = _filament_hit(_search(FILAMENT_NAME, spools_per_filament=5), data.filament["id"])
    assert hit["spools"][0]["location"] == SPOOL_LOCATION


def test_filament_spools_respect_the_requested_count(data: Fixture, extra_spools: list[dict[str, Any]]):
    """Only the first N come back, but the count still reports every spool."""
    assert extra_spools
    hit = _filament_hit(_search(FILAMENT_NAME, spools_per_filament=2), data.filament["id"])
    assert len(hit["spools"]) == 2
    assert hit["spool_count"] == 3


def test_filament_spools_zero_means_omitted(data: Fixture):
    hit = _filament_hit(_search(FILAMENT_NAME, spools_per_filament=0), data.filament["id"])
    assert "spools" not in hit


def test_filament_spools_exclude_archived_by_default(data: Fixture, archived_spool: dict[str, Any]):
    """An archived spool must not be offered as a shortcut, nor counted."""
    hit = _filament_hit(_search(FILAMENT_NAME, spools_per_filament=10), data.filament["id"])
    assert archived_spool["id"] not in [s["id"] for s in hit["spools"]]
    assert hit["spool_count"] == 1


def test_filament_spools_include_archived_when_allowed(data: Fixture, archived_spool: dict[str, Any]):
    hit = _filament_hit(
        _search(FILAMENT_NAME, allow_archived=True, spools_per_filament=10),
        data.filament["id"],
    )
    archived = next(s for s in hit["spools"] if s["id"] == archived_spool["id"])
    assert archived["archived"] is True
    assert hit["spool_count"] == 2

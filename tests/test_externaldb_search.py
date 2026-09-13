"""Tests for searching and paging through the external filament catalog."""

import json
from pathlib import Path

import pytest

from spoolman import externaldb
from spoolman.database.search import SearchQuery, parse_query


def filament(
    i: int,
    manufacturer: str,
    name: str,
    material: str = "PLA",
    weight: float = 1000,
    diameter: float = 1.75,
) -> dict:
    return {
        "id": f"filament_{i}",
        "manufacturer": manufacturer,
        "name": name,
        "material": material,
        "density": 1.24,
        "weight": weight,
        "diameter": diameter,
    }


@pytest.fixture(autouse=True)
def catalog(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    rows = [filament(i, "Elegoo", f"White {i}") for i in range(25)]
    rows[0]["weight"] = 250
    rows.insert(10, filament(100, "Polymaker", "PolyLite Black", "PETG"))
    rows.insert(11, filament(101, "Polymaker", "Test 100", weight=100))
    rows.insert(12, filament(102, "Polymaker", "Test 1100", weight=1100))
    rows.insert(13, filament(103, "Polymaker", "Test 2.85", diameter=2.85))
    path = tmp_path / "filaments.json"
    path.write_text(json.dumps(rows))
    monkeypatch.setattr(externaldb, "get_filaments_file", lambda: path)
    monkeypatch.setattr(externaldb, "_filaments_cache", None)


def test_pages_cover_every_match_once_in_catalog_order():
    ids = []
    for offset in (0, 10, 20):
        items, total = externaldb.search_filaments("elegoo white", limit=10, offset=offset)
        assert total == 25
        ids += [f.id for f in items]
    assert ids == [f"filament_{i}" for i in range(25)]


def test_an_offset_past_the_end_is_empty_but_still_counts():
    assert externaldb.search_filaments("elegoo", limit=10, offset=30) == ([], 25)


def test_every_word_must_match_case_insensitively():
    items, total = externaldb.search_filaments("POLYMAKER petg", limit=10)
    assert ([f.id for f in items], total) == (["filament_100"], 1)


def test_a_blank_query_matches_nothing():
    assert externaldb.search_filaments("   ", limit=10) == ([], 0)


def test_external_search_treats_spaced_and_unspaced_units_equally() -> None:
    spaced, spaced_total = externaldb.search_filaments("Polymaker 1 kg", 100)
    unspaced, unspaced_total = externaldb.search_filaments("Polymaker 1kg", 100)

    assert [result.id for result in spaced] == [result.id for result in unspaced]
    assert spaced_total == unspaced_total == 2
    assert all(result.weight == 1000 for result in spaced)


def test_external_search_matches_weight_in_grams() -> None:
    results, total = externaldb.search_filaments("Elegoo PLA White 250g", 100)

    assert total == 1
    assert [result.weight for result in results] == [250]


def test_external_search_matches_filament_id() -> None:
    results, total = externaldb.search_filaments("filament_100", 100)

    assert total == 1
    assert [result.id for result in results] == ["filament_100"]


def test_external_search_compares_bare_weight_exactly() -> None:
    results, total = externaldb.search_filaments("Polymaker 100", 100)

    assert total == 1
    assert [result.weight for result in results] == [100]


def test_external_search_does_not_treat_a_unit_as_a_measurement() -> None:
    assert externaldb.search_filaments("kg", 100) == ([], 0)


def test_external_search_compares_diameter_exactly() -> None:
    results, total = externaldb.search_filaments("Polymaker 2.85mm", 100)

    assert total == 1
    assert [result.diameter for result in results] == [2.85]


@pytest.mark.parametrize(
    ("query", "expected"),
    [
        ("polymaker 1kg", SearchQuery(terms=["polymaker"], weights=[1000], diameters=[])),
        ("polymaker 1 kg", SearchQuery(terms=["polymaker"], weights=[1000], diameters=[])),
        ("100g", SearchQuery(terms=[], weights=[100], diameters=[])),
        ("100", SearchQuery(terms=[], weights=[100], diameters=[])),
        ("1.75mm", SearchQuery(terms=[], weights=[], diameters=[1.75])),
        ("1.75", SearchQuery(terms=[], weights=[], diameters=[1.75])),
        ("#100", SearchQuery(terms=["#100"], weights=[], diameters=[])),
    ],
)
def test_parse_query_measurements(query: str, expected: SearchQuery) -> None:
    assert parse_query(query) == expected

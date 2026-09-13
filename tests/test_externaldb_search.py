"""Tests for searching and paging through the external filament catalog."""

import json
from pathlib import Path

import pytest

from spoolman import externaldb


def filament(i: int, manufacturer: str, name: str, material: str = "PLA") -> dict:
    return {
        "id": f"filament_{i}",
        "manufacturer": manufacturer,
        "name": name,
        "material": material,
        "density": 1.24,
        "weight": 1000,
        "diameter": 1.75,
    }


@pytest.fixture(autouse=True)
def catalog(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    rows = [filament(i, "Elegoo", f"White {i}") for i in range(25)]
    rows.insert(10, filament(100, "Polymaker", "PolyLite Black", "PETG"))
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

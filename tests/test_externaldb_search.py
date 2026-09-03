"""External filament catalog search tests."""

import pytest

from spoolman import externaldb
from spoolman.externaldb import ExternalFilament


def filament(
    filament_id: str,
    manufacturer: str,
    name: str,
    material: str,
    weight: float,
    diameter: float = 1.75,
) -> ExternalFilament:
    return ExternalFilament(
        id=filament_id,
        manufacturer=manufacturer,
        name=name,
        material=material,
        density=1.24,
        weight=weight,
        diameter=diameter,
    )


@pytest.fixture(autouse=True)
def catalog(monkeypatch: pytest.MonkeyPatch) -> None:
    filaments = [
        filament(f"elegoo_pla_plawhite_{i}_175_c", "Elegoo", "PLA White", "PLA", weight)
        for i, weight in enumerate([250, 500, 750, 1000, 1000, 1000, 1000, 1000, 1000, 3000], start=1)
    ]
    filaments.append(filament("polymaker_pla_polysonicblack_1000_175", "Polymaker", "Polysonic Black", "PLA", 1000))
    monkeypatch.setattr(externaldb, "_load_filaments", lambda: filaments)


def test_external_search_honors_limit() -> None:
    assert len(externaldb.search_filaments("Elegoo PLA White", 8)) == 8
    assert len(externaldb.search_filaments("Elegoo PLA White", 100)) == 10


def test_external_search_matches_weight_in_kg() -> None:
    results = externaldb.search_filaments("Elegoo PLA White 1kg", 100)

    assert len(results) == 6
    assert all(result.weight == 1000 for result in results)


def test_external_search_matches_weight_in_grams() -> None:
    results = externaldb.search_filaments("Elegoo PLA White 250g", 100)

    assert [result.weight for result in results] == [250]


def test_external_search_matches_filament_id() -> None:
    results = externaldb.search_filaments("plawhite_4_175_c", 100)

    assert [result.id for result in results] == ["elegoo_pla_plawhite_4_175_c"]

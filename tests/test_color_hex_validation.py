"""Tests for the filament color code validators.

The validators normalized a copy of the value (stripping a leading ``#``) but returned the
original string, so a ``#``-prefixed 8-digit color was stored with 9 characters and no longer
fit the ``String(8)`` column, breaking every later read of that filament.
"""

from datetime import datetime, timezone
from types import SimpleNamespace
from typing import Any

import pytest

from spoolman.api.v1.filament import FilamentParameters
from spoolman.api.v1.models import Filament, _sanitize_color_hex, _sanitize_multi_color_hexes


def _params(**kwargs: Any) -> FilamentParameters:  # noqa: ANN401
    return FilamentParameters(density=1.24, diameter=1.75, **kwargs)


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("FF0000", "FF0000"),
        ("#FF0000", "FF0000"),
        ("FF000000", "FF000000"),
        ("#FF000000", "FF000000"),
    ],
)
def test_color_hex_strips_leading_hash(value: str, expected: str):
    assert _params(color_hex=value).color_hex == expected


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("FF0000,00FF00", "FF0000,00FF00"),
        ("#FF0000,#00FF00", "FF0000,00FF00"),
        ("#FF000000,00FF0000", "FF000000,00FF0000"),
    ],
)
def test_multi_color_hexes_strips_leading_hash(value: str, expected: str):
    params = _params(multi_color_hexes=value, multi_color_direction="coaxial")
    assert params.multi_color_hexes == expected


def test_color_hex_fits_the_database_column():
    assert len(_params(color_hex="#FF000000").color_hex) <= 8


@pytest.mark.parametrize(
    ("stored", "expected"),
    [
        ("FF0000", "FF0000"),
        ("#FF0000", "FF0000"),
        ("#FF000000", "FF000000"),
        ("#ff000000", "FF000000"),
        ("nonsense", None),
        ("#12345", None),
        (None, None),
        ("", None),
    ],
)
def test_from_db_sanitizes_color_hex(stored: str | None, expected: str | None):
    assert _sanitize_color_hex(stored) == expected


@pytest.mark.parametrize(
    ("stored", "expected"),
    [
        ("FF0000,00FF00", "FF0000,00FF00"),
        ("#FF0000,#00FF00", "FF0000,00FF00"),
        ("#FF0000,garbage", None),
        ("#FF0000", None),
        (None, None),
    ],
)
def test_from_db_sanitizes_multi_color_hexes(stored: str | None, expected: str | None):
    assert _sanitize_multi_color_hexes(stored) == expected


def test_from_db_survives_a_row_written_before_the_fix():
    item = SimpleNamespace(
        id=1,
        registered=datetime(2024, 1, 1, tzinfo=timezone.utc),
        name="broken",
        vendor=None,
        material=None,
        price=None,
        density=1.24,
        diameter=1.75,
        weight=None,
        spool_weight=None,
        article_number=None,
        comment=None,
        settings_extruder_temp=None,
        settings_bed_temp=None,
        color_hex="#FF000000",
        multi_color_hexes=None,
        multi_color_direction=None,
        external_id=None,
        extra=[],
    )
    assert Filament.from_db(item).color_hex == "FF000000"

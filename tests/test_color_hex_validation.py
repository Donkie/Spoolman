"""Tests for the filament color code validators.

The validators normalized a copy of the value (stripping a leading ``#``) but returned the
original string, so a ``#``-prefixed 8-digit color was stored with 9 characters and no longer
fit the ``String(8)`` column, breaking every later read of that filament.
"""

from typing import Any

import pytest

from spoolman.api.v1.filament import FilamentParameters


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

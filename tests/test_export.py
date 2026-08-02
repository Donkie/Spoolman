"""Tests for CSV formula injection in exports.

A spreadsheet executes a cell that starts with `=`, so a vendor named `=cmd|' /C calc'!A0` runs
when someone opens the exported file (CWE-1236). The attacker only needs to get the string into
the database; the victim is whoever opens the export.
"""

import pytest

from spoolman.export import escape_csv_value


@pytest.mark.parametrize(
    "value",
    [
        "=cmd|' /C calc'!A0",
        "=1+1",
        "+1",
        "-1+1",
        "@SUM(A1)",
        "\tleading tab",
        "\rleading carriage return",
    ],
)
def test_formula_like_values_are_escaped(value: str):
    assert escape_csv_value(value) == "'" + value


@pytest.mark.parametrize(
    "value",
    [
        "Prusament",
        "eSUN PLA+",
        "",
        "a = b",
        "1+1",
        "spool-2",
    ],
)
def test_ordinary_values_are_untouched(value: str):
    assert escape_csv_value(value) == value


@pytest.mark.parametrize("value", [-1, -1.5, 0, 42, None, True])
def test_non_strings_are_untouched(value: object):
    """Numbers reach the writer as numeric types, so a negative number must not grow a quote."""
    assert escape_csv_value(value) is value

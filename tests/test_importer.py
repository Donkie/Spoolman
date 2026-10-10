"""Tests for parsing files handed to the import endpoints.

The import is the inverse of the export, so most of these check a round trip: whatever
`spoolman.export` writes for a value, `spoolman.importer` has to read back as that same
value. The rest are about refusing a bad file clearly instead of writing half of it.
"""

import json
from datetime import datetime

import pytest

from spoolman.export import escape_csv_value
from spoolman.importer import (
    ImportEntity,
    ImportFormat,
    coerce,
    parse_datetime,
    parse_rows,
    read_rows,
    unescape_csv_value,
)


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
def test_csv_escaping_round_trips(value: str):
    """A value the export had to quote comes back without the quote, not with a second one."""
    assert unescape_csv_value(escape_csv_value(value)) == value


@pytest.mark.parametrize(
    "value",
    ["Prusament", "eSUN PLA+", "", "a = b", "1+1", "spool-2", "'quoted'", "'not a formula"],
)
def test_ordinary_values_are_untouched(value: str):
    assert unescape_csv_value(value) == value


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("2026-09-04 12:00:26", datetime.fromisoformat("2026-09-04T12:00:26")),
        ("2026-09-04T12:00:26", datetime.fromisoformat("2026-09-04T12:00:26")),
        ("2026-09-04T12:00:26Z", datetime.fromisoformat("2026-09-04T12:00:26")),
        ("2026-09-04T15:00:26+03:00", datetime.fromisoformat("2026-09-04T12:00:26")),
    ],
)
def test_timestamps_are_read_as_naive_utc(text: str, expected: datetime):
    """The database stores naive UTC, so an offset has to be applied and then dropped."""
    assert parse_datetime(text) == expected


@pytest.mark.parametrize(
    ("value", "kind", "expected"),
    [
        ("1.24", "float", 1.24),
        (1.24, "float", 1.24),
        ("210", "int", 210),
        ("210.0", "int", 210),  # spreadsheets and JSON both write whole numbers this way
        (210.0, "int", 210),
        ("true", "bool", True),
        ("False", "bool", False),
        (True, "bool", True),
        ("  spaced  ", "str", "spaced"),
        ("", "str", None),
        ("   ", "float", None),
        (None, "float", None),
    ],
)
def test_cells_are_coerced(value: object, kind: str, expected: object):
    assert coerce(value, kind) == expected


@pytest.mark.parametrize(("value", "kind"), [("abc", "float"), ("1.5", "int"), ("maybe", "bool")])
def test_unreadable_cells_raise(value: str, kind: str):
    with pytest.raises(ValueError, match=r"."):
        coerce(value, kind)


def _spool_row(**overrides: str) -> dict:
    row = {
        "id": "7",
        "registered": "2026-09-04 12:00:26",
        "remaining_weight": "800",
        "used_weight": "200",
        "remaining_length": "268.5",
        "location": "Shelf",
        "archived": "False",
        "extra.my_note": '"hello"',
        "filament.id": "3",
        "filament.name": "Pearl Black",
        "filament.material": "PLA",
        "filament.density": "1.24",
        "filament.diameter": "1.75",
        "filament.weight": "1000",
        "filament.extra.fp_td": "0.1",
        "filament.vendor.id": "1",
        "filament.vendor.name": "Anycubic",
    }
    row.update(overrides)
    return row


def test_spool_row_is_unflattened():
    """A spools export carries its filament and vendor along; both have to come back out."""
    result = parse_rows([_spool_row()], ImportEntity.SPOOL)

    assert result.errors == []
    record = result.records[0]
    assert record.fields["location"] == "Shelf"
    assert record.fields["used_weight"] == 200
    assert record.fields["archived"] is False
    assert record.extra == {"my_note": '"hello"'}
    assert record.parents["filament"]["name"] == "Pearl Black"
    assert record.parents["filament"]["density"] == 1.24
    assert record.parent_extra["filament"] == {"fp_td": "0.1"}
    assert record.parents["filament.vendor"]["name"] == "Anycubic"


def test_derived_and_instance_columns_are_reported_not_written():
    """Nothing is dropped silently: ids and derived lengths come back as ignored columns."""
    result = parse_rows([_spool_row()], ImportEntity.SPOOL)

    assert "id" in result.ignored_columns
    assert "registered" in result.ignored_columns
    assert "remaining_length" in result.ignored_columns
    assert "filament.id" in result.ignored_columns
    assert "filament.vendor.id" in result.ignored_columns
    assert "location" not in result.ignored_columns


def test_used_weight_wins_over_remaining_weight():
    """Both are in the export and they disagree if one was edited; the stored one wins."""
    record = parse_rows([_spool_row()], ImportEntity.SPOOL).records[0]

    assert record.fields["used_weight"] == 200
    assert "remaining_weight" not in record.fields


def test_remaining_weight_is_kept_when_it_is_all_there_is():
    """A hand-written file that only says how much is left is still usable."""
    row = _spool_row()
    del row["used_weight"]
    record = parse_rows([row], ImportEntity.SPOOL).records[0]

    assert record.fields["remaining_weight"] == 800


def test_filament_without_density_is_refused():
    """`density` is NOT NULL in the database, so the row cannot be created."""
    row = _spool_row()
    row["filament.density"] = ""
    result = parse_rows([row], ImportEntity.SPOOL)

    assert [(e.row, e.column) for e in result.errors] == [(1, "filament.density")]


def test_bad_cell_names_its_row_and_column():
    result = parse_rows([_spool_row(**{"filament.density": "thick"})], ImportEntity.SPOOL)

    assert len(result.errors) == 2  # unreadable, and then missing
    assert result.errors[0].row == 1
    assert result.errors[0].column == "filament.density"


def test_every_bad_row_is_reported_at_once():
    """The file is refused as a whole, so the user sees all of it rather than the first line."""
    rows = [_spool_row(), _spool_row(**{"filament.density": ""}), _spool_row(archived="perhaps")]
    result = parse_rows(rows, ImportEntity.SPOOL)

    assert sorted(e.row for e in result.errors) == [2, 3]


def test_multi_color_direction_is_checked_and_normalised():
    good = parse_rows(
        [{"name": "X", "density": "1.2", "diameter": "1.75", "multi_color_direction": "Coaxial"}], ImportEntity.FILAMENT
    )
    assert good.errors == []
    assert good.records[0].fields["multi_color_direction"] == "coaxial"

    bad = parse_rows(
        [{"name": "X", "density": "1.2", "diameter": "1.75", "multi_color_direction": "sideways"}],
        ImportEntity.FILAMENT,
    )
    assert [e.column for e in bad.errors] == ["multi_color_direction"]


def test_a_foreign_file_is_refused_once_with_a_hint():
    """A file from another tool has none of our columns: say so once, not per row."""
    rows = [{"brand": "Anycubic", "material": "PLA", "color": "Pearl Black"} for _ in range(10)]
    result = parse_rows(rows, ImportEntity.SPOOL)

    assert len(result.errors) == 1
    problem = result.errors[0]
    assert problem.row == 0  # about the file, not a row in it
    assert "does not look like a spools export" in problem.message
    assert "filament.density" in problem.message  # what was expected
    assert "brand" in problem.message  # what was actually there
    assert result.records == []


def test_a_recognised_file_still_reports_per_row():
    """One good column is enough to treat the file as ours and judge it row by row."""
    rows = [{"filament.name": "X", "brand": "ignored"}, {"filament.name": "Y", "brand": "ignored"}]
    result = parse_rows(rows, ImportEntity.SPOOL)

    assert sorted({e.row for e in result.errors}) == [1, 2]
    assert all(e.row != 0 for e in result.errors)


def test_vendor_needs_a_name():
    """A vendors file with a `name` column and a blank in it is a row-level problem."""
    result = parse_rows([{"name": "", "comment": "no name here"}], ImportEntity.VENDOR)

    assert [(e.row, e.column) for e in result.errors] == [(1, "name")]


def test_a_file_with_no_name_column_is_not_a_vendors_export():
    """Without the column at all it is the wrong file, and says so once."""
    result = parse_rows([{"comment": "a"}, {"comment": "b"}], ImportEntity.VENDOR)

    assert len(result.errors) == 1
    assert result.errors[0].row == 0
    assert "does not look like a vendors export" in result.errors[0].message


def test_reading_csv_and_json_agree():
    """CSV gives strings and JSON gives numbers; both have to land on the same record."""
    csv_bytes = b"name,density,diameter\nPearl Black,1.24,1.75\n"
    json_bytes = json.dumps([{"name": "Pearl Black", "density": 1.24, "diameter": 1.75}]).encode()

    from_csv = parse_rows(read_rows(csv_bytes, ImportFormat.CSV), ImportEntity.FILAMENT)
    from_json = parse_rows(read_rows(json_bytes, ImportFormat.JSON), ImportEntity.FILAMENT)

    assert from_csv.records[0].fields == from_json.records[0].fields


def test_blank_csv_lines_are_skipped():
    rows = read_rows(b"name,density,diameter\nA,1.2,1.75\n,,\n", ImportFormat.CSV)

    assert len(rows) == 1


@pytest.mark.parametrize(
    ("data", "fmt"),
    [
        (b"", ImportFormat.CSV),
        (b"not json", ImportFormat.JSON),
        (b'{"not": "a list"}', ImportFormat.JSON),
        (b'["not an object"]', ImportFormat.JSON),
    ],
)
def test_unreadable_files_raise(data: bytes, fmt: ImportFormat):
    with pytest.raises(ValueError, match=r"."):
        read_rows(data, fmt)


def test_utf8_bom_is_stripped():
    """Excel writes a BOM, and without stripping it the first column name carries it."""
    rows = read_rows("﻿name,density,diameter\nA,1.2,1.75\n".encode(), ImportFormat.CSV)

    assert list(rows[0]) == ["name", "density", "diameter"]

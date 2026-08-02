"""Tests for sort parameter parsing.

Each list endpoint used to parse `sort` inline with a bare `split(":")`, so a malformed value
raised an unhandled exception and surfaced as a 500.
"""

import pytest

from spoolman.database import models
from spoolman.database.utils import SortOrder, parse_nested_field, parse_sort


def test_none_yields_no_sort():
    assert parse_sort(None) == {}


def test_empty_string_yields_no_sort():
    assert parse_sort("") == {}


def test_single_field():
    assert parse_sort("name:asc") == {"name": SortOrder.ASC}


def test_direction_is_case_insensitive():
    assert parse_sort("name:DESC") == {"name": SortOrder.DESC}


def test_multiple_fields_keep_their_directions():
    assert parse_sort("name:asc,id:desc") == {"name": SortOrder.ASC, "id": SortOrder.DESC}


def test_nested_field():
    assert parse_sort("filament.material:asc") == {"filament.material": SortOrder.ASC}


def test_surrounding_whitespace_is_tolerated():
    assert parse_sort(" name:asc , id:desc ") == {"name": SortOrder.ASC, "id": SortOrder.DESC}


def test_missing_direction_is_rejected():
    """`?sort=name` raised "not enough values to unpack (expected 2, got 1)"."""
    with pytest.raises(ValueError, match="expected the form"):
        parse_sort("name")


def test_unknown_direction_is_rejected():
    """`?sort=name:sideways` raised a KeyError from SortOrder[...]."""
    with pytest.raises(ValueError, match="Invalid sort direction"):
        parse_sort("name:sideways")


def test_missing_field_name_is_rejected():
    with pytest.raises(ValueError, match="no field name"):
        parse_sort(":asc")


def test_one_bad_entry_rejects_the_whole_parameter():
    with pytest.raises(ValueError, match="expected the form"):
        parse_sort("name:asc,id")


def test_mapped_column_resolves():
    assert parse_nested_field(models.Spool, "id") is models.Spool.id


def test_relationship_traversal_still_works():
    assert parse_nested_field(models.Spool, "filament.name") is models.Filament.name
    assert parse_nested_field(models.Filament, "vendor.name") is models.Vendor.name


@pytest.mark.parametrize("field", ["metadata", "registry", "awaitable_attrs"])
def test_non_column_attributes_are_rejected(field: str):
    """`?sort=metadata:asc` reached order_by() and raised 'MetaData' has no attribute 'asc'."""
    with pytest.raises(ValueError, match="is not a valid field"):
        parse_nested_field(models.Spool, field)


def test_relationship_without_a_nested_field_is_rejected():
    with pytest.raises(ValueError, match="No field specified"):
        parse_nested_field(models.Spool, "filament")


def test_unknown_field_is_rejected():
    with pytest.raises(ValueError, match="is not a valid field"):
        parse_nested_field(models.Spool, "nonsense")


def test_nested_field_on_a_plain_column_is_rejected():
    with pytest.raises(ValueError, match="does not have any nested fields"):
        parse_nested_field(models.Spool, "id.something")

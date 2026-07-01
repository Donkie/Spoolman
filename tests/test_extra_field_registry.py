"""Unit tests for extra-field definition and value validation.

These cover the validation contract in ``spoolman.extra_field_registry`` that is
NOT already exercised by ``tests/test_extra_field_validation.py``:

* ``validate_extra_field_value`` for the untested field types
  (``integer_range``, ``float_range`` and ``datetime``).
* ``validate_extra_field`` definition-level invariants (choice/non-choice
  requirements and ``default_value`` validation).
* the update-time immutability invariants enforced by
  ``add_or_update_extra_field`` (field type / multi-choice immutable, choices
  cannot be removed), driven through the module's in-memory field cache so no
  database is required for the error paths.

The oracle is the documented validation rules, not the implementation: a value
is accepted iff it structurally matches the declared type, and a definition is
accepted iff it satisfies the choice/default-value rules.
"""

import json
from collections.abc import Iterator
from typing import Any

import pytest

from spoolman.extra_field_registry import (
    EntityType,
    ExtraField,
    ExtraFieldParameters,
    ExtraFieldType,
    add_or_update_extra_field,
    extra_field_cache,
    validate_extra_field,
    validate_extra_field_value,
)


def make_field(field_type: ExtraFieldType, **kwargs: Any) -> ExtraFieldParameters:  # noqa: ANN401
    """Build a minimal ExtraFieldParameters definition for the given type."""
    return ExtraFieldParameters(name="Test field", field_type=field_type, **kwargs)


# --- integer_range ---


@pytest.mark.parametrize(
    "value",
    [
        [1, 2],
        [None, 5],
        [5, None],
        [None, None],
        [-3, 3],
    ],
)
def test_integer_range_accepts_two_ints_or_nulls(value: list[Any]):
    """Accept a two-element list of integers where each entry may be null."""
    field = make_field(ExtraFieldType.integer_range)
    validate_extra_field_value(field, json.dumps(value))


@pytest.mark.parametrize(
    "value",
    [
        [1],
        [1, 2, 3],
        [],
    ],
)
def test_integer_range_rejects_wrong_length(value: list[Any]):
    """Reject an integer range whose list length is not exactly two."""
    field = make_field(ExtraFieldType.integer_range)
    with pytest.raises(ValueError):
        validate_extra_field_value(field, json.dumps(value))


@pytest.mark.parametrize(
    "value",
    [
        [1.5, 2],
        ["1", "2"],
        [1, "2"],
    ],
)
def test_integer_range_rejects_non_integer_entries(value: list[Any]):
    """Reject an integer range containing non-integer entries."""
    field = make_field(ExtraFieldType.integer_range)
    with pytest.raises(ValueError):
        validate_extra_field_value(field, json.dumps(value))


def test_integer_range_rejects_non_list():
    """Reject an integer range whose decoded value is not a list."""
    field = make_field(ExtraFieldType.integer_range)
    with pytest.raises(ValueError):
        validate_extra_field_value(field, json.dumps(5))


# --- float_range ---


@pytest.mark.parametrize(
    "value",
    [
        [1.5, 2.5],
        [1, 2],
        [None, 2.0],
        [2.0, None],
        [None, None],
        [-1.5, 1.5],
    ],
)
def test_float_range_accepts_two_numbers_or_nulls(value: list[Any]):
    """Accept a two-element list of floats/ints where each entry may be null."""
    field = make_field(ExtraFieldType.float_range)
    validate_extra_field_value(field, json.dumps(value))


@pytest.mark.parametrize(
    "value",
    [
        [1.0],
        [1.0, 2.0, 3.0],
        [],
    ],
)
def test_float_range_rejects_wrong_length(value: list[Any]):
    """Reject a float range whose list length is not exactly two."""
    field = make_field(ExtraFieldType.float_range)
    with pytest.raises(ValueError):
        validate_extra_field_value(field, json.dumps(value))


@pytest.mark.parametrize(
    "value",
    [
        ["1.0", "2.0"],
        [1.0, "x"],
        [True, 2.0],
        [1.0, False],
    ],
)
def test_float_range_rejects_non_numeric_or_bool_entries(value: list[Any]):
    """Reject a float range containing non-numeric entries or booleans.

    ``bool`` is a subclass of ``int`` but is explicitly excluded so a JSON
    ``true``/``false`` does not slip through as a numeric bound.
    """
    field = make_field(ExtraFieldType.float_range)
    with pytest.raises(ValueError):
        validate_extra_field_value(field, json.dumps(value))


def test_float_range_rejects_non_list():
    """Reject a float range whose decoded value is not a list."""
    field = make_field(ExtraFieldType.float_range)
    with pytest.raises(ValueError):
        validate_extra_field_value(field, json.dumps(3.14))


# --- datetime ---


@pytest.mark.parametrize(
    "value",
    [
        "2026-07-01T12:00:00",
        "2026-07-01",
        "not-really-a-date-but-still-a-string",
        "",
    ],
)
def test_datetime_accepts_any_string(value: str):
    """Accept any JSON string for a datetime field.

    The validator only enforces that the decoded value is a string; it does not
    parse or range-check the timestamp.
    """
    field = make_field(ExtraFieldType.datetime)
    validate_extra_field_value(field, json.dumps(value))


@pytest.mark.parametrize(
    "value",
    [
        1700000000,
        3.14,
        True,
        ["2026-07-01"],
        None,
    ],
)
def test_datetime_rejects_non_string(value: Any):  # noqa: ANN401
    """Reject a datetime value whose decoded JSON is not a string."""
    field = make_field(ExtraFieldType.datetime)
    with pytest.raises(ValueError):
        validate_extra_field_value(field, json.dumps(value))


# --- validate_extra_field: choice / non-choice requirements ---


def test_validate_choice_requires_choices():
    """Reject a choice field definition that omits its choices."""
    field = make_field(ExtraFieldType.choice, multi_choice=False)
    with pytest.raises(ValueError, match="Choices must be set"):
        validate_extra_field(field)


def test_validate_choice_requires_multi_choice_flag():
    """Reject a choice field definition that omits the multi_choice flag."""
    field = make_field(ExtraFieldType.choice, choices=["a", "b"])
    with pytest.raises(ValueError, match="Multi choice must be set"):
        validate_extra_field(field)


def test_validate_choice_accepts_full_definition():
    """Accept a choice field that supplies both choices and multi_choice."""
    field = make_field(ExtraFieldType.choice, choices=["a", "b"], multi_choice=False)
    validate_extra_field(field)


@pytest.mark.parametrize(
    "field_type",
    [
        ExtraFieldType.text,
        ExtraFieldType.integer,
        ExtraFieldType.float,
        ExtraFieldType.boolean,
        ExtraFieldType.datetime,
        ExtraFieldType.integer_range,
        ExtraFieldType.float_range,
    ],
)
def test_validate_non_choice_rejects_choices(field_type: ExtraFieldType):
    """Reject choices being set on any non-choice field type."""
    field = make_field(field_type, choices=["a", "b"])
    with pytest.raises(ValueError, match="Choices must not be set"):
        validate_extra_field(field)


@pytest.mark.parametrize(
    "field_type",
    [
        ExtraFieldType.text,
        ExtraFieldType.integer,
        ExtraFieldType.float,
        ExtraFieldType.boolean,
        ExtraFieldType.datetime,
    ],
)
def test_validate_non_choice_rejects_multi_choice(field_type: ExtraFieldType):
    """Reject the multi_choice flag being set on any non-choice field type."""
    field = make_field(field_type, multi_choice=True)
    with pytest.raises(ValueError, match="Multi choice must not be set"):
        validate_extra_field(field)


def test_validate_plain_field_accepts_minimal_definition():
    """Accept a plain non-choice field with no choices or multi_choice."""
    field = make_field(ExtraFieldType.text)
    validate_extra_field(field)


# --- validate_extra_field: default_value validation ---


def test_validate_default_value_valid_is_accepted():
    """Accept a field whose default_value matches the declared type."""
    field = make_field(ExtraFieldType.integer, default_value=json.dumps(5))
    validate_extra_field(field)


def test_validate_default_value_invalid_raises():
    """Reject a field whose default_value does not match the declared type."""
    field = make_field(ExtraFieldType.integer, default_value=json.dumps("not-an-int"))
    with pytest.raises(ValueError, match="Default value is not valid"):
        validate_extra_field(field)


def test_validate_default_value_invalid_json_raises():
    """Reject a field whose default_value is not valid JSON."""
    field = make_field(ExtraFieldType.text, default_value="this is not json")
    with pytest.raises(ValueError, match="Default value is not valid"):
        validate_extra_field(field)


def test_validate_default_value_for_choice_must_be_a_choice():
    """Reject a choice field whose default_value is not one of the choices."""
    field = make_field(
        ExtraFieldType.choice,
        choices=["a", "b"],
        multi_choice=False,
        default_value=json.dumps("z"),
    )
    with pytest.raises(ValueError, match="Default value is not valid"):
        validate_extra_field(field)


# --- add_or_update_extra_field: update-time immutability invariants ---
#
# These drive add_or_update_extra_field through the module's in-memory
# extra_field_cache so that get_extra_fields returns the seeded "existing"
# field without a database round-trip. Every case here asserts a rejection
# that is raised *before* the final db_setting.update call, so the passed db is
# never touched. The happy-path persistence of add_or_update_extra_field (which
# does write to the database) is left to the integration suite (Phase 2).


def make_stored_field(key: str, field_type: ExtraFieldType, **kwargs: Any) -> ExtraField:  # noqa: ANN401
    """Build a full ExtraField (as it would be stored) for the given type."""
    return ExtraField(
        key=key,
        entity_type=EntityType.spool,
        name="Stored field",
        field_type=field_type,
        **kwargs,
    )


@pytest.fixture
def _clean_cache() -> Iterator[None]:
    """Ensure the module field cache is empty around each cache-driven test."""
    saved = dict(extra_field_cache)
    extra_field_cache.clear()
    yield
    extra_field_cache.clear()
    extra_field_cache.update(saved)


@pytest.mark.usefixtures("_clean_cache")
async def test_update_rejects_field_type_change():
    """Reject updating an existing field to a different field type."""
    existing = make_stored_field("weight", ExtraFieldType.integer)
    extra_field_cache[EntityType.spool] = [existing]

    updated = make_stored_field("weight", ExtraFieldType.text)
    with pytest.raises(ValueError, match="Field type cannot be changed"):
        await add_or_update_extra_field(db=None, entity_type=EntityType.spool, extra_field=updated)


@pytest.mark.usefixtures("_clean_cache")
async def test_update_rejects_multi_choice_change():
    """Reject flipping the multi_choice flag of an existing choice field."""
    existing = make_stored_field("color", ExtraFieldType.choice, choices=["a", "b"], multi_choice=False)
    extra_field_cache[EntityType.spool] = [existing]

    updated = make_stored_field("color", ExtraFieldType.choice, choices=["a", "b"], multi_choice=True)
    with pytest.raises(ValueError, match="Multi choice cannot be changed"):
        await add_or_update_extra_field(db=None, entity_type=EntityType.spool, extra_field=updated)


@pytest.mark.usefixtures("_clean_cache")
async def test_update_rejects_removing_choices():
    """Reject an update that drops a previously-defined choice."""
    existing = make_stored_field("color", ExtraFieldType.choice, choices=["a", "b", "c"], multi_choice=False)
    extra_field_cache[EntityType.spool] = [existing]

    updated = make_stored_field("color", ExtraFieldType.choice, choices=["a", "b"], multi_choice=False)
    with pytest.raises(ValueError, match="Cannot remove existing choices"):
        await add_or_update_extra_field(db=None, entity_type=EntityType.spool, extra_field=updated)


@pytest.mark.usefixtures("_clean_cache")
async def test_update_rejects_invalid_definition_before_lookup():
    """Reject an invalid definition (choices on a non-choice field) up front."""
    # No existing field is needed: validate_extra_field runs before any lookup.
    extra_field_cache[EntityType.spool] = []

    invalid = make_stored_field("weight", ExtraFieldType.integer, choices=["a", "b"])
    with pytest.raises(ValueError, match="Choices must not be set"):
        await add_or_update_extra_field(db=None, entity_type=EntityType.spool, extra_field=invalid)

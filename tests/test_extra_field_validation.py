"""Unit tests for extra-field value type validation.

These cover spoolman.extra_field_registry.validate_extra_field_value, which takes an
ExtraFieldParameters definition and a JSON-encoded string value and raises ValueError
when the decoded value does not match the declared field type.
"""

import json
from typing import Any

import pytest

from spoolman.extra_fields import (
    ExtraFieldParameters,
    ExtraFieldType,
    validate_extra_field_value,
)


def make_field(field_type: ExtraFieldType, **kwargs: Any) -> ExtraFieldParameters:  # noqa: ANN401
    """Build a minimal ExtraFieldParameters definition for the given type."""
    return ExtraFieldParameters(name="Test field", field_type=field_type, **kwargs)


# --- text ---


def test_text_accepts_string():
    field = make_field(ExtraFieldType.text)
    validate_extra_field_value(field, json.dumps("hello"))


def test_text_rejects_non_string():
    field = make_field(ExtraFieldType.text)
    with pytest.raises(ValueError):
        validate_extra_field_value(field, json.dumps(123))


# --- integer ---


def test_integer_accepts_int():
    field = make_field(ExtraFieldType.integer)
    validate_extra_field_value(field, json.dumps(42))


def test_integer_rejects_float():
    field = make_field(ExtraFieldType.integer)
    with pytest.raises(ValueError):
        validate_extra_field_value(field, json.dumps(3.14))


def test_integer_rejects_string():
    field = make_field(ExtraFieldType.integer)
    with pytest.raises(ValueError):
        validate_extra_field_value(field, json.dumps("42"))


# --- float ---


def test_float_accepts_float_and_int():
    field = make_field(ExtraFieldType.float)
    validate_extra_field_value(field, json.dumps(3.14))
    # Ints are accepted as floats by the validator.
    validate_extra_field_value(field, json.dumps(5))


def test_float_rejects_bool():
    # bool is a subclass of int; the validator explicitly excludes it.
    field = make_field(ExtraFieldType.float)
    with pytest.raises(ValueError):
        validate_extra_field_value(field, json.dumps(True))  # noqa: FBT003


def test_float_rejects_string():
    field = make_field(ExtraFieldType.float)
    with pytest.raises(ValueError):
        validate_extra_field_value(field, json.dumps("nope"))


# --- boolean ---


def test_boolean_accepts_bool():
    field = make_field(ExtraFieldType.boolean)
    validate_extra_field_value(field, json.dumps(True))  # noqa: FBT003
    validate_extra_field_value(field, json.dumps(False))  # noqa: FBT003


def test_boolean_rejects_int():
    field = make_field(ExtraFieldType.boolean)
    with pytest.raises(ValueError):
        validate_extra_field_value(field, json.dumps(1))


# --- choice (single) ---


def test_choice_accepts_valid_choice():
    field = make_field(ExtraFieldType.choice, multi_choice=False, choices=["a", "b", "c"])
    validate_extra_field_value(field, json.dumps("b"))


def test_choice_rejects_invalid_choice():
    field = make_field(ExtraFieldType.choice, multi_choice=False, choices=["a", "b", "c"])
    with pytest.raises(ValueError):
        validate_extra_field_value(field, json.dumps("z"))


def test_choice_rejects_non_string():
    field = make_field(ExtraFieldType.choice, multi_choice=False, choices=["a", "b"])
    with pytest.raises(ValueError):
        validate_extra_field_value(field, json.dumps(1))


# --- choice (multi) ---


def test_multi_choice_accepts_valid_subset():
    field = make_field(ExtraFieldType.choice, multi_choice=True, choices=["a", "b", "c"])
    validate_extra_field_value(field, json.dumps(["a", "c"]))


def test_multi_choice_rejects_invalid_member():
    field = make_field(ExtraFieldType.choice, multi_choice=True, choices=["a", "b", "c"])
    with pytest.raises(ValueError):
        validate_extra_field_value(field, json.dumps(["a", "z"]))


# --- invalid JSON ---


def test_invalid_json_raises():
    field = make_field(ExtraFieldType.text)
    with pytest.raises(ValueError):
        validate_extra_field_value(field, "this is not json")

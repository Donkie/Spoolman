"""Integration tests for the custom extra fields system."""

import json
from datetime import datetime, timezone

import httpx
import pytest

from ..conftest import URL, assert_httpx_success, assert_lists_compatible


def test_add_text_field():
    """Test adding a text field for spools."""
    result = httpx.post(
        f"{URL}/api/v1/field/spool/mytextfield",
        json={
            "name": "My text field",
            "field_type": "text",
            "default_value": json.dumps("Hello World"),
        },
    )
    assert_httpx_success(result)

    # Clean up
    result = httpx.delete(f"{URL}/api/v1/field/spool/mytextfield")
    assert_httpx_success(result)


def test_add_text_field_filament():
    """Test adding a text field for filaments."""
    result = httpx.post(
        f"{URL}/api/v1/field/filament/mytextfield",
        json={
            "name": "My text field",
            "field_type": "text",
            "default_value": json.dumps("Hello World"),
        },
    )
    assert_httpx_success(result)

    # Clean up
    result = httpx.delete(f"{URL}/api/v1/field/filament/mytextfield")
    assert_httpx_success(result)


def test_add_text_field_vendor():
    """Test adding a text field for vendors."""
    result = httpx.post(
        f"{URL}/api/v1/field/vendor/mytextfield",
        json={
            "name": "My text field",
            "field_type": "text",
            "default_value": json.dumps("Hello World"),
        },
    )
    assert_httpx_success(result)

    # Clean up
    result = httpx.delete(f"{URL}/api/v1/field/vendor/mytextfield")
    assert_httpx_success(result)


def test_add_integer_field():
    """Test adding an integer field for spools."""
    result = httpx.post(
        f"{URL}/api/v1/field/spool/myintegerfield",
        json={
            "name": "My integer field",
            "unit": "mm",
            "field_type": "integer",
            "default_value": json.dumps(42),
        },
    )
    assert_httpx_success(result)

    # Clean up
    result = httpx.delete(f"{URL}/api/v1/field/spool/myintegerfield")
    assert_httpx_success(result)


def test_add_integer_range_field():
    """Test adding an integer range field for spools."""
    result = httpx.post(
        f"{URL}/api/v1/field/spool/myintegerrangefield",
        json={
            "name": "My integer range field",
            "field_type": "integer_range",
            "default_value": json.dumps([0, 100]),
        },
    )
    assert_httpx_success(result)

    # Clean up
    result = httpx.delete(f"{URL}/api/v1/field/spool/myintegerrangefield")
    assert_httpx_success(result)


def test_add_float_field():
    """Test adding a float field for spools."""
    result = httpx.post(
        f"{URL}/api/v1/field/spool/myfloatfield",
        json={
            "name": "My float field",
            "field_type": "float",
            "default_value": json.dumps(3.14),
        },
    )
    assert_httpx_success(result)

    # Clean up
    result = httpx.delete(f"{URL}/api/v1/field/spool/myfloatfield")
    assert_httpx_success(result)


def test_add_float_range_field():
    """Test adding a float range field for spools."""
    result = httpx.post(
        f"{URL}/api/v1/field/spool/myfloatrangefield",
        json={
            "name": "My float range field",
            "field_type": "float_range",
            "default_value": json.dumps([0.0, 1.0]),
        },
    )
    assert_httpx_success(result)

    # Clean up
    result = httpx.delete(f"{URL}/api/v1/field/spool/myfloatrangefield")
    assert_httpx_success(result)


def test_add_datetime_field():
    """Test adding a datetime field for spools."""
    result = httpx.post(
        f"{URL}/api/v1/field/spool/mydatetimefield",
        json={
            "name": "My datetime field",
            "field_type": "datetime",
            "default_value": json.dumps(datetime.now(timezone.utc).isoformat()),
        },
    )
    assert_httpx_success(result)

    # Clean up
    result = httpx.delete(f"{URL}/api/v1/field/spool/mydatetimefield")
    assert_httpx_success(result)


def test_add_boolean_field():
    """Test adding a boolean field for spools."""
    result = httpx.post(
        f"{URL}/api/v1/field/spool/mybooleanfield",
        json={
            "name": "My boolean field",
            "field_type": "boolean",
            "default_value": json.dumps(True),  # noqa: FBT003
        },
    )
    assert_httpx_success(result)

    # Clean up
    result = httpx.delete(f"{URL}/api/v1/field/spool/mybooleanfield")
    assert_httpx_success(result)


@pytest.mark.parametrize(
    "multi_choice",
    [True, False],
)
def test_add_choice_field(multi_choice: bool):  # noqa: FBT001
    """Test adding a choice field for spools."""
    result = httpx.post(
        f"{URL}/api/v1/field/spool/mychoicefield",
        json={
            "name": "My choice field",
            "field_type": "choice",
            "choices": ["foo", "bar", "baz"],
            "default_value": json.dumps(["foo"]) if multi_choice else json.dumps("foo"),
            "multi_choice": multi_choice,
        },
    )
    assert_httpx_success(result)

    # Clean up
    result = httpx.delete(f"{URL}/api/v1/field/spool/mychoicefield")
    assert_httpx_success(result)


def test_add_text_field_invalid_data():
    """Test adding a text field with invalid default value."""
    result = httpx.post(
        f"{URL}/api/v1/field/spool/mytextfield",
        json={
            "name": "My text field",
            "field_type": "text",
            "default_value": json.dumps(42),
        },
    )
    assert result.status_code == 400
    assert result.json()["message"] == "Default value is not valid: Value is not a string."


def test_add_choice_field_without_multi_choice():
    """Test adding a choice field without multi_choice set."""
    result = httpx.post(
        f"{URL}/api/v1/field/spool/mychoicefield",
        json={
            "name": "My choice field",
            "field_type": "choice",
            "choices": ["foo", "bar", "baz"],
            "default_value": json.dumps("foo"),
        },
    )
    assert result.status_code == 400
    assert result.json()["message"] == "Multi choice must be set for field type choice."


def test_add_choice_field_invalid_choices():
    """Test adding a choice field with invalid choices."""
    result = httpx.post(
        f"{URL}/api/v1/field/spool/mychoicefield",
        json={
            "name": "My choice field",
            "field_type": "choice",
            "choices": ["foo", "bar", "baz", {"foo": "bar"}],
            "default_value": json.dumps(["foo"]),
            "multi_choice": True,
        },
    )
    assert result.status_code == 422


def test_add_choice_field_invalid_default_value():
    """Test adding a choice field with invalid default value."""
    result = httpx.post(
        f"{URL}/api/v1/field/spool/mychoicefield",
        json={
            "name": "My choice field",
            "field_type": "choice",
            "choices": ["foo", "bar", "baz"],
            "default_value": json.dumps(42),
            "multi_choice": False,
        },
    )
    assert result.status_code == 400
    assert result.json()["message"] == "Default value is not valid: Value is not a string."


def test_add_choice_field_no_choices():
    """Test adding a choice field without choices set."""
    result = httpx.post(
        f"{URL}/api/v1/field/spool/mychoicefield",
        json={
            "name": "My choice field",
            "field_type": "choice",
            "default_value": json.dumps("foo"),
            "multi_choice": True,
        },
    )
    assert result.status_code == 400
    assert result.json()["message"] == "Choices must be set for field type choice."


def test_update_existing_field():
    """Test updating an existing field."""
    result = httpx.post(
        f"{URL}/api/v1/field/spool/mytextfield",
        json={
            "name": "My text field",
            "field_type": "text",
            "default_value": json.dumps("Hello World"),
        },
    )
    assert_httpx_success(result)

    result = httpx.post(
        f"{URL}/api/v1/field/spool/mytextfield",
        json={
            "name": "My text field",
            "field_type": "text",
            "default_value": json.dumps("Goodbye World"),
        },
    )
    assert_httpx_success(result)

    # Verify that the default value was updated, and that it is still the only field
    result = httpx.get(f"{URL}/api/v1/field/spool")
    assert_httpx_success(result)
    assert_lists_compatible(
        result.json(),
        [
            {
                "name": "My text field",
                "key": "mytextfield",
                "field_type": "text",
                "default_value": json.dumps("Goodbye World"),
            },
        ],
        sort_key="key",
    )

    # Clean up
    result = httpx.delete(f"{URL}/api/v1/field/spool/mytextfield")
    assert_httpx_success(result)


def test_update_field_change_field_type():
    """Test updating an existing field and changing the field type, should not be allowed."""
    result = httpx.post(
        f"{URL}/api/v1/field/spool/mytextfield",
        json={
            "name": "My text field",
            "field_type": "text",
            "default_value": json.dumps("Hello World"),
        },
    )
    assert_httpx_success(result)

    result = httpx.post(
        f"{URL}/api/v1/field/spool/mytextfield",
        json={
            "name": "My text field",
            "field_type": "integer",
            "default_value": json.dumps(42),
        },
    )
    assert result.status_code == 400
    assert result.json()["message"] == "Field type cannot be changed."

    # Clean up
    result = httpx.delete(f"{URL}/api/v1/field/spool/mytextfield")
    assert_httpx_success(result)


def test_update_field_add_choice():
    """Test updating an existing field and adding a choice, should be allowed."""
    result = httpx.post(
        f"{URL}/api/v1/field/spool/mychoicefield",
        json={
            "name": "My choice field",
            "field_type": "choice",
            "choices": ["foo", "bar", "baz"],
            "default_value": json.dumps(["foo"]),
            "multi_choice": True,
        },
    )
    assert_httpx_success(result)

    result = httpx.post(
        f"{URL}/api/v1/field/spool/mychoicefield",
        json={
            "name": "My choice field",
            "field_type": "choice",
            "choices": ["foo", "bar", "baz", "qux"],
            "default_value": json.dumps(["foo"]),
            "multi_choice": True,
        },
    )
    assert_httpx_success(result)

    # Clean up
    result = httpx.delete(f"{URL}/api/v1/field/spool/mychoicefield")
    assert_httpx_success(result)


def test_update_field_remove_choice():
    """Test updating an existing field and removing a choice, should not be allowed."""
    result = httpx.post(
        f"{URL}/api/v1/field/spool/mychoicefield",
        json={
            "name": "My choice field",
            "field_type": "choice",
            "choices": ["foo", "bar", "baz"],
            "default_value": json.dumps(["foo"]),
            "multi_choice": True,
        },
    )
    assert_httpx_success(result)

    result = httpx.post(
        f"{URL}/api/v1/field/spool/mychoicefield",
        json={
            "name": "My choice field",
            "field_type": "choice",
            "choices": ["foo", "baz"],
            "default_value": json.dumps(["foo"]),
            "multi_choice": True,
        },
    )
    assert result.status_code == 400
    assert result.json()["message"] == "Cannot remove existing choices."

    # Clean up
    result = httpx.delete(f"{URL}/api/v1/field/spool/mychoicefield")
    assert_httpx_success(result)


def test_update_field_change_multi_choice():
    """Test updating an existing field and changing the multi_choice setting, should not be allowed."""
    result = httpx.post(
        f"{URL}/api/v1/field/spool/mychoicefield",
        json={
            "name": "My choice field",
            "field_type": "choice",
            "choices": ["foo", "bar", "baz"],
            "default_value": json.dumps(["foo"]),
            "multi_choice": True,
        },
    )
    assert_httpx_success(result)

    result = httpx.post(
        f"{URL}/api/v1/field/spool/mychoicefield",
        json={
            "name": "My choice field",
            "field_type": "choice",
            "choices": ["foo", "bar", "baz"],
            "default_value": json.dumps("foo"),
            "multi_choice": False,
        },
    )
    assert result.status_code == 400
    assert result.json()["message"] == "Multi choice cannot be changed."

    # Clean up
    result = httpx.delete(f"{URL}/api/v1/field/spool/mychoicefield")
    assert_httpx_success(result)

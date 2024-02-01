"""Integration tests for the custom extra fields system."""

import json

import httpx

from ..conftest import URL, assert_httpx_success


def test_add_vendor_with_extra_field():
    """Test adding a vendor with a custom field."""
    result = httpx.post(
        f"{URL}/api/v1/field/vendor/mytextfield",
        json={
            "name": "My text field",
            "field_type": "text",
            "default_value": json.dumps("Hello World"),
        },
    )
    assert_httpx_success(result)

    result = httpx.post(
        f"{URL}/api/v1/vendor",
        json={
            "name": "My Vendor",
            "extra": {
                "mytextfield": '"My Value"',
            },
        },
    )
    assert_httpx_success(result)

    # Verify
    result = httpx.get(f"{URL}/api/v1/vendor/{result.json()['id']}")
    assert_httpx_success(result)
    vendor = result.json()
    assert vendor["name"] == "My Vendor"
    assert vendor["extra"] == {"mytextfield": '"My Value"'}

    # Clean up
    result = httpx.delete(f"{URL}/api/v1/field/vendor/mytextfield")
    assert_httpx_success(result)

    result = httpx.delete(f"{URL}/api/v1/vendor/{vendor['id']}")
    assert_httpx_success(result)


def test_add_vendor_with_invalid_extra_field():
    """Test adding a vendor with an invalid custom field."""
    result = httpx.post(
        f"{URL}/api/v1/vendor",
        json={
            "name": "My Vendor",
            "extra": {
                "somefield": 42,
            },
        },
    )
    assert result.status_code == 400
    assert "somefield" in result.json()["message"].lower()


def test_add_vendor_with_extra_field_then_delete():
    """Test adding a vendor with an extra field, then delete the field.

    Vendor GET response should then not contain the extra field.
    """
    result = httpx.post(
        f"{URL}/api/v1/field/vendor/mytextfield",
        json={
            "name": "My text field",
            "field_type": "text",
            "default_value": json.dumps("Hello World"),
        },
    )
    assert_httpx_success(result)

    result = httpx.post(
        f"{URL}/api/v1/vendor",
        json={
            "name": "My Vendor",
            "extra": {
                "mytextfield": '"My Value"',
            },
        },
    )
    assert_httpx_success(result)

    # Verify
    result = httpx.get(f"{URL}/api/v1/vendor/{result.json()['id']}")
    assert_httpx_success(result)
    vendor = result.json()
    assert vendor["name"] == "My Vendor"
    assert vendor["extra"] == {"mytextfield": '"My Value"'}

    # Remove field
    result = httpx.delete(f"{URL}/api/v1/field/vendor/mytextfield")
    assert_httpx_success(result)

    # Verify
    result = httpx.get(f"{URL}/api/v1/vendor/{vendor['id']}")
    assert_httpx_success(result)
    vendor = result.json()
    assert vendor["name"] == "My Vendor"
    assert "extra" not in vendor or vendor["extra"] == {}

    result = httpx.delete(f"{URL}/api/v1/vendor/{vendor['id']}")
    assert_httpx_success(result)


def test_update_existing_vendor_with_new_extra_field():
    """Test updating an existing vendor with a new extra field."""
    result = httpx.post(
        f"{URL}/api/v1/vendor",
        json={
            "name": "My Vendor",
        },
    )
    assert_httpx_success(result)
    vendor_id = result.json()["id"]

    result = httpx.post(
        f"{URL}/api/v1/field/vendor/mytextfield",
        json={
            "name": "My text field",
            "field_type": "text",
            "default_value": json.dumps("Hello World"),
        },
    )
    assert_httpx_success(result)

    result = httpx.patch(
        f"{URL}/api/v1/vendor/{vendor_id}",
        json={
            "extra": {
                "mytextfield": '"My Value"',
            },
        },
    )
    assert_httpx_success(result)

    # Verify
    result = httpx.get(f"{URL}/api/v1/vendor/{vendor_id}")
    assert_httpx_success(result)
    vendor = result.json()
    assert vendor["name"] == "My Vendor"
    assert vendor["extra"] == {"mytextfield": '"My Value"'}

    # Clean up
    result = httpx.delete(f"{URL}/api/v1/field/vendor/mytextfield")
    assert_httpx_success(result)

    result = httpx.delete(f"{URL}/api/v1/vendor/{vendor_id}")
    assert_httpx_success(result)

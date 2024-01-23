"""Integration tests for the custom extra fields system."""

import json

import httpx

from ..conftest import URL, assert_httpx_success


def test_delete_field():
    """Test adding a field, deleting it, and making sure it's gone."""
    result = httpx.post(
        f"{URL}/api/v1/field/spool/mytextfield",
        json={
            "name": "My text field",
            "field_type": "text",
            "default_value": json.dumps("Hello World"),
        },
    )
    assert_httpx_success(result)

    # Delete
    result = httpx.delete(f"{URL}/api/v1/field/spool/mytextfield")
    assert_httpx_success(result)

    # Verify
    result = httpx.get(f"{URL}/api/v1/field/spool")
    assert_httpx_success(result)
    assert result.json() == []

"""Integration tests for the custom extra fields system."""

import json

import httpx

from ..conftest import assert_httpx_success, assert_lists_compatible

URL = "http://spoolman:8000"


def test_get_field():
    """Test adding a couple of fields to the spool and then getting them."""
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
        f"{URL}/api/v1/field/spool/myintfield",
        json={
            "name": "My int field",
            "field_type": "integer",
            "default_value": json.dumps(42),
        },
    )
    assert_httpx_success(result)

    result = httpx.get(f"{URL}/api/v1/field/spool")
    assert_httpx_success(result)
    assert_lists_compatible(
        result.json(),
        [
            {
                "name": "My text field",
                "key": "mytextfield",
                "field_type": "text",
                "default_value": json.dumps("Hello World"),
            },
            {
                "name": "My int field",
                "key": "myintfield",
                "field_type": "integer",
                "default_value": json.dumps(42),
            },
        ],
        sort_key="key",
    )

    # Clean up
    result = httpx.delete(f"{URL}/api/v1/field/spool/mytextfield")
    assert_httpx_success(result)

    result = httpx.delete(f"{URL}/api/v1/field/spool/myintfield")
    assert_httpx_success(result)

"""Integration tests for the Vendor API endpoint."""

import json

import httpx

from ..conftest import URL


def test_set_currency():
    """Test setting the currency setting."""
    # Execute
    result = httpx.post(
        f"{URL}/api/v1/setting/currency",
        json='"SEK"',
    )
    result.raise_for_status()

    # Verify
    setting = result.json()
    assert setting == {
        "value": '"SEK"',
        "is_set": True,
        "type": "string",
    }

    # Cleanup
    result = httpx.post(
        f"{URL}/api/v1/setting/currency",
        json="",
    )
    result.raise_for_status()


def test_unset_currency():
    """Test un-setting the currency setting."""
    # Execute set
    result = httpx.post(
        f"{URL}/api/v1/setting/currency",
        json='"SEK"',
    )
    result.raise_for_status()

    # Verify set
    setting = result.json()
    assert setting == {
        "value": '"SEK"',
        "is_set": True,
        "type": "string",
    }

    # Execute unset
    result = httpx.post(
        f"{URL}/api/v1/setting/currency",
        json="",
    )
    result.raise_for_status()

    # Verify unset
    setting = result.json()
    assert setting == {
        "value": '"EUR"',
        "is_set": False,
        "type": "string",
    }


def test_set_unknown():
    """Test setting an invalid setting."""
    # Execute
    result = httpx.post(
        f"{URL}/api/v1/setting/not-a-setting",
        json='"SEK"',
    )
    assert result.status_code == 404


def test_set_currency_wrong_type():
    """Test setting the currency setting with the wrong type."""
    # Execute
    result = httpx.post(
        f"{URL}/api/v1/setting/currency",
        json=123,
    )
    assert result.status_code == 422


def test_set_big_value():
    """Test setting a setting to a long string which should be saved correctly."""
    long_string = "a" * (2**16 - 1 - 2)  # Backend guarantees that it can handle strings up to 65535 characters long.
    # Remove 2 characters to account for the quotes.

    # Execute
    result = httpx.post(
        f"{URL}/api/v1/setting/currency",
        json=json.dumps(long_string),
    )
    result.raise_for_status()

    # Verify
    result = httpx.get(f"{URL}/api/v1/setting/currency")
    result.raise_for_status()
    setting = result.json()
    assert setting == {
        "value": json.dumps(long_string),
        "is_set": True,
        "type": "string",
    }

    # Cleanup
    result = httpx.post(
        f"{URL}/api/v1/setting/currency",
        json="",
    )
    result.raise_for_status()


def test_set_setting_rejects_text_plain():
    """A text/plain body is what <form enctype="text/plain"> sends, and used to be accepted.

    FastAPI only JSON-parses application/*json; anything else reached the endpoint's bare `str`
    body as raw bytes, which lax-mode Pydantic coerced. That made every setting writable by any
    website the user happened to visit.
    """
    result = httpx.post(
        f"{URL}/api/v1/setting/currency",
        content='name="US=D"',
        headers={"Content-Type": "text/plain;charset=UTF-8"},
    )
    assert result.status_code == 415

    # Verify nothing was written.
    result = httpx.get(f"{URL}/api/v1/setting/currency")
    result.raise_for_status()
    assert result.json()["is_set"] is False


def test_set_setting_rejects_form_encodings():
    """The other two encodings an HTML form can send must be refused as well."""
    for content_type in ("application/x-www-form-urlencoded", "multipart/form-data; boundary=x"):
        result = httpx.post(
            f"{URL}/api/v1/setting/currency",
            content="a=b",
            headers={"Content-Type": content_type},
        )
        assert result.status_code == 415, content_type


def test_set_setting_accepts_json_with_a_charset():
    """A charset parameter on the content type must not break real clients."""
    result = httpx.post(
        f"{URL}/api/v1/setting/currency",
        content=json.dumps('"SEK"'),
        headers={"Content-Type": "application/json;charset=utf-8"},
    )
    result.raise_for_status()
    assert result.json()["value"] == '"SEK"'

    # Cleanup
    httpx.post(f"{URL}/api/v1/setting/currency", json="").raise_for_status()


def test_set_malformed_extra_fields_does_not_wedge_the_field_endpoint():
    """A malformed extra_fields_* write used to be accepted and then 500 every /field read."""
    result = httpx.post(
        f"{URL}/api/v1/setting/extra_fields_spool",
        json=json.dumps([{"key": "nope"}]),
    )
    assert result.status_code == 400

    result = httpx.get(f"{URL}/api/v1/field/spool")
    assert result.status_code == 200


def test_set_extra_fields_rejects_a_mismatched_entity_type():
    result = httpx.post(
        f"{URL}/api/v1/setting/extra_fields_spool",
        json=json.dumps(
            [{"key": "batch", "entity_type": "vendor", "name": "Batch", "field_type": "text"}],
        ),
    )
    assert result.status_code == 400


def test_set_extra_fields_refreshes_the_field_endpoint():
    """The registry caches extra fields, and this write path did not invalidate that cache."""
    try:
        result = httpx.post(
            f"{URL}/api/v1/setting/extra_fields_spool",
            json=json.dumps(
                [{"key": "batch", "entity_type": "spool", "name": "Batch", "field_type": "text"}],
            ),
        )
        result.raise_for_status()

        # Without cache invalidation this only showed up after a restart.
        result = httpx.get(f"{URL}/api/v1/field/spool")
        result.raise_for_status()
        assert [field["key"] for field in result.json()] == ["batch"]
    finally:
        httpx.post(f"{URL}/api/v1/setting/extra_fields_spool", json=json.dumps([])).raise_for_status()

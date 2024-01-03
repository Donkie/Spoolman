"""Integration tests for the Vendor API endpoint."""

import json

import httpx

URL = "http://spoolman:8000"


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
    assert result.status_code == 400


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

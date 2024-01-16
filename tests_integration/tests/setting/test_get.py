"""Integration tests for the Vendor API endpoint."""

import httpx

URL = "http://spoolman:8000"


def test_get_currency():
    """Test getting the currency setting."""
    # Execute
    result = httpx.get(f"{URL}/api/v1/setting/currency")
    result.raise_for_status()

    # Verify
    setting = result.json()
    assert setting == {
        "value": '"EUR"',
        "is_set": False,
        "type": "string",
    }


def test_get_unknown():
    """Test getting an unknown setting."""
    # Execute
    result = httpx.get(f"{URL}/api/v1/setting/unknown")
    assert result.status_code == 404


def test_get_all():
    """Test getting all settings."""
    # Execute
    result = httpx.get(f"{URL}/api/v1/setting/")
    result.raise_for_status()

    # Verify
    settings = result.json()
    assert settings == {
        "currency": {
            "value": '"EUR"',
            "is_set": False,
            "type": "string",
        },
    }

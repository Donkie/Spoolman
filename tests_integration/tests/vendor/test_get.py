"""Integration tests for the Vendor API endpoint."""

import httpx

URL = "http://spoolman:8000"


def test_get_vendor():
    """Test getting a vendor from the database."""
    # Setup
    name = "John"
    comment = "abcdefghåäö"
    result = httpx.post(
        f"{URL}/api/v1/vendor",
        json={"name": name, "comment": comment},
    )
    result.raise_for_status()
    added_vendor = result.json()

    # Execute
    result = httpx.get(
        f"{URL}/api/v1/vendor/{added_vendor['id']}",
    )
    result.raise_for_status()

    # Verify
    vendor = result.json()
    assert vendor["name"] == name
    assert vendor["comment"] == comment
    assert vendor["id"] == added_vendor["id"]
    assert vendor["registered"] == added_vendor["registered"]

    # Clean up
    httpx.delete(f"{URL}/api/v1/vendor/{vendor['id']}").raise_for_status()


def test_get_vendor_not_found():
    """Test getting a vendor that does not exist."""
    # Execute
    result = httpx.get(f"{URL}/api/v1/vendor/123456789")

    # Verify
    assert result.status_code == 404
    message = result.json()["message"].lower()
    assert "vendor" in message
    assert "id" in message
    assert "123456789" in message

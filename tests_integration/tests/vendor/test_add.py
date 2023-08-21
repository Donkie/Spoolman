"""Integration tests for the Vendor API endpoint."""

import httpx

URL = "http://spoolman:8000"


def test_add_vendor():
    """Test adding a vendor to the database."""
    # Execute
    name = "John"
    comment = "abcdefghåäö"
    result = httpx.post(
        f"{URL}/api/v1/vendor",
        json={"name": name, "comment": comment},
    )
    result.raise_for_status()

    # Verify
    vendor = result.json()
    assert vendor == {
        "id": vendor["id"],
        "registered": vendor["registered"],
        "name": name,
        "comment": comment,
    }

    # Clean up
    httpx.delete(f"{URL}/api/v1/vendor/{vendor['id']}").raise_for_status()


def test_add_vendor_required():
    """Test adding a vendor with only the required fields to the database."""
    # Execute
    name = "John"
    result = httpx.post(
        f"{URL}/api/v1/vendor",
        json={"name": name},
    )
    result.raise_for_status()

    # Verify
    vendor = result.json()
    assert vendor == {
        "id": vendor["id"],
        "registered": vendor["registered"],
        "name": name,
    }

    # Clean up
    httpx.delete(f"{URL}/api/v1/vendor/{vendor['id']}").raise_for_status()

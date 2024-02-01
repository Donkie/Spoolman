"""Integration tests for the Vendor API endpoint."""

import httpx

from ..conftest import URL


def test_delete_vendor():
    """Test deleting a vendor from the database."""
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
    httpx.delete(
        f"{URL}/api/v1/vendor/{added_vendor['id']}",
    ).raise_for_status()

    # Verify
    result = httpx.get(
        f"{URL}/api/v1/vendor/{added_vendor['id']}",
    )
    assert result.status_code == 404


def test_delete_vendor_not_found():
    """Test deleting a vendor that does not exist."""
    # Execute
    result = httpx.delete(f"{URL}/api/v1/vendor/123456789")

    # Verify
    assert result.status_code == 404
    message = result.json()["message"].lower()
    assert "vendor" in message
    assert "id" in message
    assert "123456789" in message

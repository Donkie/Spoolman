"""Integration tests for the Vendor API endpoint."""

import httpx

from ..conftest import URL


def test_delete_vendor_with_filaments():
    """Test that deleting a vendor keeps its filaments and only clears their vendor.

    filament.vendor_id is nullable, so unlike a filament with spools this delete is
    allowed — it orphans the filaments rather than removing them. Clients warn about
    exactly this, so pin the behaviour.
    """
    # Setup
    result = httpx.post(f"{URL}/api/v1/vendor", json={"name": "Vendor with filaments"})
    result.raise_for_status()
    vendor = result.json()

    result = httpx.post(
        f"{URL}/api/v1/filament",
        json={"vendor_id": vendor["id"], "name": "Filament Y", "density": 1.25, "diameter": 1.75},
    )
    result.raise_for_status()
    filament = result.json()

    try:
        # Execute
        httpx.delete(f"{URL}/api/v1/vendor/{vendor['id']}").raise_for_status()

        # Verify: the vendor is gone, the filament is not, and it has no vendor.
        assert httpx.get(f"{URL}/api/v1/vendor/{vendor['id']}").status_code == 404

        result = httpx.get(f"{URL}/api/v1/filament/{filament['id']}")
        assert result.status_code == 200
        assert result.json().get("vendor") is None
    finally:
        httpx.delete(f"{URL}/api/v1/filament/{filament['id']}")


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

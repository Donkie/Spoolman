"""Integration tests for the Vendor API endpoint."""

from datetime import datetime, timezone

import httpx

from ..conftest import URL, assert_dicts_compatible


def test_add_vendor():
    """Test adding a vendor to the database."""
    # Execute
    name = "John"
    comment = "abcdefghåäö"
    external_id = "external_id1"
    result = httpx.post(
        f"{URL}/api/v1/vendor",
        json={
            "name": name,
            "external_id": external_id,
            "comment": comment,
        },
    )
    result.raise_for_status()

    # Verify
    vendor = result.json()
    assert_dicts_compatible(
        vendor,
        {
            "id": vendor["id"],
            "registered": vendor["registered"],
            "name": name,
            "comment": comment,
            "external_id": external_id,
        },
    )

    # Verify that registered happened almost now (within 1 minute)
    diff = abs((datetime.now(tz=timezone.utc) - datetime.fromisoformat(vendor["registered"])).total_seconds())
    assert diff < 60

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
    assert_dicts_compatible(
        vendor,
        {
            "id": vendor["id"],
            "registered": vendor["registered"],
            "name": name,
        },
    )

    # Clean up
    httpx.delete(f"{URL}/api/v1/vendor/{vendor['id']}").raise_for_status()

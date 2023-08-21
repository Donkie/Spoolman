"""Integration tests for the Vendor API endpoint."""

import httpx

URL = "http://spoolman:8000"


def test_find_vendors():
    """Test finding vendors from the database."""
    # Setup
    name_1 = "John"
    comment_1 = "abcdefghåäö"
    result = httpx.post(
        f"{URL}/api/v1/vendor",
        json={"name": name_1, "comment": comment_1},
    )
    result.raise_for_status()
    vendor_1 = result.json()

    name_2 = "Stan"
    comment_2 = "gfdadfg"
    result = httpx.post(
        f"{URL}/api/v1/vendor",
        json={"name": name_2, "comment": comment_2},
    )
    result.raise_for_status()
    vendor_2 = result.json()

    added_vendors_by_id = {
        vendor_1["id"]: vendor_1,
        vendor_2["id"]: vendor_2,
    }

    # Execute - Find all vendors
    result = httpx.get(
        f"{URL}/api/v1/vendor",
    )
    result.raise_for_status()

    # Verify
    vendors = result.json()
    assert len(vendors) == 2

    for vendor in vendors:
        assert vendor == added_vendors_by_id[vendor["id"]]

    # Execute - Find a specific vendor
    result = httpx.get(
        f"{URL}/api/v1/vendor",
        params={"name": name_1},
    )
    result.raise_for_status()

    # Verify
    vendors = result.json()
    assert len(vendors) == 1

    vendor = vendors[0]

    assert vendor["name"] == name_1
    assert vendor["comment"] == comment_1
    assert vendor["id"] == vendor_1["id"]
    assert vendor["registered"] == vendor_1["registered"]

    # Clean up
    httpx.delete(f"{URL}/api/v1/vendor/{vendor_1['id']}").raise_for_status()
    httpx.delete(f"{URL}/api/v1/vendor/{vendor_2['id']}").raise_for_status()

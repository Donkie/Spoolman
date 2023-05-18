"""Integration tests for the API."""

import httpx

URL = "http://spoolman:8000"


def test_add_vendor():
    """Test adding a vendor to the database."""
    name = "John"
    comment = "abcdefghåäö"
    result = httpx.post(
        f"{URL}/api/v1/vendor",
        json={"name": name, "comment": comment},
    )
    result.raise_for_status()

    vendor = result.json()
    assert vendor["name"] == name
    assert vendor["comment"] == comment
    assert vendor["id"] is not None
    assert vendor["registered"] is not None


def test_get_vendor():
    """Test getting a vendor from the database."""
    name = "John"
    comment = "abcdefghåäö"
    result = httpx.post(
        f"{URL}/api/v1/vendor",
        json={"name": name, "comment": comment},
    )
    result.raise_for_status()

    added_vendor = result.json()

    result = httpx.get(
        f"{URL}/api/v1/vendor/{added_vendor['id']}",
    )
    result.raise_for_status()

    vendor = result.json()

    assert vendor["name"] == name
    assert vendor["comment"] == comment
    assert vendor["id"] == added_vendor["id"]
    assert vendor["registered"] == added_vendor["registered"]

"""Tests for filtering and sorting by custom fields."""

import httpx
import json
import pytest
from typing import Any

from ..conftest import URL, assert_httpx_success, assert_lists_compatible


@pytest.mark.asyncio
async def test_filter_by_custom_field(random_filament: dict[str, Any]):
    """Add a custom text field"""
    result = httpx.post(
        f"{URL}/api/v1/field/spool/test_field",
        json={
            "name": "Test field",
            "field_type": "text",
            "default_value": json.dumps("Hello World"),
        },
    )
    assert_httpx_success(result)

    """Test filtering by custom field."""
    # Create a spool with a custom field
    result = httpx.post(
        f"{URL}/api/v1/spool",
        json={
            "filament_id": random_filament["id"],
            "extra": {
                "test_field": json.dumps("test_value")
            }
        },
    )
    assert_httpx_success(result)
    spool_id1 = result.json()["id"]

    # Create another spool with a different custom field value
    result = httpx.post(
        f"{URL}/api/v1/spool",
        json={
            "filament_id": random_filament["id"],
            "extra": {
                "test_field": json.dumps("other_value")
            }
        },
    )
    assert_httpx_success(result)
    spool_id2 = result.json()["id"]

    # Filter by custom field
    result = httpx.get(f"{URL}/api/v1/spool", params={"extra.test_field": "test_value"})
    assert_httpx_success(result)
    data = result.json()
    assert len(data) == 1
    assert data[0]["id"] == spool_id1

    # Filter by custom field with exact match
    result = httpx.get(f"{URL}/api/v1/spool", params={"extra.test_field": '"test_value"'})
    assert_httpx_success(result)
    data = result.json()
    assert len(data) == 1
    assert data[0]["id"] == spool_id1

    # Filter by custom field with multiple values
    result = httpx.get(f"{URL}/api/v1/spool", params={"extra.test_field": "test_value,other_value"})
    assert_httpx_success(result)
    data = result.json()
    assert len(data) == 2
    assert {item["id"] for item in data} == {spool_id1, spool_id2}

    # Clean up
    result = httpx.delete(f"{URL}/api/v1/field/spool/test_field")
    assert_httpx_success(result)
    httpx.delete(f"{URL}/api/v1/spool/{spool_id1}").raise_for_status()
    httpx.delete(f"{URL}/api/v1/spool/{spool_id2}").raise_for_status()


@pytest.mark.asyncio
async def test_sort_by_custom_field(random_filament: dict[str, Any]):
    """Add a custom text field"""
    result = httpx.post(
        f"{URL}/api/v1/field/spool/text_field",
        json={
            "name": "Text field",
            "field_type": "text",
        },
    )
    assert_httpx_success(result)

    """Test sorting by custom field."""
    # Create spools with custom fields of different types
    # Text field
    result = httpx.post(
        f"{URL}/api/v1/spool",
        json={
            "filament_id": random_filament["id"],
            "extra": {
                "text_field": json.dumps("B value")
            }
        },
    )
    assert_httpx_success(result)
    spool_id1 = result.json()["id"]

    result = httpx.post(
        f"{URL}/api/v1/spool",
        json={
            "filament_id": random_filament["id"],
            "extra": {
                "text_field": json.dumps("A value")
            }
        },
    )
    assert_httpx_success(result)
    spool_id2 = result.json()["id"]

    # Sort by custom field ascending
    result = httpx.get(f"{URL}/api/v1/spool", params={"sort": "extra.text_field:asc"})
    assert_httpx_success(result)
    data = result.json()
    assert len(data) >= 2
    # Find our test spools in the results
    test_spools = [item for item in data if item["id"] in (spool_id1, spool_id2)]
    assert len(test_spools) == 2
    assert test_spools[0]["id"] == spool_id2  # A value should come first
    assert test_spools[1]["id"] == spool_id1  # B value should come second

    # Sort by custom field descending
    result = httpx.get(f"{URL}/api/v1/spool", params={"sort": "extra.text_field:desc"})
    assert_httpx_success(result)
    data = result.json()
    assert len(data) >= 2
    # Find our test spools in the results
    test_spools = [item for item in data if item["id"] in (spool_id1, spool_id2)]
    assert len(test_spools) == 2
    assert test_spools[0]["id"] == spool_id1  # B value should come first
    assert test_spools[1]["id"] == spool_id2  # A value should come second

    # Clean up
    result = httpx.delete(f"{URL}/api/v1/field/spool/text_field")
    assert_httpx_success(result)
    httpx.delete(f"{URL}/api/v1/spool/{spool_id1}").raise_for_status()
    httpx.delete(f"{URL}/api/v1/spool/{spool_id2}").raise_for_status()


@pytest.mark.asyncio
async def test_filter_by_numeric_custom_field(random_filament: dict[str, Any]):
    """Add a custom numeric field"""
    result = httpx.post(
        f"{URL}/api/v1/field/spool/numeric_field",
        json={
            "name": "Numeric field",
            "field_type": "integer",
        },
    )
    assert_httpx_success(result)

    """Test filtering by numeric custom field."""
    # Create a spool with a numeric custom field
    result = httpx.post(
        f"{URL}/api/v1/spool",
        json={
            "filament_id": random_filament["id"],
            "extra": {
                "numeric_field": json.dumps(100)
            }
        },
    )
    assert_httpx_success(result)
    spool_id1 = result.json()["id"]

    # Create another spool with a different numeric value
    result = httpx.post(
        f"{URL}/api/v1/spool",
        json={
            "filament_id": random_filament["id"],
            "extra": {
                "numeric_field": json.dumps(200)
            }
        },
    )
    assert_httpx_success(result)
    spool_id2 = result.json()["id"]

    # Filter by numeric custom field
    result = httpx.get(f"{URL}/api/v1/spool", params={"extra.numeric_field": "100"})
    assert_httpx_success(result)
    data = result.json()
    assert len(data) == 1
    assert data[0]["id"] == spool_id1

    # Sort by numeric custom field ascending
    result = httpx.get(f"{URL}/api/v1/spool", params={"sort": "extra.numeric_field:asc"})
    assert_httpx_success(result)
    data = result.json()
    # Find our test spools in the results
    test_spools = [item for item in data if item["id"] in (spool_id1, spool_id2)]
    assert len(test_spools) == 2
    assert test_spools[0]["id"] == spool_id1  # 100 should come first
    assert test_spools[1]["id"] == spool_id2  # 200 should come second

    # Clean up
    result = httpx.delete(f"{URL}/api/v1/field/spool/numeric_field")
    assert_httpx_success(result)
    httpx.delete(f"{URL}/api/v1/spool/{spool_id1}").raise_for_status()
    httpx.delete(f"{URL}/api/v1/spool/{spool_id2}").raise_for_status()


@pytest.mark.asyncio
async def test_filter_by_boolean_custom_field(random_filament: dict[str, Any]):
    """Add a custom boolean field"""
    result = httpx.post(
        f"{URL}/api/v1/field/spool/boolean_field",
        json={
            "name": "Boolean field",
            "field_type": "boolean",
        },
    )
    assert_httpx_success(result)

    """Test filtering by boolean custom field."""
    # Create a spool with a boolean custom field
    result = httpx.post(
        f"{URL}/api/v1/spool",
        json={
            "filament_id": random_filament["id"],
            "extra": {
                "boolean_field": json.dumps(True)
            }
        },
    )
    assert_httpx_success(result)
    spool_id1 = result.json()["id"]

    # Create another spool with a different boolean value
    result = httpx.post(
        f"{URL}/api/v1/spool",
        json={
            "filament_id": random_filament["id"],
            "extra": {
                "boolean_field": json.dumps(False)
            }
        },
    )
    assert_httpx_success(result)
    spool_id2 = result.json()["id"]

    # Filter by boolean custom field
    result = httpx.get(f"{URL}/api/v1/spool", params={"extra.boolean_field": "true"})
    assert_httpx_success(result)
    data = result.json()
    assert len(data) == 1
    assert data[0]["id"] == spool_id1

    # Clean up
    result = httpx.delete(f"{URL}/api/v1/field/spool/boolean_field")
    assert_httpx_success(result)
    httpx.delete(f"{URL}/api/v1/spool/{spool_id1}").raise_for_status()
    httpx.delete(f"{URL}/api/v1/spool/{spool_id2}").raise_for_status()
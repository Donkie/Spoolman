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


@pytest.mark.asyncio
async def test_filter_and_sort_float_custom_field(random_filament: dict[str, Any]):
    """Test filtering and sorting by a float custom field."""
    result = httpx.post(
        f"{URL}/api/v1/field/spool/float_field",
        json={"name": "Float field", "field_type": "float"},
    )
    assert_httpx_success(result)

    result = httpx.post(
        f"{URL}/api/v1/spool",
        json={"filament_id": random_filament["id"], "extra": {"float_field": json.dumps(1.5)}},
    )
    assert_httpx_success(result)
    spool_id1 = result.json()["id"]

    result = httpx.post(
        f"{URL}/api/v1/spool",
        json={"filament_id": random_filament["id"], "extra": {"float_field": json.dumps(2.5)}},
    )
    assert_httpx_success(result)
    spool_id2 = result.json()["id"]

    # Filter by exact float value
    result = httpx.get(f"{URL}/api/v1/spool", params={"extra.float_field": "1.5"})
    assert_httpx_success(result)
    ids = {item["id"] for item in result.json()}
    assert spool_id1 in ids
    assert spool_id2 not in ids

    # Sort ascending: 1.5 before 2.5
    result = httpx.get(f"{URL}/api/v1/spool", params={"sort": "extra.float_field:asc"})
    assert_httpx_success(result)
    test_spools = [item for item in result.json() if item["id"] in (spool_id1, spool_id2)]
    assert len(test_spools) == 2
    assert test_spools[0]["id"] == spool_id1
    assert test_spools[1]["id"] == spool_id2

    # Sort descending: 2.5 before 1.5
    result = httpx.get(f"{URL}/api/v1/spool", params={"sort": "extra.float_field:desc"})
    assert_httpx_success(result)
    test_spools = [item for item in result.json() if item["id"] in (spool_id1, spool_id2)]
    assert len(test_spools) == 2
    assert test_spools[0]["id"] == spool_id2
    assert test_spools[1]["id"] == spool_id1

    # Clean up
    httpx.delete(f"{URL}/api/v1/field/spool/float_field").raise_for_status()
    httpx.delete(f"{URL}/api/v1/spool/{spool_id1}").raise_for_status()
    httpx.delete(f"{URL}/api/v1/spool/{spool_id2}").raise_for_status()


@pytest.mark.asyncio
async def test_filter_single_choice_custom_field(random_filament: dict[str, Any]):
    """Test filtering by a single-choice custom field."""
    result = httpx.post(
        f"{URL}/api/v1/field/spool/choice_field",
        json={
            "name": "Choice field",
            "field_type": "choice",
            "choices": ["OptionA", "OptionB", "OptionC"],
            "multi_choice": False,
        },
    )
    assert_httpx_success(result)

    result = httpx.post(
        f"{URL}/api/v1/spool",
        json={"filament_id": random_filament["id"], "extra": {"choice_field": json.dumps("OptionA")}},
    )
    assert_httpx_success(result)
    spool_id1 = result.json()["id"]

    result = httpx.post(
        f"{URL}/api/v1/spool",
        json={"filament_id": random_filament["id"], "extra": {"choice_field": json.dumps("OptionB")}},
    )
    assert_httpx_success(result)
    spool_id2 = result.json()["id"]

    # Filter by a single choice value
    result = httpx.get(f"{URL}/api/v1/spool", params={"extra.choice_field": "OptionA"})
    assert_httpx_success(result)
    ids = {item["id"] for item in result.json()}
    assert spool_id1 in ids
    assert spool_id2 not in ids

    # Filter by multiple choices (OR) — both should be returned
    result = httpx.get(f"{URL}/api/v1/spool", params={"extra.choice_field": "OptionA,OptionB"})
    assert_httpx_success(result)
    ids = {item["id"] for item in result.json()}
    assert spool_id1 in ids
    assert spool_id2 in ids

    # Clean up
    httpx.delete(f"{URL}/api/v1/field/spool/choice_field").raise_for_status()
    httpx.delete(f"{URL}/api/v1/spool/{spool_id1}").raise_for_status()
    httpx.delete(f"{URL}/api/v1/spool/{spool_id2}").raise_for_status()


@pytest.mark.asyncio
async def test_filter_multi_choice_custom_field(random_filament: dict[str, Any]):
    """Test filtering by a multi-choice custom field."""
    result = httpx.post(
        f"{URL}/api/v1/field/spool/multi_choice_field",
        json={
            "name": "Multi-choice field",
            "field_type": "choice",
            "choices": ["A", "B", "C"],
            "multi_choice": True,
        },
    )
    assert_httpx_success(result)

    # Spool 1 has choices A and B
    result = httpx.post(
        f"{URL}/api/v1/spool",
        json={"filament_id": random_filament["id"], "extra": {"multi_choice_field": json.dumps(["A", "B"])}},
    )
    assert_httpx_success(result)
    spool_id1 = result.json()["id"]

    # Spool 2 has only choice C
    result = httpx.post(
        f"{URL}/api/v1/spool",
        json={"filament_id": random_filament["id"], "extra": {"multi_choice_field": json.dumps(["C"])}},
    )
    assert_httpx_success(result)
    spool_id2 = result.json()["id"]

    # Filter by A — only spool 1 has A
    result = httpx.get(f"{URL}/api/v1/spool", params={"extra.multi_choice_field": "A"})
    assert_httpx_success(result)
    ids = {item["id"] for item in result.json()}
    assert spool_id1 in ids
    assert spool_id2 not in ids

    # Filter by C — only spool 2 has C
    result = httpx.get(f"{URL}/api/v1/spool", params={"extra.multi_choice_field": "C"})
    assert_httpx_success(result)
    ids = {item["id"] for item in result.json()}
    assert spool_id2 in ids
    assert spool_id1 not in ids

    # Filter by A,C (OR) — both should be returned
    result = httpx.get(f"{URL}/api/v1/spool", params={"extra.multi_choice_field": "A,C"})
    assert_httpx_success(result)
    ids = {item["id"] for item in result.json()}
    assert spool_id1 in ids
    assert spool_id2 in ids

    # Clean up
    httpx.delete(f"{URL}/api/v1/field/spool/multi_choice_field").raise_for_status()
    httpx.delete(f"{URL}/api/v1/spool/{spool_id1}").raise_for_status()
    httpx.delete(f"{URL}/api/v1/spool/{spool_id2}").raise_for_status()


@pytest.mark.asyncio
async def test_filter_empty_custom_field(random_filament: dict[str, Any]):
    """Test the <empty> filter returns items that have no value set for a custom field."""
    result = httpx.post(
        f"{URL}/api/v1/field/spool/optional_field",
        json={"name": "Optional field", "field_type": "text"},
    )
    assert_httpx_success(result)

    # Spool 1 has the field set
    result = httpx.post(
        f"{URL}/api/v1/spool",
        json={"filament_id": random_filament["id"], "extra": {"optional_field": json.dumps("has_value")}},
    )
    assert_httpx_success(result)
    spool_id1 = result.json()["id"]

    # Spool 2 does NOT have the field set
    result = httpx.post(
        f"{URL}/api/v1/spool",
        json={"filament_id": random_filament["id"]},
    )
    assert_httpx_success(result)
    spool_id2 = result.json()["id"]

    # Filter by <empty> — spool 2 (no field row) should appear, spool 1 should not
    result = httpx.get(f"{URL}/api/v1/spool", params={"extra.optional_field": "<empty>"})
    assert_httpx_success(result)
    ids = {item["id"] for item in result.json()}
    assert spool_id2 in ids
    assert spool_id1 not in ids

    # Filter by the value — spool 1 should appear, spool 2 should not
    result = httpx.get(f"{URL}/api/v1/spool", params={"extra.optional_field": "has_value"})
    assert_httpx_success(result)
    ids = {item["id"] for item in result.json()}
    assert spool_id1 in ids
    assert spool_id2 not in ids

    # Clean up
    httpx.delete(f"{URL}/api/v1/field/spool/optional_field").raise_for_status()
    httpx.delete(f"{URL}/api/v1/spool/{spool_id1}").raise_for_status()
    httpx.delete(f"{URL}/api/v1/spool/{spool_id2}").raise_for_status()


@pytest.mark.asyncio
async def test_filter_sort_filament_custom_field(random_filament: dict[str, Any]):
    """Test filtering and sorting filaments by a custom field."""
    vendor_id = random_filament["vendor"]["id"]

    result = httpx.post(
        f"{URL}/api/v1/field/filament/filament_tag",
        json={"name": "Filament tag", "field_type": "text"},
    )
    assert_httpx_success(result)

    result = httpx.post(
        f"{URL}/api/v1/filament",
        json={"vendor_id": vendor_id, "density": 1.24, "diameter": 1.75, "extra": {"filament_tag": json.dumps("beta")}},
    )
    assert_httpx_success(result)
    filament_id1 = result.json()["id"]

    result = httpx.post(
        f"{URL}/api/v1/filament",
        json={"vendor_id": vendor_id, "density": 1.24, "diameter": 1.75, "extra": {"filament_tag": json.dumps("alpha")}},
    )
    assert_httpx_success(result)
    filament_id2 = result.json()["id"]

    # Filter by custom field — only filament with "beta" should appear
    result = httpx.get(f"{URL}/api/v1/filament", params={"extra.filament_tag": "beta"})
    assert_httpx_success(result)
    ids = {item["id"] for item in result.json()}
    assert filament_id1 in ids
    assert filament_id2 not in ids

    # Sort ascending: alpha before beta
    result = httpx.get(f"{URL}/api/v1/filament", params={"sort": "extra.filament_tag:asc"})
    assert_httpx_success(result)
    test_filaments = [item for item in result.json() if item["id"] in (filament_id1, filament_id2)]
    assert len(test_filaments) == 2
    assert test_filaments[0]["id"] == filament_id2  # alpha first
    assert test_filaments[1]["id"] == filament_id1  # beta second

    # Sort descending: beta before alpha
    result = httpx.get(f"{URL}/api/v1/filament", params={"sort": "extra.filament_tag:desc"})
    assert_httpx_success(result)
    test_filaments = [item for item in result.json() if item["id"] in (filament_id1, filament_id2)]
    assert len(test_filaments) == 2
    assert test_filaments[0]["id"] == filament_id1  # beta first
    assert test_filaments[1]["id"] == filament_id2  # alpha second

    # Clean up
    httpx.delete(f"{URL}/api/v1/field/filament/filament_tag").raise_for_status()
    httpx.delete(f"{URL}/api/v1/filament/{filament_id1}").raise_for_status()
    httpx.delete(f"{URL}/api/v1/filament/{filament_id2}").raise_for_status()


@pytest.mark.asyncio
async def test_filter_sort_vendor_custom_field():
    """Test filtering and sorting vendors by a custom field."""
    result = httpx.post(
        f"{URL}/api/v1/field/vendor/vendor_tier",
        json={"name": "Vendor tier", "field_type": "text"},
    )
    assert_httpx_success(result)

    result = httpx.post(
        f"{URL}/api/v1/vendor",
        json={"name": "Vendor Gold", "extra": {"vendor_tier": json.dumps("gold")}},
    )
    assert_httpx_success(result)
    vendor_id1 = result.json()["id"]

    result = httpx.post(
        f"{URL}/api/v1/vendor",
        json={"name": "Vendor Silver", "extra": {"vendor_tier": json.dumps("silver")}},
    )
    assert_httpx_success(result)
    vendor_id2 = result.json()["id"]

    # Filter by vendor custom field — only gold vendor should appear
    result = httpx.get(f"{URL}/api/v1/vendor", params={"extra.vendor_tier": "gold"})
    assert_httpx_success(result)
    ids = {item["id"] for item in result.json()}
    assert vendor_id1 in ids
    assert vendor_id2 not in ids

    # Sort ascending: gold before silver
    result = httpx.get(f"{URL}/api/v1/vendor", params={"sort": "extra.vendor_tier:asc"})
    assert_httpx_success(result)
    test_vendors = [item for item in result.json() if item["id"] in (vendor_id1, vendor_id2)]
    assert len(test_vendors) == 2
    assert test_vendors[0]["id"] == vendor_id1  # gold first
    assert test_vendors[1]["id"] == vendor_id2  # silver second

    # Sort descending: silver before gold
    result = httpx.get(f"{URL}/api/v1/vendor", params={"sort": "extra.vendor_tier:desc"})
    assert_httpx_success(result)
    test_vendors = [item for item in result.json() if item["id"] in (vendor_id1, vendor_id2)]
    assert len(test_vendors) == 2
    assert test_vendors[0]["id"] == vendor_id2  # silver first
    assert test_vendors[1]["id"] == vendor_id1  # gold second

    # Clean up
    httpx.delete(f"{URL}/api/v1/field/vendor/vendor_tier").raise_for_status()
    httpx.delete(f"{URL}/api/v1/vendor/{vendor_id1}").raise_for_status()
    httpx.delete(f"{URL}/api/v1/vendor/{vendor_id2}").raise_for_status()

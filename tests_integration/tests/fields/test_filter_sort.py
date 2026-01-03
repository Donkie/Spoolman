"""Tests for filtering and sorting by custom fields."""

import json
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_filter_by_custom_field(client: AsyncClient, setup_extra_fields):
    """Test filtering by custom field."""
    # Create a spool with a custom field
    spool_data = {
        "filament_id": 1,
        "extra": {
            "test_field": json.dumps("test_value")
        }
    }
    response = await client.post("/api/v1/spool", json=spool_data)
    assert response.status_code == 200
    spool_id = response.json()["id"]

    # Create another spool with a different custom field value
    spool_data2 = {
        "filament_id": 1,
        "extra": {
            "test_field": json.dumps("other_value")
        }
    }
    response = await client.post("/api/v1/spool", json=spool_data2)
    assert response.status_code == 200
    spool_id2 = response.json()["id"]

    # Filter by custom field
    response = await client.get("/api/v1/spool", params={"extra.test_field": "test_value"})
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["id"] == spool_id

    # Filter by custom field with exact match
    response = await client.get("/api/v1/spool", params={"extra.test_field": '"test_value"'})
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["id"] == spool_id

    # Filter by custom field with multiple values
    response = await client.get("/api/v1/spool", params={"extra.test_field": "test_value,other_value"})
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    assert {item["id"] for item in data} == {spool_id, spool_id2}


@pytest.mark.asyncio
async def test_sort_by_custom_field(client: AsyncClient, setup_extra_fields):
    """Test sorting by custom field."""
    # Create spools with custom fields of different types
    # Text field
    spool_data1 = {
        "filament_id": 1,
        "extra": {
            "text_field": json.dumps("B value")
        }
    }
    response = await client.post("/api/v1/spool", json=spool_data1)
    assert response.status_code == 200
    spool_id1 = response.json()["id"]

    spool_data2 = {
        "filament_id": 1,
        "extra": {
            "text_field": json.dumps("A value")
        }
    }
    response = await client.post("/api/v1/spool", json=spool_data2)
    assert response.status_code == 200
    spool_id2 = response.json()["id"]

    # Sort by custom field ascending
    response = await client.get("/api/v1/spool", params={"sort": "extra.text_field:asc"})
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 2
    # Find our test spools in the results
    test_spools = [item for item in data if item["id"] in (spool_id1, spool_id2)]
    assert len(test_spools) == 2
    assert test_spools[0]["id"] == spool_id2  # A value should come first
    assert test_spools[1]["id"] == spool_id1  # B value should come second

    # Sort by custom field descending
    response = await client.get("/api/v1/spool", params={"sort": "extra.text_field:desc"})
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 2
    # Find our test spools in the results
    test_spools = [item for item in data if item["id"] in (spool_id1, spool_id2)]
    assert len(test_spools) == 2
    assert test_spools[0]["id"] == spool_id1  # B value should come first
    assert test_spools[1]["id"] == spool_id2  # A value should come second


@pytest.mark.asyncio
async def test_filter_by_numeric_custom_field(client: AsyncClient, setup_extra_fields):
    """Test filtering by numeric custom field."""
    # Create a spool with a numeric custom field
    spool_data = {
        "filament_id": 1,
        "extra": {
            "numeric_field": json.dumps(100)
        }
    }
    response = await client.post("/api/v1/spool", json=spool_data)
    assert response.status_code == 200
    spool_id = response.json()["id"]

    # Create another spool with a different numeric value
    spool_data2 = {
        "filament_id": 1,
        "extra": {
            "numeric_field": json.dumps(200)
        }
    }
    response = await client.post("/api/v1/spool", json=spool_data2)
    assert response.status_code == 200
    spool_id2 = response.json()["id"]

    # Filter by numeric custom field
    response = await client.get("/api/v1/spool", params={"extra.numeric_field": "100"})
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["id"] == spool_id

    # Sort by numeric custom field ascending
    response = await client.get("/api/v1/spool", params={"sort": "extra.numeric_field:asc"})
    assert response.status_code == 200
    data = response.json()
    # Find our test spools in the results
    test_spools = [item for item in data if item["id"] in (spool_id, spool_id2)]
    assert len(test_spools) == 2
    assert test_spools[0]["id"] == spool_id  # 100 should come first
    assert test_spools[1]["id"] == spool_id2  # 200 should come second


@pytest.mark.asyncio
async def test_filter_by_boolean_custom_field(client: AsyncClient, setup_extra_fields):
    """Test filtering by boolean custom field."""
    # Create a spool with a boolean custom field
    spool_data = {
        "filament_id": 1,
        "extra": {
            "bool_field": json.dumps(True)
        }
    }
    response = await client.post("/api/v1/spool", json=spool_data)
    assert response.status_code == 200
    spool_id = response.json()["id"]

    # Create another spool with a different boolean value
    spool_data2 = {
        "filament_id": 1,
        "extra": {
            "bool_field": json.dumps(False)
        }
    }
    response = await client.post("/api/v1/spool", json=spool_data2)
    assert response.status_code == 200
    spool_id2 = response.json()["id"]

    # Filter by boolean custom field
    response = await client.get("/api/v1/spool", params={"extra.bool_field": "true"})
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["id"] == spool_id
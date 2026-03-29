"""Tests for filtering and sorting by custom fields."""

import json
from typing import Any

import httpx
import pytest

from ..conftest import URL, assert_httpx_success

# ---------------------------------------------------------------------------
# Spool - text
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_filter_by_custom_field(random_filament: dict[str, Any]):
    """Add a custom text field."""
    result = httpx.post(
        f"{URL}/api/v1/field/spool/test_field",
        json={
            "name": "Test field",
            "field_type": "text",
            "default_value": json.dumps("Hello World"),
        },
    )
    assert_httpx_success(result)

    result = httpx.post(
        f"{URL}/api/v1/spool",
        json={"filament_id": random_filament["id"], "extra": {"test_field": json.dumps("test_value")}},
    )
    assert_httpx_success(result)
    spool_id1 = result.json()["id"]

    result = httpx.post(
        f"{URL}/api/v1/spool",
        json={"filament_id": random_filament["id"], "extra": {"test_field": json.dumps("other_value")}},
    )
    assert_httpx_success(result)
    spool_id2 = result.json()["id"]

    # Substring filter
    result = httpx.get(f"{URL}/api/v1/spool", params={"extra.test_field": "test_value"})
    assert_httpx_success(result)
    data = result.json()
    assert len(data) == 1
    assert data[0]["id"] == spool_id1

    # Exact-match filter (wrapped in double quotes)
    result = httpx.get(f"{URL}/api/v1/spool", params={"extra.test_field": '"test_value"'})
    assert_httpx_success(result)
    data = result.json()
    assert len(data) == 1
    assert data[0]["id"] == spool_id1

    # Multi-value OR filter
    result = httpx.get(f"{URL}/api/v1/spool", params={"extra.test_field": "test_value,other_value"})
    assert_httpx_success(result)
    data = result.json()
    assert len(data) == 2
    assert {item["id"] for item in data} == {spool_id1, spool_id2}

    httpx.delete(f"{URL}/api/v1/field/spool/test_field").raise_for_status()
    httpx.delete(f"{URL}/api/v1/spool/{spool_id1}").raise_for_status()
    httpx.delete(f"{URL}/api/v1/spool/{spool_id2}").raise_for_status()


@pytest.mark.asyncio
async def test_sort_by_custom_field(random_filament: dict[str, Any]):
    """Add a custom text field."""
    result = httpx.post(
        f"{URL}/api/v1/field/spool/text_field",
        json={"name": "Text field", "field_type": "text"},
    )
    assert_httpx_success(result)

    result = httpx.post(
        f"{URL}/api/v1/spool",
        json={"filament_id": random_filament["id"], "extra": {"text_field": json.dumps("B value")}},
    )
    assert_httpx_success(result)
    spool_id1 = result.json()["id"]

    result = httpx.post(
        f"{URL}/api/v1/spool",
        json={"filament_id": random_filament["id"], "extra": {"text_field": json.dumps("A value")}},
    )
    assert_httpx_success(result)
    spool_id2 = result.json()["id"]

    result = httpx.get(f"{URL}/api/v1/spool", params={"sort": "extra.text_field:asc"})
    assert_httpx_success(result)
    test_spools = [item for item in result.json() if item["id"] in (spool_id1, spool_id2)]
    assert len(test_spools) == 2
    assert test_spools[0]["id"] == spool_id2  # "A value" first
    assert test_spools[1]["id"] == spool_id1  # "B value" second

    result = httpx.get(f"{URL}/api/v1/spool", params={"sort": "extra.text_field:desc"})
    assert_httpx_success(result)
    test_spools = [item for item in result.json() if item["id"] in (spool_id1, spool_id2)]
    assert len(test_spools) == 2
    assert test_spools[0]["id"] == spool_id1  # "B value" first
    assert test_spools[1]["id"] == spool_id2  # "A value" second

    httpx.delete(f"{URL}/api/v1/field/spool/text_field").raise_for_status()
    httpx.delete(f"{URL}/api/v1/spool/{spool_id1}").raise_for_status()
    httpx.delete(f"{URL}/api/v1/spool/{spool_id2}").raise_for_status()


# ---------------------------------------------------------------------------
# Spool - integer
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_filter_by_numeric_custom_field(random_filament: dict[str, Any]):
    """Test filtering and sorting by a custom integer field."""
    result = httpx.post(
        f"{URL}/api/v1/field/spool/numeric_field",
        json={"name": "Numeric field", "field_type": "integer"},
    )
    assert_httpx_success(result)

    result = httpx.post(
        f"{URL}/api/v1/spool",
        json={"filament_id": random_filament["id"], "extra": {"numeric_field": json.dumps(100)}},
    )
    assert_httpx_success(result)
    spool_id1 = result.json()["id"]

    result = httpx.post(
        f"{URL}/api/v1/spool",
        json={"filament_id": random_filament["id"], "extra": {"numeric_field": json.dumps(200)}},
    )
    assert_httpx_success(result)
    spool_id2 = result.json()["id"]

    result = httpx.get(f"{URL}/api/v1/spool", params={"extra.numeric_field": "100"})
    assert_httpx_success(result)
    data = result.json()
    assert len(data) == 1
    assert data[0]["id"] == spool_id1

    # Range filter - min only: stored_value >= 150 matches only spool2 (200)
    result = httpx.get(f"{URL}/api/v1/spool", params={"extra.numeric_field": "150:"})
    assert_httpx_success(result)
    ids = {item["id"] for item in result.json()}
    assert spool_id1 not in ids
    assert spool_id2 in ids

    # Range filter - max only: stored_value <= 150 matches only spool1 (100)
    result = httpx.get(f"{URL}/api/v1/spool", params={"extra.numeric_field": ":150"})
    assert_httpx_success(result)
    ids = {item["id"] for item in result.json()}
    assert spool_id1 in ids
    assert spool_id2 not in ids

    # Range filter - min and max: 50 <= stored_value <= 150 matches only spool1 (100)
    result = httpx.get(f"{URL}/api/v1/spool", params={"extra.numeric_field": "50:150"})
    assert_httpx_success(result)
    ids = {item["id"] for item in result.json()}
    assert spool_id1 in ids
    assert spool_id2 not in ids

    result = httpx.get(f"{URL}/api/v1/spool", params={"sort": "extra.numeric_field:asc"})
    assert_httpx_success(result)
    test_spools = [item for item in result.json() if item["id"] in (spool_id1, spool_id2)]
    assert len(test_spools) == 2
    assert test_spools[0]["id"] == spool_id1  # 100 first
    assert test_spools[1]["id"] == spool_id2  # 200 second

    result = httpx.get(f"{URL}/api/v1/spool", params={"sort": "extra.numeric_field:desc"})
    assert_httpx_success(result)
    test_spools = [item for item in result.json() if item["id"] in (spool_id1, spool_id2)]
    assert len(test_spools) == 2
    assert test_spools[0]["id"] == spool_id2  # 200 first
    assert test_spools[1]["id"] == spool_id1  # 100 second

    httpx.delete(f"{URL}/api/v1/field/spool/numeric_field").raise_for_status()
    httpx.delete(f"{URL}/api/v1/spool/{spool_id1}").raise_for_status()
    httpx.delete(f"{URL}/api/v1/spool/{spool_id2}").raise_for_status()


# ---------------------------------------------------------------------------
# Spool - float
# ---------------------------------------------------------------------------


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

    result = httpx.get(f"{URL}/api/v1/spool", params={"extra.float_field": "1.5"})
    assert_httpx_success(result)
    ids = {item["id"] for item in result.json()}
    assert spool_id1 in ids
    assert spool_id2 not in ids

    # Range filter - min only: stored_value >= 2.0 matches only spool2 (2.5)
    result = httpx.get(f"{URL}/api/v1/spool", params={"extra.float_field": "2.0:"})
    assert_httpx_success(result)
    ids = {item["id"] for item in result.json()}
    assert spool_id1 not in ids
    assert spool_id2 in ids

    # Range filter - max only: stored_value <= 2.0 matches only spool1 (1.5)
    result = httpx.get(f"{URL}/api/v1/spool", params={"extra.float_field": ":2.0"})
    assert_httpx_success(result)
    ids = {item["id"] for item in result.json()}
    assert spool_id1 in ids
    assert spool_id2 not in ids

    # Range filter - both: 1.0 <= stored_value <= 2.0 matches only spool1 (1.5)
    result = httpx.get(f"{URL}/api/v1/spool", params={"extra.float_field": "1.0:2.0"})
    assert_httpx_success(result)
    ids = {item["id"] for item in result.json()}
    assert spool_id1 in ids
    assert spool_id2 not in ids

    result = httpx.get(f"{URL}/api/v1/spool", params={"sort": "extra.float_field:asc"})
    assert_httpx_success(result)
    test_spools = [item for item in result.json() if item["id"] in (spool_id1, spool_id2)]
    assert len(test_spools) == 2
    assert test_spools[0]["id"] == spool_id1
    assert test_spools[1]["id"] == spool_id2

    result = httpx.get(f"{URL}/api/v1/spool", params={"sort": "extra.float_field:desc"})
    assert_httpx_success(result)
    test_spools = [item for item in result.json() if item["id"] in (spool_id1, spool_id2)]
    assert len(test_spools) == 2
    assert test_spools[0]["id"] == spool_id2
    assert test_spools[1]["id"] == spool_id1

    httpx.delete(f"{URL}/api/v1/field/spool/float_field").raise_for_status()
    httpx.delete(f"{URL}/api/v1/spool/{spool_id1}").raise_for_status()
    httpx.delete(f"{URL}/api/v1/spool/{spool_id2}").raise_for_status()


# ---------------------------------------------------------------------------
# Spool - boolean
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_filter_by_boolean_custom_field(random_filament: dict[str, Any]):
    """Test filtering and sorting by a custom boolean field."""
    result = httpx.post(
        f"{URL}/api/v1/field/spool/boolean_field",
        json={"name": "Boolean field", "field_type": "boolean"},
    )
    assert_httpx_success(result)

    result = httpx.post(
        f"{URL}/api/v1/spool",
        json={"filament_id": random_filament["id"], "extra": {"boolean_field": json.dumps(bool(1))}},
    )
    assert_httpx_success(result)
    spool_id_true = result.json()["id"]

    result = httpx.post(
        f"{URL}/api/v1/spool",
        json={"filament_id": random_filament["id"], "extra": {"boolean_field": json.dumps(bool(0))}},
    )
    assert_httpx_success(result)
    spool_id_false = result.json()["id"]

    # Filter true
    result = httpx.get(f"{URL}/api/v1/spool", params={"extra.boolean_field": "true"})
    assert_httpx_success(result)
    ids = {item["id"] for item in result.json()}
    assert spool_id_true in ids
    assert spool_id_false not in ids

    # Filter false
    result = httpx.get(f"{URL}/api/v1/spool", params={"extra.boolean_field": "false"})
    assert_httpx_success(result)
    ids = {item["id"] for item in result.json()}
    assert spool_id_false in ids
    assert spool_id_true not in ids

    # Sort ascending: false before true
    result = httpx.get(f"{URL}/api/v1/spool", params={"sort": "extra.boolean_field:asc"})
    assert_httpx_success(result)
    test_spools = [item for item in result.json() if item["id"] in (spool_id_true, spool_id_false)]
    assert len(test_spools) == 2
    assert test_spools[0]["id"] == spool_id_false
    assert test_spools[1]["id"] == spool_id_true

    # Sort descending: true before false
    result = httpx.get(f"{URL}/api/v1/spool", params={"sort": "extra.boolean_field:desc"})
    assert_httpx_success(result)
    test_spools = [item for item in result.json() if item["id"] in (spool_id_true, spool_id_false)]
    assert len(test_spools) == 2
    assert test_spools[0]["id"] == spool_id_true
    assert test_spools[1]["id"] == spool_id_false

    httpx.delete(f"{URL}/api/v1/field/spool/boolean_field").raise_for_status()
    httpx.delete(f"{URL}/api/v1/spool/{spool_id_true}").raise_for_status()
    httpx.delete(f"{URL}/api/v1/spool/{spool_id_false}").raise_for_status()


# ---------------------------------------------------------------------------
# Spool - single-choice
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_filter_single_choice_custom_field(random_filament: dict[str, Any]):
    """Test filtering and sorting by a single-choice custom field."""
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

    # Filter by single value
    result = httpx.get(f"{URL}/api/v1/spool", params={"extra.choice_field": "OptionA"})
    assert_httpx_success(result)
    ids = {item["id"] for item in result.json()}
    assert spool_id1 in ids
    assert spool_id2 not in ids

    # Multi-value OR
    result = httpx.get(f"{URL}/api/v1/spool", params={"extra.choice_field": "OptionA,OptionB"})
    assert_httpx_success(result)
    ids = {item["id"] for item in result.json()}
    assert spool_id1 in ids
    assert spool_id2 in ids

    # Sort ascending: OptionA before OptionB
    result = httpx.get(f"{URL}/api/v1/spool", params={"sort": "extra.choice_field:asc"})
    assert_httpx_success(result)
    test_spools = [item for item in result.json() if item["id"] in (spool_id1, spool_id2)]
    assert len(test_spools) == 2
    assert test_spools[0]["id"] == spool_id1
    assert test_spools[1]["id"] == spool_id2

    # Sort descending
    result = httpx.get(f"{URL}/api/v1/spool", params={"sort": "extra.choice_field:desc"})
    assert_httpx_success(result)
    test_spools = [item for item in result.json() if item["id"] in (spool_id1, spool_id2)]
    assert len(test_spools) == 2
    assert test_spools[0]["id"] == spool_id2
    assert test_spools[1]["id"] == spool_id1

    httpx.delete(f"{URL}/api/v1/field/spool/choice_field").raise_for_status()
    httpx.delete(f"{URL}/api/v1/spool/{spool_id1}").raise_for_status()
    httpx.delete(f"{URL}/api/v1/spool/{spool_id2}").raise_for_status()


# ---------------------------------------------------------------------------
# Spool - multi-choice
# ---------------------------------------------------------------------------


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

    result = httpx.post(
        f"{URL}/api/v1/spool",
        json={"filament_id": random_filament["id"], "extra": {"multi_choice_field": json.dumps(["A", "B"])}},
    )
    assert_httpx_success(result)
    spool_id1 = result.json()["id"]

    result = httpx.post(
        f"{URL}/api/v1/spool",
        json={"filament_id": random_filament["id"], "extra": {"multi_choice_field": json.dumps(["C"])}},
    )
    assert_httpx_success(result)
    spool_id2 = result.json()["id"]

    # Filter by A - only spool 1
    result = httpx.get(f"{URL}/api/v1/spool", params={"extra.multi_choice_field": "A"})
    assert_httpx_success(result)
    ids = {item["id"] for item in result.json()}
    assert spool_id1 in ids
    assert spool_id2 not in ids

    # Filter by C - only spool 2
    result = httpx.get(f"{URL}/api/v1/spool", params={"extra.multi_choice_field": "C"})
    assert_httpx_success(result)
    ids = {item["id"] for item in result.json()}
    assert spool_id2 in ids
    assert spool_id1 not in ids

    # Multi-value OR: both
    result = httpx.get(f"{URL}/api/v1/spool", params={"extra.multi_choice_field": "A,C"})
    assert_httpx_success(result)
    ids = {item["id"] for item in result.json()}
    assert spool_id1 in ids
    assert spool_id2 in ids

    httpx.delete(f"{URL}/api/v1/field/spool/multi_choice_field").raise_for_status()
    httpx.delete(f"{URL}/api/v1/spool/{spool_id1}").raise_for_status()
    httpx.delete(f"{URL}/api/v1/spool/{spool_id2}").raise_for_status()


# ---------------------------------------------------------------------------
# Spool - datetime
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_filter_sort_datetime_spool(random_filament: dict[str, Any]):
    """Test filtering and sorting by a custom datetime field on spools."""
    result = httpx.post(
        f"{URL}/api/v1/field/spool/dt_field",
        json={"name": "Datetime field", "field_type": "datetime"},
    )
    assert_httpx_success(result)

    dt_early = "2023-01-01T00:00:00"
    dt_late = "2024-06-15T12:30:00"

    result = httpx.post(
        f"{URL}/api/v1/spool",
        json={"filament_id": random_filament["id"], "extra": {"dt_field": json.dumps(dt_early)}},
    )
    assert_httpx_success(result)
    spool_id1 = result.json()["id"]

    result = httpx.post(
        f"{URL}/api/v1/spool",
        json={"filament_id": random_filament["id"], "extra": {"dt_field": json.dumps(dt_late)}},
    )
    assert_httpx_success(result)
    spool_id2 = result.json()["id"]

    # Exact-match filter
    result = httpx.get(f"{URL}/api/v1/spool", params={"extra.dt_field": dt_early})
    assert_httpx_success(result)
    ids = {item["id"] for item in result.json()}
    assert spool_id1 in ids
    assert spool_id2 not in ids

    # Sort ascending: early before late (ISO 8601 sorts lexicographically)
    result = httpx.get(f"{URL}/api/v1/spool", params={"sort": "extra.dt_field:asc"})
    assert_httpx_success(result)
    test_spools = [item for item in result.json() if item["id"] in (spool_id1, spool_id2)]
    assert len(test_spools) == 2
    assert test_spools[0]["id"] == spool_id1
    assert test_spools[1]["id"] == spool_id2

    # Sort descending
    result = httpx.get(f"{URL}/api/v1/spool", params={"sort": "extra.dt_field:desc"})
    assert_httpx_success(result)
    test_spools = [item for item in result.json() if item["id"] in (spool_id1, spool_id2)]
    assert len(test_spools) == 2
    assert test_spools[0]["id"] == spool_id2
    assert test_spools[1]["id"] == spool_id1

    httpx.delete(f"{URL}/api/v1/field/spool/dt_field").raise_for_status()
    httpx.delete(f"{URL}/api/v1/spool/{spool_id1}").raise_for_status()
    httpx.delete(f"{URL}/api/v1/spool/{spool_id2}").raise_for_status()


# ---------------------------------------------------------------------------
# Spool - integer_range
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_filter_sort_integer_range_spool(random_filament: dict[str, Any]):
    """Test filtering and sorting by a custom integer_range field on spools."""
    result = httpx.post(
        f"{URL}/api/v1/field/spool/int_range_field",
        json={"name": "Integer range field", "field_type": "integer_range"},
    )
    assert_httpx_success(result)

    result = httpx.post(
        f"{URL}/api/v1/spool",
        json={"filament_id": random_filament["id"], "extra": {"int_range_field": json.dumps([100, 200])}},
    )
    assert_httpx_success(result)
    spool_id1 = result.json()["id"]

    result = httpx.post(
        f"{URL}/api/v1/spool",
        json={"filament_id": random_filament["id"], "extra": {"int_range_field": json.dumps([300, 400])}},
    )
    assert_httpx_success(result)
    spool_id2 = result.json()["id"]

    # Filter by exact min:max
    result = httpx.get(f"{URL}/api/v1/spool", params={"extra.int_range_field": "100:200"})
    assert_httpx_success(result)
    ids = {item["id"] for item in result.json()}
    assert spool_id1 in ids
    assert spool_id2 not in ids

    # Filter by min only: stored_min >= 200 matches only spool2 ([300,400])
    result = httpx.get(f"{URL}/api/v1/spool", params={"extra.int_range_field": "200:"})
    assert_httpx_success(result)
    ids = {item["id"] for item in result.json()}
    assert spool_id1 not in ids
    assert spool_id2 in ids

    # Filter by max only: stored_max <= 300 matches only spool1 ([100,200])
    result = httpx.get(f"{URL}/api/v1/spool", params={"extra.int_range_field": ":300"})
    assert_httpx_success(result)
    ids = {item["id"] for item in result.json()}
    assert spool_id1 in ids
    assert spool_id2 not in ids

    # Sort ascending by min (100 before 300)
    result = httpx.get(f"{URL}/api/v1/spool", params={"sort": "extra.int_range_field:asc"})
    assert_httpx_success(result)
    test_spools = [item for item in result.json() if item["id"] in (spool_id1, spool_id2)]
    assert len(test_spools) == 2
    assert test_spools[0]["id"] == spool_id1
    assert test_spools[1]["id"] == spool_id2

    # Sort descending
    result = httpx.get(f"{URL}/api/v1/spool", params={"sort": "extra.int_range_field:desc"})
    assert_httpx_success(result)
    test_spools = [item for item in result.json() if item["id"] in (spool_id1, spool_id2)]
    assert len(test_spools) == 2
    assert test_spools[0]["id"] == spool_id2
    assert test_spools[1]["id"] == spool_id1

    httpx.delete(f"{URL}/api/v1/field/spool/int_range_field").raise_for_status()
    httpx.delete(f"{URL}/api/v1/spool/{spool_id1}").raise_for_status()
    httpx.delete(f"{URL}/api/v1/spool/{spool_id2}").raise_for_status()


# ---------------------------------------------------------------------------
# Spool - float_range
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_filter_sort_float_range_spool(random_filament: dict[str, Any]):
    """Test filtering and sorting by a custom float_range field on spools."""
    result = httpx.post(
        f"{URL}/api/v1/field/spool/float_range_field",
        json={"name": "Float range field", "field_type": "float_range"},
    )
    assert_httpx_success(result)

    result = httpx.post(
        f"{URL}/api/v1/spool",
        json={"filament_id": random_filament["id"], "extra": {"float_range_field": json.dumps([1.5, 2.5])}},
    )
    assert_httpx_success(result)
    spool_id1 = result.json()["id"]

    result = httpx.post(
        f"{URL}/api/v1/spool",
        json={"filament_id": random_filament["id"], "extra": {"float_range_field": json.dumps([3.5, 4.5])}},
    )
    assert_httpx_success(result)
    spool_id2 = result.json()["id"]

    # Filter by exact min:max
    result = httpx.get(f"{URL}/api/v1/spool", params={"extra.float_range_field": "1.5:2.5"})
    assert_httpx_success(result)
    ids = {item["id"] for item in result.json()}
    assert spool_id1 in ids
    assert spool_id2 not in ids

    # Filter by min only: stored_min >= 2.5 matches only spool2 ([3.5,4.5])
    result = httpx.get(f"{URL}/api/v1/spool", params={"extra.float_range_field": "2.5:"})
    assert_httpx_success(result)
    ids = {item["id"] for item in result.json()}
    assert spool_id1 not in ids
    assert spool_id2 in ids

    # Filter by max only: stored_max <= 3.5 matches only spool1 ([1.5,2.5])
    result = httpx.get(f"{URL}/api/v1/spool", params={"extra.float_range_field": ":3.5"})
    assert_httpx_success(result)
    ids = {item["id"] for item in result.json()}
    assert spool_id1 in ids
    assert spool_id2 not in ids

    # Sort ascending by min (1.5 before 3.5)
    result = httpx.get(f"{URL}/api/v1/spool", params={"sort": "extra.float_range_field:asc"})
    assert_httpx_success(result)
    test_spools = [item for item in result.json() if item["id"] in (spool_id1, spool_id2)]
    assert len(test_spools) == 2
    assert test_spools[0]["id"] == spool_id1
    assert test_spools[1]["id"] == spool_id2

    # Sort descending
    result = httpx.get(f"{URL}/api/v1/spool", params={"sort": "extra.float_range_field:desc"})
    assert_httpx_success(result)
    test_spools = [item for item in result.json() if item["id"] in (spool_id1, spool_id2)]
    assert len(test_spools) == 2
    assert test_spools[0]["id"] == spool_id2
    assert test_spools[1]["id"] == spool_id1

    httpx.delete(f"{URL}/api/v1/field/spool/float_range_field").raise_for_status()
    httpx.delete(f"{URL}/api/v1/spool/{spool_id1}").raise_for_status()
    httpx.delete(f"{URL}/api/v1/spool/{spool_id2}").raise_for_status()


# ---------------------------------------------------------------------------
# Spool - empty filter
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_filter_empty_custom_field(random_filament: dict[str, Any]):
    """Test the empty-string filter returns items that have no value set for a custom field."""
    result = httpx.post(
        f"{URL}/api/v1/field/spool/optional_field",
        json={"name": "Optional field", "field_type": "text"},
    )
    assert_httpx_success(result)

    result = httpx.post(
        f"{URL}/api/v1/spool",
        json={"filament_id": random_filament["id"], "extra": {"optional_field": json.dumps("has_value")}},
    )
    assert_httpx_success(result)
    spool_id1 = result.json()["id"]

    result = httpx.post(
        f"{URL}/api/v1/spool",
        json={"filament_id": random_filament["id"]},
    )
    assert_httpx_success(result)
    spool_id2 = result.json()["id"]

    # Empty filter - spool without field should appear
    result = httpx.get(f"{URL}/api/v1/spool", params={"extra.optional_field": ""})
    assert_httpx_success(result)
    ids = {item["id"] for item in result.json()}
    assert spool_id2 in ids
    assert spool_id1 not in ids

    # Value filter - spool with field should appear
    result = httpx.get(f"{URL}/api/v1/spool", params={"extra.optional_field": "has_value"})
    assert_httpx_success(result)
    ids = {item["id"] for item in result.json()}
    assert spool_id1 in ids
    assert spool_id2 not in ids

    httpx.delete(f"{URL}/api/v1/field/spool/optional_field").raise_for_status()
    httpx.delete(f"{URL}/api/v1/spool/{spool_id1}").raise_for_status()
    httpx.delete(f"{URL}/api/v1/spool/{spool_id2}").raise_for_status()


# ---------------------------------------------------------------------------
# Filament - text
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_filter_sort_filament_custom_field(random_filament: dict[str, Any]):
    """Test filtering and sorting filaments by a custom text field."""
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
        json={
            "vendor_id": vendor_id,
            "density": 1.24,
            "diameter": 1.75,
            "extra": {"filament_tag": json.dumps("alpha")},
        },
    )
    assert_httpx_success(result)
    filament_id2 = result.json()["id"]

    result = httpx.get(f"{URL}/api/v1/filament", params={"extra.filament_tag": "beta"})
    assert_httpx_success(result)
    ids = {item["id"] for item in result.json()}
    assert filament_id1 in ids
    assert filament_id2 not in ids

    result = httpx.get(f"{URL}/api/v1/filament", params={"sort": "extra.filament_tag:asc"})
    assert_httpx_success(result)
    test_filaments = [item for item in result.json() if item["id"] in (filament_id1, filament_id2)]
    assert len(test_filaments) == 2
    assert test_filaments[0]["id"] == filament_id2  # alpha first
    assert test_filaments[1]["id"] == filament_id1  # beta second

    result = httpx.get(f"{URL}/api/v1/filament", params={"sort": "extra.filament_tag:desc"})
    assert_httpx_success(result)
    test_filaments = [item for item in result.json() if item["id"] in (filament_id1, filament_id2)]
    assert len(test_filaments) == 2
    assert test_filaments[0]["id"] == filament_id1  # beta first
    assert test_filaments[1]["id"] == filament_id2  # alpha second

    httpx.delete(f"{URL}/api/v1/field/filament/filament_tag").raise_for_status()
    httpx.delete(f"{URL}/api/v1/filament/{filament_id1}").raise_for_status()
    httpx.delete(f"{URL}/api/v1/filament/{filament_id2}").raise_for_status()


# ---------------------------------------------------------------------------
# Filament - integer
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_filter_sort_filament_integer(random_filament: dict[str, Any]):
    """Test filtering and sorting filaments by a custom integer field."""
    vendor_id = random_filament["vendor"]["id"]

    result = httpx.post(
        f"{URL}/api/v1/field/filament/fil_int_field",
        json={"name": "Filament integer field", "field_type": "integer"},
    )
    assert_httpx_success(result)

    result = httpx.post(
        f"{URL}/api/v1/filament",
        json={"vendor_id": vendor_id, "density": 1.24, "diameter": 1.75, "extra": {"fil_int_field": json.dumps(10)}},
    )
    assert_httpx_success(result)
    filament_id1 = result.json()["id"]

    result = httpx.post(
        f"{URL}/api/v1/filament",
        json={"vendor_id": vendor_id, "density": 1.24, "diameter": 1.75, "extra": {"fil_int_field": json.dumps(20)}},
    )
    assert_httpx_success(result)
    filament_id2 = result.json()["id"]

    result = httpx.get(f"{URL}/api/v1/filament", params={"extra.fil_int_field": "10"})
    assert_httpx_success(result)
    ids = {item["id"] for item in result.json()}
    assert filament_id1 in ids
    assert filament_id2 not in ids

    result = httpx.get(f"{URL}/api/v1/filament", params={"sort": "extra.fil_int_field:asc"})
    assert_httpx_success(result)
    test_filaments = [item for item in result.json() if item["id"] in (filament_id1, filament_id2)]
    assert len(test_filaments) == 2
    assert test_filaments[0]["id"] == filament_id1
    assert test_filaments[1]["id"] == filament_id2

    result = httpx.get(f"{URL}/api/v1/filament", params={"sort": "extra.fil_int_field:desc"})
    assert_httpx_success(result)
    test_filaments = [item for item in result.json() if item["id"] in (filament_id1, filament_id2)]
    assert len(test_filaments) == 2
    assert test_filaments[0]["id"] == filament_id2
    assert test_filaments[1]["id"] == filament_id1

    httpx.delete(f"{URL}/api/v1/field/filament/fil_int_field").raise_for_status()
    httpx.delete(f"{URL}/api/v1/filament/{filament_id1}").raise_for_status()
    httpx.delete(f"{URL}/api/v1/filament/{filament_id2}").raise_for_status()


# ---------------------------------------------------------------------------
# Filament - float
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_filter_sort_filament_float(random_filament: dict[str, Any]):
    """Test filtering and sorting filaments by a custom float field."""
    vendor_id = random_filament["vendor"]["id"]

    result = httpx.post(
        f"{URL}/api/v1/field/filament/fil_float_field",
        json={"name": "Filament float field", "field_type": "float"},
    )
    assert_httpx_success(result)

    result = httpx.post(
        f"{URL}/api/v1/filament",
        json={
            "vendor_id": vendor_id,
            "density": 1.24,
            "diameter": 1.75,
            "extra": {"fil_float_field": json.dumps(1.1)},
        },
    )
    assert_httpx_success(result)
    filament_id1 = result.json()["id"]

    result = httpx.post(
        f"{URL}/api/v1/filament",
        json={
            "vendor_id": vendor_id,
            "density": 1.24,
            "diameter": 1.75,
            "extra": {"fil_float_field": json.dumps(9.9)},
        },
    )
    assert_httpx_success(result)
    filament_id2 = result.json()["id"]

    result = httpx.get(f"{URL}/api/v1/filament", params={"extra.fil_float_field": "1.1"})
    assert_httpx_success(result)
    ids = {item["id"] for item in result.json()}
    assert filament_id1 in ids
    assert filament_id2 not in ids

    result = httpx.get(f"{URL}/api/v1/filament", params={"sort": "extra.fil_float_field:asc"})
    assert_httpx_success(result)
    test_filaments = [item for item in result.json() if item["id"] in (filament_id1, filament_id2)]
    assert len(test_filaments) == 2
    assert test_filaments[0]["id"] == filament_id1
    assert test_filaments[1]["id"] == filament_id2

    result = httpx.get(f"{URL}/api/v1/filament", params={"sort": "extra.fil_float_field:desc"})
    assert_httpx_success(result)
    test_filaments = [item for item in result.json() if item["id"] in (filament_id1, filament_id2)]
    assert len(test_filaments) == 2
    assert test_filaments[0]["id"] == filament_id2
    assert test_filaments[1]["id"] == filament_id1

    httpx.delete(f"{URL}/api/v1/field/filament/fil_float_field").raise_for_status()
    httpx.delete(f"{URL}/api/v1/filament/{filament_id1}").raise_for_status()
    httpx.delete(f"{URL}/api/v1/filament/{filament_id2}").raise_for_status()


# ---------------------------------------------------------------------------
# Filament - boolean
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_filter_sort_filament_boolean(random_filament: dict[str, Any]):
    """Test filtering and sorting filaments by a custom boolean field."""
    vendor_id = random_filament["vendor"]["id"]

    result = httpx.post(
        f"{URL}/api/v1/field/filament/fil_bool_field",
        json={"name": "Filament boolean field", "field_type": "boolean"},
    )
    assert_httpx_success(result)

    result = httpx.post(
        f"{URL}/api/v1/filament",
        json={
            "vendor_id": vendor_id,
            "density": 1.24,
            "diameter": 1.75,
            "extra": {"fil_bool_field": json.dumps(bool(1))},
        },
    )
    assert_httpx_success(result)
    filament_id_true = result.json()["id"]

    result = httpx.post(
        f"{URL}/api/v1/filament",
        json={
            "vendor_id": vendor_id,
            "density": 1.24,
            "diameter": 1.75,
            "extra": {"fil_bool_field": json.dumps(bool(0))},
        },
    )
    assert_httpx_success(result)
    filament_id_false = result.json()["id"]

    result = httpx.get(f"{URL}/api/v1/filament", params={"extra.fil_bool_field": "true"})
    assert_httpx_success(result)
    ids = {item["id"] for item in result.json()}
    assert filament_id_true in ids
    assert filament_id_false not in ids

    result = httpx.get(f"{URL}/api/v1/filament", params={"extra.fil_bool_field": "false"})
    assert_httpx_success(result)
    ids = {item["id"] for item in result.json()}
    assert filament_id_false in ids
    assert filament_id_true not in ids

    result = httpx.get(f"{URL}/api/v1/filament", params={"sort": "extra.fil_bool_field:asc"})
    assert_httpx_success(result)
    test_filaments = [item for item in result.json() if item["id"] in (filament_id_true, filament_id_false)]
    assert len(test_filaments) == 2
    assert test_filaments[0]["id"] == filament_id_false
    assert test_filaments[1]["id"] == filament_id_true

    httpx.delete(f"{URL}/api/v1/field/filament/fil_bool_field").raise_for_status()
    httpx.delete(f"{URL}/api/v1/filament/{filament_id_true}").raise_for_status()
    httpx.delete(f"{URL}/api/v1/filament/{filament_id_false}").raise_for_status()


# ---------------------------------------------------------------------------
# Filament - single-choice
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_filter_filament_single_choice(random_filament: dict[str, Any]):
    """Test filtering filaments by a single-choice custom field."""
    vendor_id = random_filament["vendor"]["id"]

    result = httpx.post(
        f"{URL}/api/v1/field/filament/fil_choice_field",
        json={
            "name": "Filament choice field",
            "field_type": "choice",
            "choices": ["PLA", "PETG", "ABS"],
            "multi_choice": False,
        },
    )
    assert_httpx_success(result)

    result = httpx.post(
        f"{URL}/api/v1/filament",
        json={
            "vendor_id": vendor_id,
            "density": 1.24,
            "diameter": 1.75,
            "extra": {"fil_choice_field": json.dumps("PLA")},
        },
    )
    assert_httpx_success(result)
    filament_id1 = result.json()["id"]

    result = httpx.post(
        f"{URL}/api/v1/filament",
        json={
            "vendor_id": vendor_id,
            "density": 1.24,
            "diameter": 1.75,
            "extra": {"fil_choice_field": json.dumps("PETG")},
        },
    )
    assert_httpx_success(result)
    filament_id2 = result.json()["id"]

    result = httpx.get(f"{URL}/api/v1/filament", params={"extra.fil_choice_field": "PLA"})
    assert_httpx_success(result)
    ids = {item["id"] for item in result.json()}
    assert filament_id1 in ids
    assert filament_id2 not in ids

    result = httpx.get(f"{URL}/api/v1/filament", params={"extra.fil_choice_field": "PLA,PETG"})
    assert_httpx_success(result)
    ids = {item["id"] for item in result.json()}
    assert filament_id1 in ids
    assert filament_id2 in ids

    httpx.delete(f"{URL}/api/v1/field/filament/fil_choice_field").raise_for_status()
    httpx.delete(f"{URL}/api/v1/filament/{filament_id1}").raise_for_status()
    httpx.delete(f"{URL}/api/v1/filament/{filament_id2}").raise_for_status()


# ---------------------------------------------------------------------------
# Filament - multi-choice
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_filter_filament_multi_choice(random_filament: dict[str, Any]):
    """Test filtering filaments by a multi-choice custom field."""
    vendor_id = random_filament["vendor"]["id"]

    result = httpx.post(
        f"{URL}/api/v1/field/filament/fil_multi_field",
        json={
            "name": "Filament multi-choice",
            "field_type": "choice",
            "choices": ["X", "Y", "Z"],
            "multi_choice": True,
        },
    )
    assert_httpx_success(result)

    result = httpx.post(
        f"{URL}/api/v1/filament",
        json={
            "vendor_id": vendor_id,
            "density": 1.24,
            "diameter": 1.75,
            "extra": {"fil_multi_field": json.dumps(["X", "Y"])},
        },
    )
    assert_httpx_success(result)
    filament_id1 = result.json()["id"]

    result = httpx.post(
        f"{URL}/api/v1/filament",
        json={
            "vendor_id": vendor_id,
            "density": 1.24,
            "diameter": 1.75,
            "extra": {"fil_multi_field": json.dumps(["Z"])},
        },
    )
    assert_httpx_success(result)
    filament_id2 = result.json()["id"]

    result = httpx.get(f"{URL}/api/v1/filament", params={"extra.fil_multi_field": "X"})
    assert_httpx_success(result)
    ids = {item["id"] for item in result.json()}
    assert filament_id1 in ids
    assert filament_id2 not in ids

    result = httpx.get(f"{URL}/api/v1/filament", params={"extra.fil_multi_field": "Z"})
    assert_httpx_success(result)
    ids = {item["id"] for item in result.json()}
    assert filament_id2 in ids
    assert filament_id1 not in ids

    httpx.delete(f"{URL}/api/v1/field/filament/fil_multi_field").raise_for_status()
    httpx.delete(f"{URL}/api/v1/filament/{filament_id1}").raise_for_status()
    httpx.delete(f"{URL}/api/v1/filament/{filament_id2}").raise_for_status()


# ---------------------------------------------------------------------------
# Filament - datetime
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_filter_sort_filament_datetime(random_filament: dict[str, Any]):
    """Test filtering and sorting filaments by a custom datetime field."""
    vendor_id = random_filament["vendor"]["id"]

    result = httpx.post(
        f"{URL}/api/v1/field/filament/fil_dt_field",
        json={"name": "Filament datetime field", "field_type": "datetime"},
    )
    assert_httpx_success(result)

    dt_early = "2022-03-01T09:00:00"
    dt_late = "2025-09-15T18:00:00"

    result = httpx.post(
        f"{URL}/api/v1/filament",
        json={
            "vendor_id": vendor_id,
            "density": 1.24,
            "diameter": 1.75,
            "extra": {"fil_dt_field": json.dumps(dt_early)},
        },
    )
    assert_httpx_success(result)
    filament_id1 = result.json()["id"]

    result = httpx.post(
        f"{URL}/api/v1/filament",
        json={
            "vendor_id": vendor_id,
            "density": 1.24,
            "diameter": 1.75,
            "extra": {"fil_dt_field": json.dumps(dt_late)},
        },
    )
    assert_httpx_success(result)
    filament_id2 = result.json()["id"]

    result = httpx.get(f"{URL}/api/v1/filament", params={"extra.fil_dt_field": dt_early})
    assert_httpx_success(result)
    ids = {item["id"] for item in result.json()}
    assert filament_id1 in ids
    assert filament_id2 not in ids

    result = httpx.get(f"{URL}/api/v1/filament", params={"sort": "extra.fil_dt_field:asc"})
    assert_httpx_success(result)
    test_filaments = [item for item in result.json() if item["id"] in (filament_id1, filament_id2)]
    assert len(test_filaments) == 2
    assert test_filaments[0]["id"] == filament_id1
    assert test_filaments[1]["id"] == filament_id2

    httpx.delete(f"{URL}/api/v1/field/filament/fil_dt_field").raise_for_status()
    httpx.delete(f"{URL}/api/v1/filament/{filament_id1}").raise_for_status()
    httpx.delete(f"{URL}/api/v1/filament/{filament_id2}").raise_for_status()


# ---------------------------------------------------------------------------
# Filament - integer_range
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_filter_sort_filament_integer_range(random_filament: dict[str, Any]):
    """Test filtering and sorting filaments by a custom integer_range field."""
    vendor_id = random_filament["vendor"]["id"]

    result = httpx.post(
        f"{URL}/api/v1/field/filament/fil_int_range",
        json={"name": "Filament integer range", "field_type": "integer_range"},
    )
    assert_httpx_success(result)

    result = httpx.post(
        f"{URL}/api/v1/filament",
        json={
            "vendor_id": vendor_id,
            "density": 1.24,
            "diameter": 1.75,
            "extra": {"fil_int_range": json.dumps([200, 220])},
        },
    )
    assert_httpx_success(result)
    filament_id1 = result.json()["id"]

    result = httpx.post(
        f"{URL}/api/v1/filament",
        json={
            "vendor_id": vendor_id,
            "density": 1.24,
            "diameter": 1.75,
            "extra": {"fil_int_range": json.dumps([240, 260])},
        },
    )
    assert_httpx_success(result)
    filament_id2 = result.json()["id"]

    result = httpx.get(f"{URL}/api/v1/filament", params={"extra.fil_int_range": "200:220"})
    assert_httpx_success(result)
    ids = {item["id"] for item in result.json()}
    assert filament_id1 in ids
    assert filament_id2 not in ids

    result = httpx.get(f"{URL}/api/v1/filament", params={"sort": "extra.fil_int_range:asc"})
    assert_httpx_success(result)
    test_filaments = [item for item in result.json() if item["id"] in (filament_id1, filament_id2)]
    assert len(test_filaments) == 2
    assert test_filaments[0]["id"] == filament_id1
    assert test_filaments[1]["id"] == filament_id2

    result = httpx.get(f"{URL}/api/v1/filament", params={"sort": "extra.fil_int_range:desc"})
    assert_httpx_success(result)
    test_filaments = [item for item in result.json() if item["id"] in (filament_id1, filament_id2)]
    assert len(test_filaments) == 2
    assert test_filaments[0]["id"] == filament_id2
    assert test_filaments[1]["id"] == filament_id1

    httpx.delete(f"{URL}/api/v1/field/filament/fil_int_range").raise_for_status()
    httpx.delete(f"{URL}/api/v1/filament/{filament_id1}").raise_for_status()
    httpx.delete(f"{URL}/api/v1/filament/{filament_id2}").raise_for_status()


# ---------------------------------------------------------------------------
# Filament - float_range
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_filter_sort_filament_float_range(random_filament: dict[str, Any]):
    """Test filtering and sorting filaments by a custom float_range field."""
    vendor_id = random_filament["vendor"]["id"]

    result = httpx.post(
        f"{URL}/api/v1/field/filament/fil_float_range",
        json={"name": "Filament float range", "field_type": "float_range"},
    )
    assert_httpx_success(result)

    result = httpx.post(
        f"{URL}/api/v1/filament",
        json={
            "vendor_id": vendor_id,
            "density": 1.24,
            "diameter": 1.75,
            "extra": {"fil_float_range": json.dumps([0.5, 1.0])},
        },
    )
    assert_httpx_success(result)
    filament_id1 = result.json()["id"]

    result = httpx.post(
        f"{URL}/api/v1/filament",
        json={
            "vendor_id": vendor_id,
            "density": 1.24,
            "diameter": 1.75,
            "extra": {"fil_float_range": json.dumps([5.0, 7.5])},
        },
    )
    assert_httpx_success(result)
    filament_id2 = result.json()["id"]

    result = httpx.get(f"{URL}/api/v1/filament", params={"extra.fil_float_range": "0.5:1.0"})
    assert_httpx_success(result)
    ids = {item["id"] for item in result.json()}
    assert filament_id1 in ids
    assert filament_id2 not in ids

    result = httpx.get(f"{URL}/api/v1/filament", params={"sort": "extra.fil_float_range:asc"})
    assert_httpx_success(result)
    test_filaments = [item for item in result.json() if item["id"] in (filament_id1, filament_id2)]
    assert len(test_filaments) == 2
    assert test_filaments[0]["id"] == filament_id1
    assert test_filaments[1]["id"] == filament_id2

    httpx.delete(f"{URL}/api/v1/field/filament/fil_float_range").raise_for_status()
    httpx.delete(f"{URL}/api/v1/filament/{filament_id1}").raise_for_status()
    httpx.delete(f"{URL}/api/v1/filament/{filament_id2}").raise_for_status()


# ---------------------------------------------------------------------------
# Filament - empty filter
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_filter_empty_filament_custom_field(random_filament: dict[str, Any]):
    """Test the empty-string filter for filaments returns items with no value set."""
    vendor_id = random_filament["vendor"]["id"]

    result = httpx.post(
        f"{URL}/api/v1/field/filament/fil_optional",
        json={"name": "Optional filament field", "field_type": "text"},
    )
    assert_httpx_success(result)

    result = httpx.post(
        f"{URL}/api/v1/filament",
        json={
            "vendor_id": vendor_id,
            "density": 1.24,
            "diameter": 1.75,
            "extra": {"fil_optional": json.dumps("set")},
        },
    )
    assert_httpx_success(result)
    filament_id1 = result.json()["id"]

    result = httpx.post(
        f"{URL}/api/v1/filament",
        json={"vendor_id": vendor_id, "density": 1.24, "diameter": 1.75},
    )
    assert_httpx_success(result)
    filament_id2 = result.json()["id"]

    result = httpx.get(f"{URL}/api/v1/filament", params={"extra.fil_optional": ""})
    assert_httpx_success(result)
    ids = {item["id"] for item in result.json()}
    assert filament_id2 in ids
    assert filament_id1 not in ids

    result = httpx.get(f"{URL}/api/v1/filament", params={"extra.fil_optional": "set"})
    assert_httpx_success(result)
    ids = {item["id"] for item in result.json()}
    assert filament_id1 in ids
    assert filament_id2 not in ids

    httpx.delete(f"{URL}/api/v1/field/filament/fil_optional").raise_for_status()
    httpx.delete(f"{URL}/api/v1/filament/{filament_id1}").raise_for_status()
    httpx.delete(f"{URL}/api/v1/filament/{filament_id2}").raise_for_status()


# ---------------------------------------------------------------------------
# Vendor - text
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_filter_sort_vendor_custom_field():
    """Test filtering and sorting vendors by a custom text field."""
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

    result = httpx.get(f"{URL}/api/v1/vendor", params={"extra.vendor_tier": "gold"})
    assert_httpx_success(result)
    ids = {item["id"] for item in result.json()}
    assert vendor_id1 in ids
    assert vendor_id2 not in ids

    result = httpx.get(f"{URL}/api/v1/vendor", params={"sort": "extra.vendor_tier:asc"})
    assert_httpx_success(result)
    test_vendors = [item for item in result.json() if item["id"] in (vendor_id1, vendor_id2)]
    assert len(test_vendors) == 2
    assert test_vendors[0]["id"] == vendor_id1  # gold first
    assert test_vendors[1]["id"] == vendor_id2  # silver second

    result = httpx.get(f"{URL}/api/v1/vendor", params={"sort": "extra.vendor_tier:desc"})
    assert_httpx_success(result)
    test_vendors = [item for item in result.json() if item["id"] in (vendor_id1, vendor_id2)]
    assert len(test_vendors) == 2
    assert test_vendors[0]["id"] == vendor_id2  # silver first
    assert test_vendors[1]["id"] == vendor_id1  # gold second

    httpx.delete(f"{URL}/api/v1/field/vendor/vendor_tier").raise_for_status()
    httpx.delete(f"{URL}/api/v1/vendor/{vendor_id1}").raise_for_status()
    httpx.delete(f"{URL}/api/v1/vendor/{vendor_id2}").raise_for_status()



# ---------------------------------------------------------------------------
# Vendor - integer
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_filter_sort_vendor_integer():
    """Test filtering and sorting vendors by a custom integer field."""
    result = httpx.post(
        f"{URL}/api/v1/field/vendor/ven_int_field",
        json={"name": "Vendor integer field", "field_type": "integer"},
    )
    assert_httpx_success(result)

    result = httpx.post(
        f"{URL}/api/v1/vendor",
        json={"name": "Vendor A Int", "extra": {"ven_int_field": json.dumps(5)}},
    )
    assert_httpx_success(result)
    vendor_id1 = result.json()["id"]

    result = httpx.post(
        f"{URL}/api/v1/vendor",
        json={"name": "Vendor B Int", "extra": {"ven_int_field": json.dumps(50)}},
    )
    assert_httpx_success(result)
    vendor_id2 = result.json()["id"]

    result = httpx.get(f"{URL}/api/v1/vendor", params={"extra.ven_int_field": "5"})
    assert_httpx_success(result)
    ids = {item["id"] for item in result.json()}
    assert vendor_id1 in ids
    assert vendor_id2 not in ids

    result = httpx.get(f"{URL}/api/v1/vendor", params={"sort": "extra.ven_int_field:asc"})
    assert_httpx_success(result)
    test_vendors = [item for item in result.json() if item["id"] in (vendor_id1, vendor_id2)]
    assert len(test_vendors) == 2
    assert test_vendors[0]["id"] == vendor_id1
    assert test_vendors[1]["id"] == vendor_id2

    result = httpx.get(f"{URL}/api/v1/vendor", params={"sort": "extra.ven_int_field:desc"})
    assert_httpx_success(result)
    test_vendors = [item for item in result.json() if item["id"] in (vendor_id1, vendor_id2)]
    assert len(test_vendors) == 2
    assert test_vendors[0]["id"] == vendor_id2
    assert test_vendors[1]["id"] == vendor_id1

    httpx.delete(f"{URL}/api/v1/field/vendor/ven_int_field").raise_for_status()
    httpx.delete(f"{URL}/api/v1/vendor/{vendor_id1}").raise_for_status()
    httpx.delete(f"{URL}/api/v1/vendor/{vendor_id2}").raise_for_status()


# ---------------------------------------------------------------------------
# Vendor - float
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_filter_sort_vendor_float():
    """Test filtering and sorting vendors by a custom float field."""
    result = httpx.post(
        f"{URL}/api/v1/field/vendor/ven_float_field",
        json={"name": "Vendor float field", "field_type": "float"},
    )
    assert_httpx_success(result)

    result = httpx.post(
        f"{URL}/api/v1/vendor",
        json={"name": "Vendor A Float", "extra": {"ven_float_field": json.dumps(0.1)}},
    )
    assert_httpx_success(result)
    vendor_id1 = result.json()["id"]

    result = httpx.post(
        f"{URL}/api/v1/vendor",
        json={"name": "Vendor B Float", "extra": {"ven_float_field": json.dumps(9.9)}},
    )
    assert_httpx_success(result)
    vendor_id2 = result.json()["id"]

    result = httpx.get(f"{URL}/api/v1/vendor", params={"extra.ven_float_field": "0.1"})
    assert_httpx_success(result)
    ids = {item["id"] for item in result.json()}
    assert vendor_id1 in ids
    assert vendor_id2 not in ids

    result = httpx.get(f"{URL}/api/v1/vendor", params={"sort": "extra.ven_float_field:asc"})
    assert_httpx_success(result)
    test_vendors = [item for item in result.json() if item["id"] in (vendor_id1, vendor_id2)]
    assert len(test_vendors) == 2
    assert test_vendors[0]["id"] == vendor_id1
    assert test_vendors[1]["id"] == vendor_id2

    httpx.delete(f"{URL}/api/v1/field/vendor/ven_float_field").raise_for_status()
    httpx.delete(f"{URL}/api/v1/vendor/{vendor_id1}").raise_for_status()
    httpx.delete(f"{URL}/api/v1/vendor/{vendor_id2}").raise_for_status()


# ---------------------------------------------------------------------------
# Vendor - boolean
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_filter_sort_vendor_boolean():
    """Test filtering and sorting vendors by a custom boolean field."""
    result = httpx.post(
        f"{URL}/api/v1/field/vendor/ven_bool_field",
        json={"name": "Vendor boolean field", "field_type": "boolean"},
    )
    assert_httpx_success(result)

    result = httpx.post(
        f"{URL}/api/v1/vendor",
        json={"name": "Vendor Active", "extra": {"ven_bool_field": json.dumps(bool(1))}},
    )
    assert_httpx_success(result)
    vendor_id_true = result.json()["id"]

    result = httpx.post(
        f"{URL}/api/v1/vendor",
        json={"name": "Vendor Inactive", "extra": {"ven_bool_field": json.dumps(bool(0))}},
    )
    assert_httpx_success(result)
    vendor_id_false = result.json()["id"]

    result = httpx.get(f"{URL}/api/v1/vendor", params={"extra.ven_bool_field": "true"})
    assert_httpx_success(result)
    ids = {item["id"] for item in result.json()}
    assert vendor_id_true in ids
    assert vendor_id_false not in ids

    result = httpx.get(f"{URL}/api/v1/vendor", params={"extra.ven_bool_field": "false"})
    assert_httpx_success(result)
    ids = {item["id"] for item in result.json()}
    assert vendor_id_false in ids
    assert vendor_id_true not in ids

    result = httpx.get(f"{URL}/api/v1/vendor", params={"sort": "extra.ven_bool_field:asc"})
    assert_httpx_success(result)
    test_vendors = [item for item in result.json() if item["id"] in (vendor_id_true, vendor_id_false)]
    assert len(test_vendors) == 2
    assert test_vendors[0]["id"] == vendor_id_false
    assert test_vendors[1]["id"] == vendor_id_true

    httpx.delete(f"{URL}/api/v1/field/vendor/ven_bool_field").raise_for_status()
    httpx.delete(f"{URL}/api/v1/vendor/{vendor_id_true}").raise_for_status()
    httpx.delete(f"{URL}/api/v1/vendor/{vendor_id_false}").raise_for_status()


# ---------------------------------------------------------------------------
# Vendor - single-choice
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_filter_sort_vendor_single_choice():
    """Test filtering and sorting vendors by a single-choice custom field."""
    result = httpx.post(
        f"{URL}/api/v1/field/vendor/ven_choice_field",
        json={
            "name": "Vendor choice field",
            "field_type": "choice",
            "choices": ["Bronze", "Silver", "Gold"],
            "multi_choice": False,
        },
    )
    assert_httpx_success(result)

    result = httpx.post(
        f"{URL}/api/v1/vendor",
        json={"name": "Vendor Bronze", "extra": {"ven_choice_field": json.dumps("Bronze")}},
    )
    assert_httpx_success(result)
    vendor_id1 = result.json()["id"]

    result = httpx.post(
        f"{URL}/api/v1/vendor",
        json={"name": "Vendor Gold", "extra": {"ven_choice_field": json.dumps("Gold")}},
    )
    assert_httpx_success(result)
    vendor_id2 = result.json()["id"]

    result = httpx.get(f"{URL}/api/v1/vendor", params={"extra.ven_choice_field": "Bronze"})
    assert_httpx_success(result)
    ids = {item["id"] for item in result.json()}
    assert vendor_id1 in ids
    assert vendor_id2 not in ids

    result = httpx.get(f"{URL}/api/v1/vendor", params={"extra.ven_choice_field": "Bronze,Gold"})
    assert_httpx_success(result)
    ids = {item["id"] for item in result.json()}
    assert vendor_id1 in ids
    assert vendor_id2 in ids

    result = httpx.get(f"{URL}/api/v1/vendor", params={"sort": "extra.ven_choice_field:asc"})
    assert_httpx_success(result)
    test_vendors = [item for item in result.json() if item["id"] in (vendor_id1, vendor_id2)]
    assert len(test_vendors) == 2
    assert test_vendors[0]["id"] == vendor_id1  # Bronze first
    assert test_vendors[1]["id"] == vendor_id2  # Gold second

    httpx.delete(f"{URL}/api/v1/field/vendor/ven_choice_field").raise_for_status()
    httpx.delete(f"{URL}/api/v1/vendor/{vendor_id1}").raise_for_status()
    httpx.delete(f"{URL}/api/v1/vendor/{vendor_id2}").raise_for_status()


# ---------------------------------------------------------------------------
# Vendor - multi-choice
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_filter_vendor_multi_choice():
    """Test filtering vendors by a multi-choice custom field."""
    result = httpx.post(
        f"{URL}/api/v1/field/vendor/ven_multi_field",
        json={
            "name": "Vendor multi-choice",
            "field_type": "choice",
            "choices": ["EU", "US", "ASIA"],
            "multi_choice": True,
        },
    )
    assert_httpx_success(result)

    result = httpx.post(
        f"{URL}/api/v1/vendor",
        json={"name": "Vendor EU+US", "extra": {"ven_multi_field": json.dumps(["EU", "US"])}},
    )
    assert_httpx_success(result)
    vendor_id1 = result.json()["id"]

    result = httpx.post(
        f"{URL}/api/v1/vendor",
        json={"name": "Vendor ASIA", "extra": {"ven_multi_field": json.dumps(["ASIA"])}},
    )
    assert_httpx_success(result)
    vendor_id2 = result.json()["id"]

    result = httpx.get(f"{URL}/api/v1/vendor", params={"extra.ven_multi_field": "EU"})
    assert_httpx_success(result)
    ids = {item["id"] for item in result.json()}
    assert vendor_id1 in ids
    assert vendor_id2 not in ids

    result = httpx.get(f"{URL}/api/v1/vendor", params={"extra.ven_multi_field": "ASIA"})
    assert_httpx_success(result)
    ids = {item["id"] for item in result.json()}
    assert vendor_id2 in ids
    assert vendor_id1 not in ids

    httpx.delete(f"{URL}/api/v1/field/vendor/ven_multi_field").raise_for_status()
    httpx.delete(f"{URL}/api/v1/vendor/{vendor_id1}").raise_for_status()
    httpx.delete(f"{URL}/api/v1/vendor/{vendor_id2}").raise_for_status()


# ---------------------------------------------------------------------------
# Vendor - datetime
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_filter_sort_vendor_datetime():
    """Test filtering and sorting vendors by a custom datetime field."""
    result = httpx.post(
        f"{URL}/api/v1/field/vendor/ven_dt_field",
        json={"name": "Vendor datetime field", "field_type": "datetime"},
    )
    assert_httpx_success(result)

    dt_early = "2020-01-01T00:00:00"
    dt_late = "2026-12-31T23:59:59"

    result = httpx.post(
        f"{URL}/api/v1/vendor",
        json={"name": "Vendor Old", "extra": {"ven_dt_field": json.dumps(dt_early)}},
    )
    assert_httpx_success(result)
    vendor_id1 = result.json()["id"]

    result = httpx.post(
        f"{URL}/api/v1/vendor",
        json={"name": "Vendor New", "extra": {"ven_dt_field": json.dumps(dt_late)}},
    )
    assert_httpx_success(result)
    vendor_id2 = result.json()["id"]

    result = httpx.get(f"{URL}/api/v1/vendor", params={"extra.ven_dt_field": dt_early})
    assert_httpx_success(result)
    ids = {item["id"] for item in result.json()}
    assert vendor_id1 in ids
    assert vendor_id2 not in ids

    result = httpx.get(f"{URL}/api/v1/vendor", params={"sort": "extra.ven_dt_field:asc"})
    assert_httpx_success(result)
    test_vendors = [item for item in result.json() if item["id"] in (vendor_id1, vendor_id2)]
    assert len(test_vendors) == 2
    assert test_vendors[0]["id"] == vendor_id1
    assert test_vendors[1]["id"] == vendor_id2

    result = httpx.get(f"{URL}/api/v1/vendor", params={"sort": "extra.ven_dt_field:desc"})
    assert_httpx_success(result)
    test_vendors = [item for item in result.json() if item["id"] in (vendor_id1, vendor_id2)]
    assert len(test_vendors) == 2
    assert test_vendors[0]["id"] == vendor_id2
    assert test_vendors[1]["id"] == vendor_id1

    httpx.delete(f"{URL}/api/v1/field/vendor/ven_dt_field").raise_for_status()
    httpx.delete(f"{URL}/api/v1/vendor/{vendor_id1}").raise_for_status()
    httpx.delete(f"{URL}/api/v1/vendor/{vendor_id2}").raise_for_status()


# ---------------------------------------------------------------------------
# Vendor - integer_range
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_filter_sort_vendor_integer_range():
    """Test filtering and sorting vendors by a custom integer_range field."""
    result = httpx.post(
        f"{URL}/api/v1/field/vendor/ven_int_range",
        json={"name": "Vendor integer range", "field_type": "integer_range"},
    )
    assert_httpx_success(result)

    result = httpx.post(
        f"{URL}/api/v1/vendor",
        json={"name": "Vendor Range Low", "extra": {"ven_int_range": json.dumps([10, 20])}},
    )
    assert_httpx_success(result)
    vendor_id1 = result.json()["id"]

    result = httpx.post(
        f"{URL}/api/v1/vendor",
        json={"name": "Vendor Range High", "extra": {"ven_int_range": json.dumps([90, 100])}},
    )
    assert_httpx_success(result)
    vendor_id2 = result.json()["id"]

    result = httpx.get(f"{URL}/api/v1/vendor", params={"extra.ven_int_range": "10:20"})
    assert_httpx_success(result)
    ids = {item["id"] for item in result.json()}
    assert vendor_id1 in ids
    assert vendor_id2 not in ids

    # Filter by min only: stored_min >= 50 matches only vendor2 ([90,100])
    result = httpx.get(f"{URL}/api/v1/vendor", params={"extra.ven_int_range": "50:"})
    assert_httpx_success(result)
    ids = {item["id"] for item in result.json()}
    assert vendor_id1 not in ids
    assert vendor_id2 in ids

    # Filter by max only: stored_max <= 50 matches only vendor1 ([10,20])
    result = httpx.get(f"{URL}/api/v1/vendor", params={"extra.ven_int_range": ":50"})
    assert_httpx_success(result)
    ids = {item["id"] for item in result.json()}
    assert vendor_id1 in ids
    assert vendor_id2 not in ids

    result = httpx.get(f"{URL}/api/v1/vendor", params={"sort": "extra.ven_int_range:asc"})
    assert_httpx_success(result)
    test_vendors = [item for item in result.json() if item["id"] in (vendor_id1, vendor_id2)]
    assert len(test_vendors) == 2
    assert test_vendors[0]["id"] == vendor_id1
    assert test_vendors[1]["id"] == vendor_id2

    result = httpx.get(f"{URL}/api/v1/vendor", params={"sort": "extra.ven_int_range:desc"})
    assert_httpx_success(result)
    test_vendors = [item for item in result.json() if item["id"] in (vendor_id1, vendor_id2)]
    assert len(test_vendors) == 2
    assert test_vendors[0]["id"] == vendor_id2
    assert test_vendors[1]["id"] == vendor_id1

    httpx.delete(f"{URL}/api/v1/field/vendor/ven_int_range").raise_for_status()
    httpx.delete(f"{URL}/api/v1/vendor/{vendor_id1}").raise_for_status()
    httpx.delete(f"{URL}/api/v1/vendor/{vendor_id2}").raise_for_status()


# ---------------------------------------------------------------------------
# Vendor - float_range
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_filter_sort_vendor_float_range():
    """Test filtering and sorting vendors by a custom float_range field."""
    result = httpx.post(
        f"{URL}/api/v1/field/vendor/ven_float_range",
        json={"name": "Vendor float range", "field_type": "float_range"},
    )
    assert_httpx_success(result)

    result = httpx.post(
        f"{URL}/api/v1/vendor",
        json={"name": "Vendor Range Small", "extra": {"ven_float_range": json.dumps([0.1, 0.5])}},
    )
    assert_httpx_success(result)
    vendor_id1 = result.json()["id"]

    result = httpx.post(
        f"{URL}/api/v1/vendor",
        json={"name": "Vendor Range Large", "extra": {"ven_float_range": json.dumps([10.0, 20.0])}},
    )
    assert_httpx_success(result)
    vendor_id2 = result.json()["id"]

    result = httpx.get(f"{URL}/api/v1/vendor", params={"extra.ven_float_range": "0.1:0.5"})
    assert_httpx_success(result)
    ids = {item["id"] for item in result.json()}
    assert vendor_id1 in ids
    assert vendor_id2 not in ids

    result = httpx.get(f"{URL}/api/v1/vendor", params={"sort": "extra.ven_float_range:asc"})
    assert_httpx_success(result)
    test_vendors = [item for item in result.json() if item["id"] in (vendor_id1, vendor_id2)]
    assert len(test_vendors) == 2
    assert test_vendors[0]["id"] == vendor_id1
    assert test_vendors[1]["id"] == vendor_id2

    result = httpx.get(f"{URL}/api/v1/vendor", params={"sort": "extra.ven_float_range:desc"})
    assert_httpx_success(result)
    test_vendors = [item for item in result.json() if item["id"] in (vendor_id1, vendor_id2)]
    assert len(test_vendors) == 2
    assert test_vendors[0]["id"] == vendor_id2
    assert test_vendors[1]["id"] == vendor_id1

    httpx.delete(f"{URL}/api/v1/field/vendor/ven_float_range").raise_for_status()
    httpx.delete(f"{URL}/api/v1/vendor/{vendor_id1}").raise_for_status()
    httpx.delete(f"{URL}/api/v1/vendor/{vendor_id2}").raise_for_status()


# ---------------------------------------------------------------------------
# Vendor - empty filter
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_filter_empty_vendor_custom_field():
    """Test the empty-string filter for vendors returns items with no value set."""
    result = httpx.post(
        f"{URL}/api/v1/field/vendor/ven_optional",
        json={"name": "Optional vendor field", "field_type": "text"},
    )
    assert_httpx_success(result)

    result = httpx.post(
        f"{URL}/api/v1/vendor",
        json={"name": "Vendor With Value", "extra": {"ven_optional": json.dumps("present")}},
    )
    assert_httpx_success(result)
    vendor_id1 = result.json()["id"]

    result = httpx.post(
        f"{URL}/api/v1/vendor",
        json={"name": "Vendor Without Value"},
    )
    assert_httpx_success(result)
    vendor_id2 = result.json()["id"]

    result = httpx.get(f"{URL}/api/v1/vendor", params={"extra.ven_optional": ""})
    assert_httpx_success(result)
    ids = {item["id"] for item in result.json()}
    assert vendor_id2 in ids
    assert vendor_id1 not in ids

    result = httpx.get(f"{URL}/api/v1/vendor", params={"extra.ven_optional": "present"})
    assert_httpx_success(result)
    ids = {item["id"] for item in result.json()}
    assert vendor_id1 in ids
    assert vendor_id2 not in ids

    httpx.delete(f"{URL}/api/v1/field/vendor/ven_optional").raise_for_status()
    httpx.delete(f"{URL}/api/v1/vendor/{vendor_id1}").raise_for_status()
    httpx.delete(f"{URL}/api/v1/vendor/{vendor_id2}").raise_for_status()


# ---------------------------------------------------------------------------
# Invalid filter values → 400
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_invalid_numeric_custom_field_filters_return_400():
    """Invalid numeric custom-field filters should fail explicitly instead of being ignored."""
    result = httpx.post(
        f"{URL}/api/v1/field/spool/numeric_field_400",
        json={"name": "Numeric field", "field_type": "integer"},
    )
    assert_httpx_success(result)

    result = httpx.get(f"{URL}/api/v1/spool", params={"extra.numeric_field_400": "abc"})
    assert result.status_code == 400
    assert "Invalid integer filter value" in result.json()["message"]

    httpx.delete(f"{URL}/api/v1/field/spool/numeric_field_400").raise_for_status()


@pytest.mark.asyncio
async def test_invalid_boolean_custom_field_filters_return_400():
    """Invalid boolean custom-field filters should fail explicitly instead of being coerced."""
    result = httpx.post(
        f"{URL}/api/v1/field/spool/boolean_field_400",
        json={"name": "Boolean field", "field_type": "boolean"},
    )
    assert_httpx_success(result)

    result = httpx.get(f"{URL}/api/v1/spool", params={"extra.boolean_field_400": "maybe"})
    assert result.status_code == 400
    assert "Invalid boolean filter value" in result.json()["message"]

    result = httpx.get(f"{URL}/api/v1/spool", params={"extra.boolean_field_400": "yes"})
    assert result.status_code == 400
    assert "Invalid boolean filter value" in result.json()["message"]

    httpx.delete(f"{URL}/api/v1/field/spool/boolean_field_400").raise_for_status()


@pytest.mark.asyncio
async def test_invalid_float_custom_field_filter_returns_400():
    """Invalid float custom-field filters should fail with a 400 error."""
    result = httpx.post(
        f"{URL}/api/v1/field/spool/float_field_400",
        json={"name": "Float field 400", "field_type": "float"},
    )
    assert_httpx_success(result)

    result = httpx.get(f"{URL}/api/v1/spool", params={"extra.float_field_400": "notafloat"})
    assert result.status_code == 400
    assert "Invalid float filter value" in result.json()["message"]

    httpx.delete(f"{URL}/api/v1/field/spool/float_field_400").raise_for_status()


@pytest.mark.asyncio
async def test_invalid_integer_range_custom_field_filter_returns_400():
    """Invalid integer_range custom-field filters should fail with a 400 error."""
    result = httpx.post(
        f"{URL}/api/v1/field/spool/int_range_400",
        json={"name": "Integer range 400", "field_type": "integer_range"},
    )
    assert_httpx_success(result)

    # Missing colon separator
    result = httpx.get(f"{URL}/api/v1/spool", params={"extra.int_range_400": "100"})
    assert result.status_code == 400
    assert "Invalid range filter value" in result.json()["message"]

    # Non-numeric min value
    result = httpx.get(f"{URL}/api/v1/spool", params={"extra.int_range_400": "abc:200"})
    assert result.status_code == 400
    assert "Invalid range filter value" in result.json()["message"]

    httpx.delete(f"{URL}/api/v1/field/spool/int_range_400").raise_for_status()


@pytest.mark.asyncio
async def test_invalid_float_range_custom_field_filter_returns_400():
    """Invalid float_range custom-field filters should fail with a 400 error."""
    result = httpx.post(
        f"{URL}/api/v1/field/spool/float_range_400",
        json={"name": "Float range 400", "field_type": "float_range"},
    )
    assert_httpx_success(result)

    # Missing colon separator
    result = httpx.get(f"{URL}/api/v1/spool", params={"extra.float_range_400": "1.5"})
    assert result.status_code == 400
    assert "Invalid range filter value" in result.json()["message"]

    # Non-numeric min value
    result = httpx.get(f"{URL}/api/v1/spool", params={"extra.float_range_400": "notanum:2.5"})
    assert result.status_code == 400
    assert "Invalid range filter value" in result.json()["message"]

    httpx.delete(f"{URL}/api/v1/field/spool/float_range_400").raise_for_status()

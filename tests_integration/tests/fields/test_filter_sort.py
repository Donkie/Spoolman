"""Tests for filtering and sorting by custom fields."""

import json
import uuid
from typing import Any

import httpx
import pytest

from ..conftest import URL, assert_httpx_success


def _create_entity(entity_type: str, extra: dict[str, str], random_filament: dict[str, Any]) -> int:
    """Create a test entity of the given type with the given extra fields. Returns the entity id."""
    if entity_type == "spool":
        result = httpx.post(
            f"{URL}/api/v1/spool",
            json={"filament_id": random_filament["id"], "extra": extra},
        )
    elif entity_type == "filament":
        result = httpx.post(
            f"{URL}/api/v1/filament",
            json={
                "vendor_id": random_filament["vendor"]["id"],
                "name": f"Test-{uuid.uuid4().hex[:8]}",
                "density": 1.24,
                "diameter": 1.75,
                "extra": extra,
            },
        )
    elif entity_type == "vendor":
        result = httpx.post(
            f"{URL}/api/v1/vendor",
            json={"name": f"Vendor-{uuid.uuid4().hex[:8]}", "extra": extra},
        )
    else:
        raise ValueError(f"Unknown entity type: {entity_type}")
    result.raise_for_status()
    return result.json()["id"]


# ---------------------------------------------------------------------------
# Numeric fields - integer, float, integer_range, float_range (all entity types)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.parametrize("entity_type", ["spool", "filament", "vendor"])
async def test_integer_filter_and_sort(entity_type: str, random_filament: dict[str, Any]) -> None:
    """Test filter and sort by a custom integer field for all entity types."""
    field_key = "test_int_field"
    httpx.post(
        f"{URL}/api/v1/field/{entity_type}/{field_key}",
        json={"name": "Integer field", "field_type": "integer"},
    ).raise_for_status()
    id1 = _create_entity(entity_type, {field_key: json.dumps(100)}, random_filament)
    id2 = _create_entity(entity_type, {field_key: json.dumps(200)}, random_filament)
    try:
        # Exact match
        result = httpx.get(f"{URL}/api/v1/{entity_type}", params={f"extra.{field_key}": "100"})
        assert_httpx_success(result)
        ids = {item["id"] for item in result.json()}
        assert id1 in ids
        assert id2 not in ids

        # Range: min only (>= 150 matches only id2=200)
        result = httpx.get(f"{URL}/api/v1/{entity_type}", params={f"extra.{field_key}": "150:"})
        assert_httpx_success(result)
        ids = {item["id"] for item in result.json()}
        assert id1 not in ids
        assert id2 in ids

        # Range: max only (<= 150 matches only id1=100)
        result = httpx.get(f"{URL}/api/v1/{entity_type}", params={f"extra.{field_key}": ":150"})
        assert_httpx_success(result)
        ids = {item["id"] for item in result.json()}
        assert id1 in ids
        assert id2 not in ids

        # Range: both bounds (50 <= x <= 150 matches only id1=100)
        result = httpx.get(f"{URL}/api/v1/{entity_type}", params={f"extra.{field_key}": "50:150"})
        assert_httpx_success(result)
        ids = {item["id"] for item in result.json()}
        assert id1 in ids
        assert id2 not in ids

        # Sort ascending (100 before 200)
        result = httpx.get(f"{URL}/api/v1/{entity_type}", params={"sort": f"extra.{field_key}:asc"})
        assert_httpx_success(result)
        ordered = [item for item in result.json() if item["id"] in (id1, id2)]
        assert len(ordered) == 2
        assert ordered[0]["id"] == id1
        assert ordered[1]["id"] == id2

        # Sort descending
        result = httpx.get(f"{URL}/api/v1/{entity_type}", params={"sort": f"extra.{field_key}:desc"})
        assert_httpx_success(result)
        ordered = [item for item in result.json() if item["id"] in (id1, id2)]
        assert len(ordered) == 2
        assert ordered[0]["id"] == id2
        assert ordered[1]["id"] == id1
    finally:
        httpx.delete(f"{URL}/api/v1/field/{entity_type}/{field_key}").raise_for_status()
        httpx.delete(f"{URL}/api/v1/{entity_type}/{id1}").raise_for_status()
        httpx.delete(f"{URL}/api/v1/{entity_type}/{id2}").raise_for_status()


@pytest.mark.asyncio
@pytest.mark.parametrize("entity_type", ["spool", "filament", "vendor"])
async def test_float_filter_and_sort(entity_type: str, random_filament: dict[str, Any]) -> None:
    """Test filter and sort by a custom float field for all entity types."""
    field_key = "test_float_field"
    httpx.post(
        f"{URL}/api/v1/field/{entity_type}/{field_key}",
        json={"name": "Float field", "field_type": "float"},
    ).raise_for_status()
    id1 = _create_entity(entity_type, {field_key: json.dumps(1.5)}, random_filament)
    id2 = _create_entity(entity_type, {field_key: json.dumps(2.5)}, random_filament)
    try:
        # Exact match
        result = httpx.get(f"{URL}/api/v1/{entity_type}", params={f"extra.{field_key}": "1.5"})
        assert_httpx_success(result)
        ids = {item["id"] for item in result.json()}
        assert id1 in ids
        assert id2 not in ids

        # Range: min only (>= 2.0 matches only id2=2.5)
        result = httpx.get(f"{URL}/api/v1/{entity_type}", params={f"extra.{field_key}": "2.0:"})
        assert_httpx_success(result)
        ids = {item["id"] for item in result.json()}
        assert id1 not in ids
        assert id2 in ids

        # Range: max only (<= 2.0 matches only id1=1.5)
        result = httpx.get(f"{URL}/api/v1/{entity_type}", params={f"extra.{field_key}": ":2.0"})
        assert_httpx_success(result)
        ids = {item["id"] for item in result.json()}
        assert id1 in ids
        assert id2 not in ids

        # Range: both bounds (1.0 <= x <= 2.0 matches only id1=1.5)
        result = httpx.get(f"{URL}/api/v1/{entity_type}", params={f"extra.{field_key}": "1.0:2.0"})
        assert_httpx_success(result)
        ids = {item["id"] for item in result.json()}
        assert id1 in ids
        assert id2 not in ids

        # Sort ascending (1.5 before 2.5)
        result = httpx.get(f"{URL}/api/v1/{entity_type}", params={"sort": f"extra.{field_key}:asc"})
        assert_httpx_success(result)
        ordered = [item for item in result.json() if item["id"] in (id1, id2)]
        assert len(ordered) == 2
        assert ordered[0]["id"] == id1
        assert ordered[1]["id"] == id2

        # Sort descending
        result = httpx.get(f"{URL}/api/v1/{entity_type}", params={"sort": f"extra.{field_key}:desc"})
        assert_httpx_success(result)
        ordered = [item for item in result.json() if item["id"] in (id1, id2)]
        assert len(ordered) == 2
        assert ordered[0]["id"] == id2
        assert ordered[1]["id"] == id1
    finally:
        httpx.delete(f"{URL}/api/v1/field/{entity_type}/{field_key}").raise_for_status()
        httpx.delete(f"{URL}/api/v1/{entity_type}/{id1}").raise_for_status()
        httpx.delete(f"{URL}/api/v1/{entity_type}/{id2}").raise_for_status()


@pytest.mark.asyncio
@pytest.mark.parametrize("entity_type", ["spool", "filament", "vendor"])
async def test_integer_range_filter_and_sort(entity_type: str, random_filament: dict[str, Any]) -> None:
    """Test filter and sort by a custom integer_range field for all entity types."""
    field_key = "test_int_range_field"
    httpx.post(
        f"{URL}/api/v1/field/{entity_type}/{field_key}",
        json={"name": "Integer range field", "field_type": "integer_range"},
    ).raise_for_status()
    # id1=[100,200], id2=[300,400]
    id1 = _create_entity(entity_type, {field_key: json.dumps([100, 200])}, random_filament)
    id2 = _create_entity(entity_type, {field_key: json.dumps([300, 400])}, random_filament)
    try:
        # Both bounds: stored_min>=100 AND stored_max<=200 matches only id1
        result = httpx.get(f"{URL}/api/v1/{entity_type}", params={f"extra.{field_key}": "100:200"})
        assert_httpx_success(result)
        ids = {item["id"] for item in result.json()}
        assert id1 in ids
        assert id2 not in ids

        # Min only: stored_min>=200 matches only id2 (300>=200; 100<200)
        result = httpx.get(f"{URL}/api/v1/{entity_type}", params={f"extra.{field_key}": "200:"})
        assert_httpx_success(result)
        ids = {item["id"] for item in result.json()}
        assert id1 not in ids
        assert id2 in ids

        # Max only: stored_max<=300 matches only id1 (200<=300; 400>300)
        result = httpx.get(f"{URL}/api/v1/{entity_type}", params={f"extra.{field_key}": ":300"})
        assert_httpx_success(result)
        ids = {item["id"] for item in result.json()}
        assert id1 in ids
        assert id2 not in ids

        # Sort ascending by stored_min (100 before 300)
        result = httpx.get(f"{URL}/api/v1/{entity_type}", params={"sort": f"extra.{field_key}:asc"})
        assert_httpx_success(result)
        ordered = [item for item in result.json() if item["id"] in (id1, id2)]
        assert len(ordered) == 2
        assert ordered[0]["id"] == id1
        assert ordered[1]["id"] == id2

        # Sort descending
        result = httpx.get(f"{URL}/api/v1/{entity_type}", params={"sort": f"extra.{field_key}:desc"})
        assert_httpx_success(result)
        ordered = [item for item in result.json() if item["id"] in (id1, id2)]
        assert len(ordered) == 2
        assert ordered[0]["id"] == id2
        assert ordered[1]["id"] == id1
    finally:
        httpx.delete(f"{URL}/api/v1/field/{entity_type}/{field_key}").raise_for_status()
        httpx.delete(f"{URL}/api/v1/{entity_type}/{id1}").raise_for_status()
        httpx.delete(f"{URL}/api/v1/{entity_type}/{id2}").raise_for_status()


@pytest.mark.asyncio
@pytest.mark.parametrize("entity_type", ["spool", "filament", "vendor"])
async def test_float_range_filter_and_sort(entity_type: str, random_filament: dict[str, Any]) -> None:
    """Test filter and sort by a custom float_range field for all entity types."""
    field_key = "test_float_range_field"
    httpx.post(
        f"{URL}/api/v1/field/{entity_type}/{field_key}",
        json={"name": "Float range field", "field_type": "float_range"},
    ).raise_for_status()
    # id1=[1.5,2.5], id2=[3.5,4.5]
    id1 = _create_entity(entity_type, {field_key: json.dumps([1.5, 2.5])}, random_filament)
    id2 = _create_entity(entity_type, {field_key: json.dumps([3.5, 4.5])}, random_filament)
    try:
        # Both bounds: stored_min>=1.5 AND stored_max<=2.5 matches only id1
        result = httpx.get(f"{URL}/api/v1/{entity_type}", params={f"extra.{field_key}": "1.5:2.5"})
        assert_httpx_success(result)
        ids = {item["id"] for item in result.json()}
        assert id1 in ids
        assert id2 not in ids

        # Min only: stored_min>=2.5 matches only id2 (3.5>=2.5; 1.5<2.5)
        result = httpx.get(f"{URL}/api/v1/{entity_type}", params={f"extra.{field_key}": "2.5:"})
        assert_httpx_success(result)
        ids = {item["id"] for item in result.json()}
        assert id1 not in ids
        assert id2 in ids

        # Max only: stored_max<=3.5 matches only id1 (2.5<=3.5; 4.5>3.5)
        result = httpx.get(f"{URL}/api/v1/{entity_type}", params={f"extra.{field_key}": ":3.5"})
        assert_httpx_success(result)
        ids = {item["id"] for item in result.json()}
        assert id1 in ids
        assert id2 not in ids

        # Sort ascending by stored_min (1.5 before 3.5)
        result = httpx.get(f"{URL}/api/v1/{entity_type}", params={"sort": f"extra.{field_key}:asc"})
        assert_httpx_success(result)
        ordered = [item for item in result.json() if item["id"] in (id1, id2)]
        assert len(ordered) == 2
        assert ordered[0]["id"] == id1
        assert ordered[1]["id"] == id2

        # Sort descending
        result = httpx.get(f"{URL}/api/v1/{entity_type}", params={"sort": f"extra.{field_key}:desc"})
        assert_httpx_success(result)
        ordered = [item for item in result.json() if item["id"] in (id1, id2)]
        assert len(ordered) == 2
        assert ordered[0]["id"] == id2
        assert ordered[1]["id"] == id1
    finally:
        httpx.delete(f"{URL}/api/v1/field/{entity_type}/{field_key}").raise_for_status()
        httpx.delete(f"{URL}/api/v1/{entity_type}/{id1}").raise_for_status()
        httpx.delete(f"{URL}/api/v1/{entity_type}/{id2}").raise_for_status()


# ---------------------------------------------------------------------------
# Date fields (all entity types)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.parametrize("entity_type", ["spool", "filament", "vendor"])
async def test_datetime_filter_and_sort(entity_type: str, random_filament: dict[str, Any]) -> None:
    """Test filter and sort by a custom datetime field for all entity types."""
    field_key = "test_dt_field"
    httpx.post(
        f"{URL}/api/v1/field/{entity_type}/{field_key}",
        json={"name": "Datetime field", "field_type": "datetime"},
    ).raise_for_status()
    dt_early = "2023-01-01T00:00:00"
    dt_late = "2024-06-15T12:30:00"
    id1 = _create_entity(entity_type, {field_key: json.dumps(dt_early)}, random_filament)
    id2 = _create_entity(entity_type, {field_key: json.dumps(dt_late)}, random_filament)
    try:
        # Exact match: only id1
        result = httpx.get(f"{URL}/api/v1/{entity_type}", params={f"extra.{field_key}": dt_early})
        assert_httpx_success(result)
        ids = {item["id"] for item in result.json()}
        assert id1 in ids
        assert id2 not in ids

        # Range: start only (>= 2023-06-01 matches only id2=2024-06-15)
        result = httpx.get(f"{URL}/api/v1/{entity_type}", params={f"extra.{field_key}": "2023-06-01T00:00:00|"})
        assert_httpx_success(result)
        ids = {item["id"] for item in result.json()}
        assert id1 not in ids
        assert id2 in ids

        # Range: end only (<= 2023-06-01 matches only id1=2023-01-01)
        result = httpx.get(f"{URL}/api/v1/{entity_type}", params={f"extra.{field_key}": "|2023-06-01T00:00:00"})
        assert_httpx_success(result)
        ids = {item["id"] for item in result.json()}
        assert id1 in ids
        assert id2 not in ids

        # Range: both bounds (2022-01-01 to 2023-06-01 matches only id1)
        result = httpx.get(
            f"{URL}/api/v1/{entity_type}",
            params={f"extra.{field_key}": "2022-01-01T00:00:00|2023-06-01T00:00:00"},
        )
        assert_httpx_success(result)
        ids = {item["id"] for item in result.json()}
        assert id1 in ids
        assert id2 not in ids

        # Sort ascending (early before late)
        result = httpx.get(f"{URL}/api/v1/{entity_type}", params={"sort": f"extra.{field_key}:asc"})
        assert_httpx_success(result)
        ordered = [item for item in result.json() if item["id"] in (id1, id2)]
        assert len(ordered) == 2
        assert ordered[0]["id"] == id1
        assert ordered[1]["id"] == id2

        # Sort descending
        result = httpx.get(f"{URL}/api/v1/{entity_type}", params={"sort": f"extra.{field_key}:desc"})
        assert_httpx_success(result)
        ordered = [item for item in result.json() if item["id"] in (id1, id2)]
        assert len(ordered) == 2
        assert ordered[0]["id"] == id2
        assert ordered[1]["id"] == id1
    finally:
        httpx.delete(f"{URL}/api/v1/field/{entity_type}/{field_key}").raise_for_status()
        httpx.delete(f"{URL}/api/v1/{entity_type}/{id1}").raise_for_status()
        httpx.delete(f"{URL}/api/v1/{entity_type}/{id2}").raise_for_status()


# ---------------------------------------------------------------------------
# Text / boolean / choice / empty (all entity types)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.parametrize("entity_type", ["spool", "filament", "vendor"])
async def test_text_filter_and_sort(entity_type: str, random_filament: dict[str, Any]) -> None:
    """Test filter and sort by a custom text field for all entity types."""
    field_key = "test_text_field"
    httpx.post(
        f"{URL}/api/v1/field/{entity_type}/{field_key}",
        json={"name": "Text field", "field_type": "text"},
    ).raise_for_status()
    # id1="beta", id2="alpha" so ascending order is id2 before id1
    id1 = _create_entity(entity_type, {field_key: json.dumps("beta")}, random_filament)
    id2 = _create_entity(entity_type, {field_key: json.dumps("alpha")}, random_filament)
    try:
        # Substring filter: "beta" matches only id1
        result = httpx.get(f"{URL}/api/v1/{entity_type}", params={f"extra.{field_key}": "beta"})
        assert_httpx_success(result)
        ids = {item["id"] for item in result.json()}
        assert id1 in ids
        assert id2 not in ids

        # Exact-match filter (double-quoted)
        result = httpx.get(f"{URL}/api/v1/{entity_type}", params={f"extra.{field_key}": '"beta"'})
        assert_httpx_success(result)
        ids = {item["id"] for item in result.json()}
        assert id1 in ids
        assert id2 not in ids

        # Multi-value OR: both
        result = httpx.get(f"{URL}/api/v1/{entity_type}", params={f"extra.{field_key}": "beta,alpha"})
        assert_httpx_success(result)
        ids = {item["id"] for item in result.json()}
        assert id1 in ids
        assert id2 in ids

        # Sort ascending: alpha before beta
        result = httpx.get(f"{URL}/api/v1/{entity_type}", params={"sort": f"extra.{field_key}:asc"})
        assert_httpx_success(result)
        ordered = [item for item in result.json() if item["id"] in (id1, id2)]
        assert len(ordered) == 2
        assert ordered[0]["id"] == id2  # alpha first
        assert ordered[1]["id"] == id1  # beta second

        # Sort descending
        result = httpx.get(f"{URL}/api/v1/{entity_type}", params={"sort": f"extra.{field_key}:desc"})
        assert_httpx_success(result)
        ordered = [item for item in result.json() if item["id"] in (id1, id2)]
        assert len(ordered) == 2
        assert ordered[0]["id"] == id1  # beta first
        assert ordered[1]["id"] == id2  # alpha second
    finally:
        httpx.delete(f"{URL}/api/v1/field/{entity_type}/{field_key}").raise_for_status()
        httpx.delete(f"{URL}/api/v1/{entity_type}/{id1}").raise_for_status()
        httpx.delete(f"{URL}/api/v1/{entity_type}/{id2}").raise_for_status()


@pytest.mark.asyncio
@pytest.mark.parametrize("entity_type", ["spool", "filament", "vendor"])
async def test_boolean_filter_and_sort(entity_type: str, random_filament: dict[str, Any]) -> None:
    """Test filter and sort by a custom boolean field for all entity types."""
    field_key = "test_bool_field"
    httpx.post(
        f"{URL}/api/v1/field/{entity_type}/{field_key}",
        json={"name": "Boolean field", "field_type": "boolean"},
    ).raise_for_status()
    id_true = _create_entity(entity_type, {field_key: json.dumps(bool(1))}, random_filament)
    id_false = _create_entity(entity_type, {field_key: json.dumps(bool(0))}, random_filament)
    try:
        # Filter true
        result = httpx.get(f"{URL}/api/v1/{entity_type}", params={f"extra.{field_key}": "true"})
        assert_httpx_success(result)
        ids = {item["id"] for item in result.json()}
        assert id_true in ids
        assert id_false not in ids

        # Filter false
        result = httpx.get(f"{URL}/api/v1/{entity_type}", params={f"extra.{field_key}": "false"})
        assert_httpx_success(result)
        ids = {item["id"] for item in result.json()}
        assert id_false in ids
        assert id_true not in ids

        # Sort ascending: false before true
        result = httpx.get(f"{URL}/api/v1/{entity_type}", params={"sort": f"extra.{field_key}:asc"})
        assert_httpx_success(result)
        ordered = [item for item in result.json() if item["id"] in (id_true, id_false)]
        assert len(ordered) == 2
        assert ordered[0]["id"] == id_false
        assert ordered[1]["id"] == id_true

        # Sort descending: true before false
        result = httpx.get(f"{URL}/api/v1/{entity_type}", params={"sort": f"extra.{field_key}:desc"})
        assert_httpx_success(result)
        ordered = [item for item in result.json() if item["id"] in (id_true, id_false)]
        assert len(ordered) == 2
        assert ordered[0]["id"] == id_true
        assert ordered[1]["id"] == id_false
    finally:
        httpx.delete(f"{URL}/api/v1/field/{entity_type}/{field_key}").raise_for_status()
        httpx.delete(f"{URL}/api/v1/{entity_type}/{id_true}").raise_for_status()
        httpx.delete(f"{URL}/api/v1/{entity_type}/{id_false}").raise_for_status()


@pytest.mark.asyncio
@pytest.mark.parametrize("entity_type", ["spool", "filament", "vendor"])
async def test_single_choice_filter_and_sort(entity_type: str, random_filament: dict[str, Any]) -> None:
    """Test filter and sort by a single-choice custom field for all entity types."""
    field_key = "test_choice_field"
    httpx.post(
        f"{URL}/api/v1/field/{entity_type}/{field_key}",
        json={
            "name": "Choice field",
            "field_type": "choice",
            "choices": ["OptionA", "OptionB"],
            "multi_choice": False,
        },
    ).raise_for_status()
    id1 = _create_entity(entity_type, {field_key: json.dumps("OptionA")}, random_filament)
    id2 = _create_entity(entity_type, {field_key: json.dumps("OptionB")}, random_filament)
    try:
        # Single value: only id1
        result = httpx.get(f"{URL}/api/v1/{entity_type}", params={f"extra.{field_key}": "OptionA"})
        assert_httpx_success(result)
        ids = {item["id"] for item in result.json()}
        assert id1 in ids
        assert id2 not in ids

        # Multi-value OR: both
        result = httpx.get(f"{URL}/api/v1/{entity_type}", params={f"extra.{field_key}": "OptionA,OptionB"})
        assert_httpx_success(result)
        ids = {item["id"] for item in result.json()}
        assert id1 in ids
        assert id2 in ids

        # Sort ascending: OptionA before OptionB
        result = httpx.get(f"{URL}/api/v1/{entity_type}", params={"sort": f"extra.{field_key}:asc"})
        assert_httpx_success(result)
        ordered = [item for item in result.json() if item["id"] in (id1, id2)]
        assert len(ordered) == 2
        assert ordered[0]["id"] == id1  # OptionA first
        assert ordered[1]["id"] == id2  # OptionB second

        # Sort descending
        result = httpx.get(f"{URL}/api/v1/{entity_type}", params={"sort": f"extra.{field_key}:desc"})
        assert_httpx_success(result)
        ordered = [item for item in result.json() if item["id"] in (id1, id2)]
        assert len(ordered) == 2
        assert ordered[0]["id"] == id2  # OptionB first
        assert ordered[1]["id"] == id1  # OptionA second
    finally:
        httpx.delete(f"{URL}/api/v1/field/{entity_type}/{field_key}").raise_for_status()
        httpx.delete(f"{URL}/api/v1/{entity_type}/{id1}").raise_for_status()
        httpx.delete(f"{URL}/api/v1/{entity_type}/{id2}").raise_for_status()


@pytest.mark.asyncio
@pytest.mark.parametrize("entity_type", ["spool", "filament", "vendor"])
async def test_multi_choice_filter(entity_type: str, random_filament: dict[str, Any]) -> None:
    """Test filter by a multi-choice custom field for all entity types."""
    field_key = "test_multi_field"
    httpx.post(
        f"{URL}/api/v1/field/{entity_type}/{field_key}",
        json={
            "name": "Multi-choice field",
            "field_type": "choice",
            "choices": ["A", "B", "C"],
            "multi_choice": True,
        },
    ).raise_for_status()
    # id1 has [A, B], id2 has [C]
    id1 = _create_entity(entity_type, {field_key: json.dumps(["A", "B"])}, random_filament)
    id2 = _create_entity(entity_type, {field_key: json.dumps(["C"])}, random_filament)
    try:
        # Filter by A: only id1
        result = httpx.get(f"{URL}/api/v1/{entity_type}", params={f"extra.{field_key}": "A"})
        assert_httpx_success(result)
        ids = {item["id"] for item in result.json()}
        assert id1 in ids
        assert id2 not in ids

        # Filter by C: only id2
        result = httpx.get(f"{URL}/api/v1/{entity_type}", params={f"extra.{field_key}": "C"})
        assert_httpx_success(result)
        ids = {item["id"] for item in result.json()}
        assert id2 in ids
        assert id1 not in ids

        # Multi-value OR (A,C): both
        result = httpx.get(f"{URL}/api/v1/{entity_type}", params={f"extra.{field_key}": "A,C"})
        assert_httpx_success(result)
        ids = {item["id"] for item in result.json()}
        assert id1 in ids
        assert id2 in ids
    finally:
        httpx.delete(f"{URL}/api/v1/field/{entity_type}/{field_key}").raise_for_status()
        httpx.delete(f"{URL}/api/v1/{entity_type}/{id1}").raise_for_status()
        httpx.delete(f"{URL}/api/v1/{entity_type}/{id2}").raise_for_status()


@pytest.mark.asyncio
@pytest.mark.parametrize("entity_type", ["spool", "filament", "vendor"])
async def test_empty_filter(entity_type: str, random_filament: dict[str, Any]) -> None:
    """Test the empty-string filter returns only items with no value set for a custom field."""
    field_key = "test_optional_field"
    httpx.post(
        f"{URL}/api/v1/field/{entity_type}/{field_key}",
        json={"name": "Optional field", "field_type": "text"},
    ).raise_for_status()
    id1 = _create_entity(entity_type, {field_key: json.dumps("has_value")}, random_filament)
    id2 = _create_entity(entity_type, {}, random_filament)
    try:
        # Empty filter: only id2 (field not set)
        result = httpx.get(f"{URL}/api/v1/{entity_type}", params={f"extra.{field_key}": ""})
        assert_httpx_success(result)
        ids = {item["id"] for item in result.json()}
        assert id2 in ids
        assert id1 not in ids

        # Value filter: only id1
        result = httpx.get(f"{URL}/api/v1/{entity_type}", params={f"extra.{field_key}": "has_value"})
        assert_httpx_success(result)
        ids = {item["id"] for item in result.json()}
        assert id1 in ids
        assert id2 not in ids
    finally:
        httpx.delete(f"{URL}/api/v1/field/{entity_type}/{field_key}").raise_for_status()
        httpx.delete(f"{URL}/api/v1/{entity_type}/{id1}").raise_for_status()
        httpx.delete(f"{URL}/api/v1/{entity_type}/{id2}").raise_for_status()


# ---------------------------------------------------------------------------
# Invalid filter values → 400 (all entity types)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.parametrize("entity_type", ["spool", "filament", "vendor"])
async def test_invalid_integer_filter_returns_400(entity_type: str) -> None:
    """Invalid integer custom-field filters should fail with a 400 error."""
    field_key = "int_field_400"
    httpx.post(
        f"{URL}/api/v1/field/{entity_type}/{field_key}",
        json={"name": "Integer 400", "field_type": "integer"},
    ).raise_for_status()
    try:
        result = httpx.get(f"{URL}/api/v1/{entity_type}", params={f"extra.{field_key}": "abc"})
        assert result.status_code == 400
        assert "Invalid integer filter value" in result.json()["message"]
    finally:
        httpx.delete(f"{URL}/api/v1/field/{entity_type}/{field_key}").raise_for_status()


@pytest.mark.asyncio
@pytest.mark.parametrize("entity_type", ["spool", "filament", "vendor"])
async def test_invalid_boolean_filter_returns_400(entity_type: str) -> None:
    """Invalid boolean custom-field filters should fail with a 400 error."""
    field_key = "bool_field_400"
    httpx.post(
        f"{URL}/api/v1/field/{entity_type}/{field_key}",
        json={"name": "Boolean 400", "field_type": "boolean"},
    ).raise_for_status()
    try:
        result = httpx.get(f"{URL}/api/v1/{entity_type}", params={f"extra.{field_key}": "maybe"})
        assert result.status_code == 400
        assert "Invalid boolean filter value" in result.json()["message"]

        result = httpx.get(f"{URL}/api/v1/{entity_type}", params={f"extra.{field_key}": "yes"})
        assert result.status_code == 400
        assert "Invalid boolean filter value" in result.json()["message"]
    finally:
        httpx.delete(f"{URL}/api/v1/field/{entity_type}/{field_key}").raise_for_status()


@pytest.mark.asyncio
@pytest.mark.parametrize("entity_type", ["spool", "filament", "vendor"])
async def test_invalid_float_filter_returns_400(entity_type: str) -> None:
    """Invalid float custom-field filters should fail with a 400 error."""
    field_key = "float_field_400"
    httpx.post(
        f"{URL}/api/v1/field/{entity_type}/{field_key}",
        json={"name": "Float 400", "field_type": "float"},
    ).raise_for_status()
    try:
        result = httpx.get(f"{URL}/api/v1/{entity_type}", params={f"extra.{field_key}": "notafloat"})
        assert result.status_code == 400
        assert "Invalid float filter value" in result.json()["message"]
    finally:
        httpx.delete(f"{URL}/api/v1/field/{entity_type}/{field_key}").raise_for_status()


@pytest.mark.asyncio
@pytest.mark.parametrize("entity_type", ["spool", "filament", "vendor"])
async def test_invalid_integer_range_filter_returns_400(entity_type: str) -> None:
    """Invalid integer_range custom-field filters should fail with a 400 error."""
    field_key = "int_range_400"
    httpx.post(
        f"{URL}/api/v1/field/{entity_type}/{field_key}",
        json={"name": "Integer range 400", "field_type": "integer_range"},
    ).raise_for_status()
    try:
        # Missing colon separator
        result = httpx.get(f"{URL}/api/v1/{entity_type}", params={f"extra.{field_key}": "100"})
        assert result.status_code == 400
        assert "Invalid range filter value" in result.json()["message"]

        # Non-numeric min value
        result = httpx.get(f"{URL}/api/v1/{entity_type}", params={f"extra.{field_key}": "abc:200"})
        assert result.status_code == 400
        assert "range filter value" in result.json()["message"]
    finally:
        httpx.delete(f"{URL}/api/v1/field/{entity_type}/{field_key}").raise_for_status()


@pytest.mark.asyncio
@pytest.mark.parametrize("entity_type", ["spool", "filament", "vendor"])
async def test_invalid_float_range_filter_returns_400(entity_type: str) -> None:
    """Invalid float_range custom-field filters should fail with a 400 error."""
    field_key = "float_range_400"
    httpx.post(
        f"{URL}/api/v1/field/{entity_type}/{field_key}",
        json={"name": "Float range 400", "field_type": "float_range"},
    ).raise_for_status()
    try:
        # Missing colon separator
        result = httpx.get(f"{URL}/api/v1/{entity_type}", params={f"extra.{field_key}": "1.5"})
        assert result.status_code == 400
        assert "Invalid range filter value" in result.json()["message"]

        # Non-numeric min value
        result = httpx.get(f"{URL}/api/v1/{entity_type}", params={f"extra.{field_key}": "notanum:2.5"})
        assert result.status_code == 400
        assert "range filter value" in result.json()["message"]
    finally:
        httpx.delete(f"{URL}/api/v1/field/{entity_type}/{field_key}").raise_for_status()


# ---------------------------------------------------------------------------
# Filter composition - multiple extra fields, extra + built-in, filter + sort
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.parametrize("entity_type", ["spool", "filament", "vendor"])
async def test_multiple_extra_field_filters_are_anded(entity_type: str, random_filament: dict[str, Any]) -> None:
    """Filtering on two custom fields at once should AND the conditions together."""
    text_key = "combo_text_field"
    int_key = "combo_int_field"
    httpx.post(
        f"{URL}/api/v1/field/{entity_type}/{text_key}",
        json={"name": "Combo text", "field_type": "text"},
    ).raise_for_status()
    httpx.post(
        f"{URL}/api/v1/field/{entity_type}/{int_key}",
        json={"name": "Combo int", "field_type": "integer"},
    ).raise_for_status()
    # id_match satisfies both; the others satisfy only one each.
    id_match = _create_entity(entity_type, {text_key: json.dumps("alpha"), int_key: json.dumps(5)}, random_filament)
    id_text_only = _create_entity(
        entity_type, {text_key: json.dumps("alpha"), int_key: json.dumps(99)}, random_filament
    )
    id_int_only = _create_entity(entity_type, {text_key: json.dumps("beta"), int_key: json.dumps(5)}, random_filament)
    try:
        result = httpx.get(
            f"{URL}/api/v1/{entity_type}",
            params={f"extra.{text_key}": '"alpha"', f"extra.{int_key}": "5"},
        )
        assert_httpx_success(result)
        ids = {item["id"] for item in result.json()}
        assert id_match in ids
        assert id_text_only not in ids
        assert id_int_only not in ids
    finally:
        httpx.delete(f"{URL}/api/v1/field/{entity_type}/{text_key}").raise_for_status()
        httpx.delete(f"{URL}/api/v1/field/{entity_type}/{int_key}").raise_for_status()
        for eid in (id_match, id_text_only, id_int_only):
            httpx.delete(f"{URL}/api/v1/{entity_type}/{eid}").raise_for_status()


@pytest.mark.asyncio
async def test_extra_filter_combined_with_builtin_filter(random_filament: dict[str, Any]) -> None:
    """An extra-field filter should compose (AND) with a built-in filter (filament.material)."""
    field_key = "builtin_combo_field"
    httpx.post(
        f"{URL}/api/v1/field/filament/{field_key}",
        json={"name": "Builtin combo", "field_type": "text"},
    ).raise_for_status()
    vendor_id = random_filament["vendor"]["id"]

    def _make_filament(material: str, extra_value: str) -> int:
        result = httpx.post(
            f"{URL}/api/v1/filament",
            json={
                "vendor_id": vendor_id,
                "name": f"Test-{uuid.uuid4().hex[:8]}",
                "material": material,
                "density": 1.24,
                "diameter": 1.75,
                "extra": {field_key: json.dumps(extra_value)},
            },
        )
        result.raise_for_status()
        return result.json()["id"]

    mat = f"PLA-{uuid.uuid4().hex[:8]}"
    id_match = _make_filament(mat, "wanted")
    id_wrong_material = _make_filament("PETG", "wanted")
    id_wrong_extra = _make_filament(mat, "other")
    try:
        result = httpx.get(
            f"{URL}/api/v1/filament",
            params={"material": mat, f"extra.{field_key}": '"wanted"'},
        )
        assert_httpx_success(result)
        ids = {item["id"] for item in result.json()}
        assert id_match in ids
        assert id_wrong_material not in ids
        assert id_wrong_extra not in ids
    finally:
        httpx.delete(f"{URL}/api/v1/field/filament/{field_key}").raise_for_status()
        for fid in (id_match, id_wrong_material, id_wrong_extra):
            httpx.delete(f"{URL}/api/v1/filament/{fid}").raise_for_status()


@pytest.mark.asyncio
@pytest.mark.parametrize("entity_type", ["spool", "filament", "vendor"])
async def test_filter_on_one_field_sort_on_another(entity_type: str, random_filament: dict[str, Any]) -> None:
    """Filter on one custom field while sorting on a different custom field."""
    filter_key = "fs_filter_field"
    sort_key = "fs_sort_field"
    httpx.post(
        f"{URL}/api/v1/field/{entity_type}/{filter_key}",
        json={"name": "FS filter", "field_type": "text"},
    ).raise_for_status()
    httpx.post(
        f"{URL}/api/v1/field/{entity_type}/{sort_key}",
        json={"name": "FS sort", "field_type": "integer"},
    ).raise_for_status()
    # Both included have group="g"; sort by number should put id_low before id_high.
    id_high = _create_entity(entity_type, {filter_key: json.dumps("g"), sort_key: json.dumps(20)}, random_filament)
    id_low = _create_entity(entity_type, {filter_key: json.dumps("g"), sort_key: json.dumps(10)}, random_filament)
    id_other = _create_entity(entity_type, {filter_key: json.dumps("h"), sort_key: json.dumps(1)}, random_filament)
    try:
        result = httpx.get(
            f"{URL}/api/v1/{entity_type}",
            params={f"extra.{filter_key}": '"g"', "sort": f"extra.{sort_key}:asc"},
        )
        assert_httpx_success(result)
        ordered = [item["id"] for item in result.json() if item["id"] in (id_high, id_low, id_other)]
        assert ordered == [id_low, id_high]
        assert id_other not in ordered
    finally:
        httpx.delete(f"{URL}/api/v1/field/{entity_type}/{filter_key}").raise_for_status()
        httpx.delete(f"{URL}/api/v1/field/{entity_type}/{sort_key}").raise_for_status()
        for eid in (id_high, id_low, id_other):
            httpx.delete(f"{URL}/api/v1/{entity_type}/{eid}").raise_for_status()


@pytest.mark.asyncio
@pytest.mark.parametrize("entity_type", ["spool", "filament", "vendor"])
async def test_pagination_total_count_with_extra_filter(entity_type: str, random_filament: dict[str, Any]) -> None:
    """x-total-count reflects the filtered set, and limit/offset page within it."""
    field_key = "paginate_field"
    unique = uuid.uuid4().hex[:8]
    httpx.post(
        f"{URL}/api/v1/field/{entity_type}/{field_key}",
        json={"name": "Paginate", "field_type": "text"},
    ).raise_for_status()
    # Three entities share a unique value so only these three match the filter.
    ids = [_create_entity(entity_type, {field_key: json.dumps(unique)}, random_filament) for _ in range(3)]
    try:
        result = httpx.get(
            f"{URL}/api/v1/{entity_type}",
            params={f"extra.{field_key}": f'"{unique}"', "limit": 2, "offset": 0},
        )
        assert_httpx_success(result)
        assert result.headers["x-total-count"] == "3"
        assert len(result.json()) == 2

        # Second page returns the remaining item.
        result = httpx.get(
            f"{URL}/api/v1/{entity_type}",
            params={f"extra.{field_key}": f'"{unique}"', "limit": 2, "offset": 2},
        )
        assert_httpx_success(result)
        assert result.headers["x-total-count"] == "3"
        assert len(result.json()) == 1
    finally:
        httpx.delete(f"{URL}/api/v1/field/{entity_type}/{field_key}").raise_for_status()
        for eid in ids:
            httpx.delete(f"{URL}/api/v1/{entity_type}/{eid}").raise_for_status()


@pytest.mark.asyncio
@pytest.mark.parametrize("entity_type", ["spool", "filament", "vendor"])
async def test_unknown_extra_field_key_is_ignored(entity_type: str, random_filament: dict[str, Any]) -> None:
    """Filtering/sorting on an undefined custom field is ignored, not a 400."""
    id1 = _create_entity(entity_type, {}, random_filament)
    try:
        result = httpx.get(f"{URL}/api/v1/{entity_type}", params={"extra.does_not_exist": "whatever"})
        assert_httpx_success(result)
        ids = {item["id"] for item in result.json()}
        assert id1 in ids  # filter ignored -> entity still returned

        result = httpx.get(f"{URL}/api/v1/{entity_type}", params={"sort": "extra.does_not_exist:asc"})
        assert_httpx_success(result)
    finally:
        httpx.delete(f"{URL}/api/v1/{entity_type}/{id1}").raise_for_status()


# ---------------------------------------------------------------------------
# Text field edge cases - case-insensitivity, substring, non-ASCII
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.parametrize("entity_type", ["spool", "filament", "vendor"])
async def test_text_filter_case_insensitive_and_partial(entity_type: str, random_filament: dict[str, Any]) -> None:
    """Text substring filtering is case-insensitive and matches partial substrings."""
    field_key = "ci_text_field"
    httpx.post(
        f"{URL}/api/v1/field/{entity_type}/{field_key}",
        json={"name": "CI text", "field_type": "text"},
    ).raise_for_status()
    id1 = _create_entity(entity_type, {field_key: json.dumps("HelloWorld")}, random_filament)
    try:
        # Partial + lowercase substring of a mixed-case value.
        result = httpx.get(f"{URL}/api/v1/{entity_type}", params={f"extra.{field_key}": "elloworl"})
        assert_httpx_success(result)
        assert id1 in {item["id"] for item in result.json()}

        # Fully uppercased query still matches (ilike).
        result = httpx.get(f"{URL}/api/v1/{entity_type}", params={f"extra.{field_key}": "HELLOWORLD"})
        assert_httpx_success(result)
        assert id1 in {item["id"] for item in result.json()}
    finally:
        httpx.delete(f"{URL}/api/v1/field/{entity_type}/{field_key}").raise_for_status()
        httpx.delete(f"{URL}/api/v1/{entity_type}/{id1}").raise_for_status()


@pytest.mark.asyncio
@pytest.mark.parametrize("entity_type", ["spool", "filament", "vendor"])
async def test_text_filter_non_ascii(entity_type: str, random_filament: dict[str, Any]) -> None:
    """Text filtering works with non-ASCII values (encoding canary)."""
    field_key = "unicode_text_field"
    httpx.post(
        f"{URL}/api/v1/field/{entity_type}/{field_key}",
        json={"name": "Unicode text", "field_type": "text"},
    ).raise_for_status()
    # Store the value unescaped, the way the JS frontend's JSON.stringify does (not Python's
    # default ensure_ascii=True, which would persist literal \uXXXX escapes).
    id1 = _create_entity(entity_type, {field_key: json.dumps("Café åäö 日本", ensure_ascii=False)}, random_filament)
    id2 = _create_entity(entity_type, {field_key: json.dumps("Grün", ensure_ascii=False)}, random_filament)
    try:
        result = httpx.get(f"{URL}/api/v1/{entity_type}", params={f"extra.{field_key}": "åäö"})
        assert_httpx_success(result)
        ids = {item["id"] for item in result.json()}
        assert id1 in ids
        assert id2 not in ids

        result = httpx.get(f"{URL}/api/v1/{entity_type}", params={f"extra.{field_key}": "日本"})
        assert_httpx_success(result)
        assert id1 in {item["id"] for item in result.json()}

        # Exact match (double-quoted) on a non-ASCII value.
        result = httpx.get(f"{URL}/api/v1/{entity_type}", params={f"extra.{field_key}": '"Café åäö 日本"'})
        assert_httpx_success(result)
        ids = {item["id"] for item in result.json()}
        assert id1 in ids
        assert id2 not in ids
    finally:
        httpx.delete(f"{URL}/api/v1/field/{entity_type}/{field_key}").raise_for_status()
        httpx.delete(f"{URL}/api/v1/{entity_type}/{id1}").raise_for_status()
        httpx.delete(f"{URL}/api/v1/{entity_type}/{id2}").raise_for_status()


@pytest.mark.asyncio
@pytest.mark.parametrize("entity_type", ["spool", "filament", "vendor"])
async def test_single_choice_filter_non_ascii(entity_type: str, random_filament: dict[str, Any]) -> None:
    """Single-choice equality works with non-ASCII choice labels (frontend-stored unescaped)."""
    field_key = "unicode_choice_field"
    httpx.post(
        f"{URL}/api/v1/field/{entity_type}/{field_key}",
        json={
            "name": "Unicode choice",
            "field_type": "choice",
            "choices": ["Röd", "Blå"],
            "multi_choice": False,
        },
    ).raise_for_status()
    id_rod = _create_entity(entity_type, {field_key: json.dumps("Röd", ensure_ascii=False)}, random_filament)
    id_bla = _create_entity(entity_type, {field_key: json.dumps("Blå", ensure_ascii=False)}, random_filament)
    try:
        result = httpx.get(f"{URL}/api/v1/{entity_type}", params={f"extra.{field_key}": "Röd"})
        assert_httpx_success(result)
        ids = {item["id"] for item in result.json()}
        assert id_rod in ids
        assert id_bla not in ids
    finally:
        httpx.delete(f"{URL}/api/v1/field/{entity_type}/{field_key}").raise_for_status()
        httpx.delete(f"{URL}/api/v1/{entity_type}/{id_rod}").raise_for_status()
        httpx.delete(f"{URL}/api/v1/{entity_type}/{id_bla}").raise_for_status()


# ---------------------------------------------------------------------------
# Numeric / boolean / choice edge cases
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.parametrize("entity_type", ["spool", "filament", "vendor"])
async def test_integer_multi_value_or(entity_type: str, random_filament: dict[str, Any]) -> None:
    """A comma-separated integer filter matches any of the listed exact values (OR)."""
    field_key = "int_or_field"
    httpx.post(
        f"{URL}/api/v1/field/{entity_type}/{field_key}",
        json={"name": "Int OR", "field_type": "integer"},
    ).raise_for_status()
    id100 = _create_entity(entity_type, {field_key: json.dumps(100)}, random_filament)
    id200 = _create_entity(entity_type, {field_key: json.dumps(200)}, random_filament)
    id300 = _create_entity(entity_type, {field_key: json.dumps(300)}, random_filament)
    try:
        result = httpx.get(f"{URL}/api/v1/{entity_type}", params={f"extra.{field_key}": "100,300"})
        assert_httpx_success(result)
        ids = {item["id"] for item in result.json()}
        assert id100 in ids
        assert id300 in ids
        assert id200 not in ids
    finally:
        httpx.delete(f"{URL}/api/v1/field/{entity_type}/{field_key}").raise_for_status()
        for eid in (id100, id200, id300):
            httpx.delete(f"{URL}/api/v1/{entity_type}/{eid}").raise_for_status()


@pytest.mark.asyncio
@pytest.mark.parametrize("entity_type", ["spool", "filament", "vendor"])
async def test_float_exact_match_against_int_typed_storage(entity_type: str, random_filament: dict[str, Any]) -> None:
    """A float field stored as an integer JSON value still matches an equivalent float filter."""
    field_key = "float_intstore_field"
    httpx.post(
        f"{URL}/api/v1/field/{entity_type}/{field_key}",
        json={"name": "Float intstore", "field_type": "float"},
    ).raise_for_status()
    # json.dumps(2) -> "2" (no decimal); json.dumps(3) -> "3".
    id2 = _create_entity(entity_type, {field_key: json.dumps(2)}, random_filament)
    id3 = _create_entity(entity_type, {field_key: json.dumps(3)}, random_filament)
    try:
        for query in ("2.0", "2", "2.00"):
            result = httpx.get(f"{URL}/api/v1/{entity_type}", params={f"extra.{field_key}": query})
            assert_httpx_success(result)
            ids = {item["id"] for item in result.json()}
            assert id2 in ids, f"expected match for filter {query!r}"
            assert id3 not in ids
    finally:
        httpx.delete(f"{URL}/api/v1/field/{entity_type}/{field_key}").raise_for_status()
        httpx.delete(f"{URL}/api/v1/{entity_type}/{id2}").raise_for_status()
        httpx.delete(f"{URL}/api/v1/{entity_type}/{id3}").raise_for_status()


@pytest.mark.asyncio
@pytest.mark.parametrize("entity_type", ["spool", "filament", "vendor"])
async def test_boolean_empty_filter_matches_false_and_unset(entity_type: str, random_filament: dict[str, Any]) -> None:
    """The empty filter on a boolean field returns entities that are false or have no value set."""
    field_key = "bool_empty_field"
    httpx.post(
        f"{URL}/api/v1/field/{entity_type}/{field_key}",
        json={"name": "Bool empty", "field_type": "boolean"},
    ).raise_for_status()
    id_true = _create_entity(entity_type, {field_key: json.dumps(bool(1))}, random_filament)
    id_false = _create_entity(entity_type, {field_key: json.dumps(bool(0))}, random_filament)
    id_unset = _create_entity(entity_type, {}, random_filament)
    try:
        result = httpx.get(f"{URL}/api/v1/{entity_type}", params={f"extra.{field_key}": ""})
        assert_httpx_success(result)
        ids = {item["id"] for item in result.json()}
        assert id_false in ids
        assert id_unset in ids
        assert id_true not in ids
    finally:
        httpx.delete(f"{URL}/api/v1/field/{entity_type}/{field_key}").raise_for_status()
        for eid in (id_true, id_false, id_unset):
            httpx.delete(f"{URL}/api/v1/{entity_type}/{eid}").raise_for_status()


@pytest.mark.asyncio
@pytest.mark.parametrize("entity_type", ["spool", "filament", "vendor"])
async def test_boolean_rejects_numeric_tokens(entity_type: str) -> None:
    """Boolean filters only accept true/false; 1/0 are rejected with 400."""
    field_key = "bool_token_field"
    httpx.post(
        f"{URL}/api/v1/field/{entity_type}/{field_key}",
        json={"name": "Bool token", "field_type": "boolean"},
    ).raise_for_status()
    try:
        for token in ("1", "0"):
            result = httpx.get(f"{URL}/api/v1/{entity_type}", params={f"extra.{field_key}": token})
            assert result.status_code == 400
            assert "Invalid boolean filter value" in result.json()["message"]
    finally:
        httpx.delete(f"{URL}/api/v1/field/{entity_type}/{field_key}").raise_for_status()


@pytest.mark.asyncio
@pytest.mark.parametrize("entity_type", ["spool", "filament", "vendor"])
async def test_multi_choice_no_substring_collision(entity_type: str, random_filament: dict[str, Any]) -> None:
    """Multi-choice filtering matches whole tokens, not substrings of longer choices."""
    field_key = "multi_collision_field"
    httpx.post(
        f"{URL}/api/v1/field/{entity_type}/{field_key}",
        json={
            "name": "Multi collision",
            "field_type": "choice",
            "choices": ["Red", "Reddish"],
            "multi_choice": True,
        },
    ).raise_for_status()
    id_red = _create_entity(entity_type, {field_key: json.dumps(["Red"])}, random_filament)
    id_reddish = _create_entity(entity_type, {field_key: json.dumps(["Reddish"])}, random_filament)
    try:
        result = httpx.get(f"{URL}/api/v1/{entity_type}", params={f"extra.{field_key}": "Red"})
        assert_httpx_success(result)
        ids = {item["id"] for item in result.json()}
        assert id_red in ids
        assert id_reddish not in ids
    finally:
        httpx.delete(f"{URL}/api/v1/field/{entity_type}/{field_key}").raise_for_status()
        httpx.delete(f"{URL}/api/v1/{entity_type}/{id_red}").raise_for_status()
        httpx.delete(f"{URL}/api/v1/{entity_type}/{id_reddish}").raise_for_status()


# ---------------------------------------------------------------------------
# Empty / null bounds and additional invalid-value paths
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.parametrize("entity_type", ["spool", "filament", "vendor"])
async def test_empty_filter_on_integer_field(entity_type: str, random_filament: dict[str, Any]) -> None:
    """The empty filter on a non-text (integer) field returns only entities with no value set."""
    field_key = "int_empty_field"
    httpx.post(
        f"{URL}/api/v1/field/{entity_type}/{field_key}",
        json={"name": "Int empty", "field_type": "integer"},
    ).raise_for_status()
    id_set = _create_entity(entity_type, {field_key: json.dumps(42)}, random_filament)
    id_unset = _create_entity(entity_type, {}, random_filament)
    try:
        result = httpx.get(f"{URL}/api/v1/{entity_type}", params={f"extra.{field_key}": ""})
        assert_httpx_success(result)
        ids = {item["id"] for item in result.json()}
        assert id_unset in ids
        assert id_set not in ids
    finally:
        httpx.delete(f"{URL}/api/v1/field/{entity_type}/{field_key}").raise_for_status()
        httpx.delete(f"{URL}/api/v1/{entity_type}/{id_set}").raise_for_status()
        httpx.delete(f"{URL}/api/v1/{entity_type}/{id_unset}").raise_for_status()


@pytest.mark.asyncio
@pytest.mark.parametrize("entity_type", ["spool", "filament", "vendor"])
async def test_range_field_with_null_bound(entity_type: str, random_filament: dict[str, Any]) -> None:
    """Range fields with a null bound filter on their concrete bound and are excluded on the null side."""
    field_key = "null_range_field"
    httpx.post(
        f"{URL}/api/v1/field/{entity_type}/{field_key}",
        json={"name": "Null range", "field_type": "integer_range"},
    ).raise_for_status()
    id_open_low = _create_entity(entity_type, {field_key: json.dumps([None, 200])}, random_filament)
    id_bounded = _create_entity(entity_type, {field_key: json.dumps([100, 300])}, random_filament)
    try:
        # Max-only filter uses the concrete second element: [null,200] passes (<=250), [100,300] fails.
        result = httpx.get(f"{URL}/api/v1/{entity_type}", params={f"extra.{field_key}": ":250"})
        assert_httpx_success(result)
        ids = {item["id"] for item in result.json()}
        assert id_open_low in ids
        assert id_bounded not in ids

        # Min-only filter compares the null first element: [null,200] is excluded, [100,300] passes.
        result = httpx.get(f"{URL}/api/v1/{entity_type}", params={f"extra.{field_key}": "50:"})
        assert_httpx_success(result)
        ids = {item["id"] for item in result.json()}
        assert id_bounded in ids
        assert id_open_low not in ids
    finally:
        httpx.delete(f"{URL}/api/v1/field/{entity_type}/{field_key}").raise_for_status()
        httpx.delete(f"{URL}/api/v1/{entity_type}/{id_open_low}").raise_for_status()
        httpx.delete(f"{URL}/api/v1/{entity_type}/{id_bounded}").raise_for_status()


@pytest.mark.asyncio
@pytest.mark.parametrize("entity_type", ["spool", "filament", "vendor"])
async def test_empty_both_sides_range_returns_400(entity_type: str) -> None:
    """A range/datetime filter with both bounds empty is rejected with a 400."""
    int_range_key = "empty_range_400"
    dt_key = "empty_dt_400"
    int_key = "empty_intrange_400"
    httpx.post(
        f"{URL}/api/v1/field/{entity_type}/{int_range_key}",
        json={"name": "Empty range", "field_type": "integer_range"},
    ).raise_for_status()
    httpx.post(
        f"{URL}/api/v1/field/{entity_type}/{dt_key}",
        json={"name": "Empty dt", "field_type": "datetime"},
    ).raise_for_status()
    httpx.post(
        f"{URL}/api/v1/field/{entity_type}/{int_key}",
        json={"name": "Empty int range", "field_type": "integer"},
    ).raise_for_status()
    try:
        # integer_range with just a colon -> no bounds -> 400.
        result = httpx.get(f"{URL}/api/v1/{entity_type}", params={f"extra.{int_range_key}": ":"})
        assert result.status_code == 400
        assert "range filter value" in result.json()["message"]

        # datetime with just a separator -> no bounds -> 400.
        result = httpx.get(f"{URL}/api/v1/{entity_type}", params={f"extra.{dt_key}": "|"})
        assert result.status_code == 400
        assert "datetime range filter" in result.json()["message"]

        # integer field with a bare colon range -> no bounds -> 400.
        result = httpx.get(f"{URL}/api/v1/{entity_type}", params={f"extra.{int_key}": ":"})
        assert result.status_code == 400
        assert "range filter value" in result.json()["message"]
    finally:
        httpx.delete(f"{URL}/api/v1/field/{entity_type}/{int_range_key}").raise_for_status()
        httpx.delete(f"{URL}/api/v1/field/{entity_type}/{dt_key}").raise_for_status()
        httpx.delete(f"{URL}/api/v1/field/{entity_type}/{int_key}").raise_for_status()

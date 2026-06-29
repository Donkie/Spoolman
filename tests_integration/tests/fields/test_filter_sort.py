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
async def test_float_filter_whole_number(entity_type: str, random_filament: dict[str, Any]) -> None:
    """Exact-match filtering a float field by a whole number must work regardless of stored form.

    Regression test: a whole-number float may be persisted as "5" (e.g. JS JSON.stringify(5)) or
    "5.0". The filter previously only matched json.dumps(float(x)) == "5.0", silently missing the
    "5" form.
    """
    field_key = "test_whole_float_field"
    httpx.post(
        f"{URL}/api/v1/field/{entity_type}/{field_key}",
        json={"name": "Whole float field", "field_type": "float"},
    ).raise_for_status()
    id_int_form = _create_entity(entity_type, {field_key: json.dumps(5)}, random_filament)  # stored "5"
    id_float_form = _create_entity(entity_type, {field_key: json.dumps(7.0)}, random_filament)  # stored "7.0"
    other = _create_entity(entity_type, {field_key: json.dumps(2.5)}, random_filament)

    def matching_ids(query_value: str) -> set[int]:
        result = httpx.get(f"{URL}/api/v1/{entity_type}", params={f"extra.{field_key}": query_value})
        result.raise_for_status()
        return {item["id"] for item in result.json()}

    try:
        # Query "5" must match the value stored as "5".
        ids = matching_ids("5")
        assert id_int_form in ids
        assert other not in ids

        # Query "5.0" must also match the value stored as "5".
        assert id_int_form in matching_ids("5.0")

        # Query "7" must match the value stored as "7.0".
        assert id_float_form in matching_ids("7")
    finally:
        httpx.delete(f"{URL}/api/v1/field/{entity_type}/{field_key}").raise_for_status()
        for entity_id in (id_int_form, id_float_form, other):
            httpx.delete(f"{URL}/api/v1/{entity_type}/{entity_id}").raise_for_status()


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

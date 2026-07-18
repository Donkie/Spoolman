"""Tests for the extra-field distinct-values endpoint (GET /field/{entity}/{key}/values)."""

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


@pytest.mark.asyncio
@pytest.mark.parametrize("entity_type", ["spool", "filament", "vendor"])
async def test_text_field_values_are_distinct_and_sorted(entity_type: str, random_filament: dict[str, Any]) -> None:
    """The values endpoint returns the distinct, sorted, in-use values of a text field."""
    field_key = f"vals_text_{uuid.uuid4().hex[:8]}"
    httpx.post(
        f"{URL}/api/v1/field/{entity_type}/{field_key}",
        json={"name": "Values text", "field_type": "text"},
    ).raise_for_status()
    # Two entities share "A1"; the endpoint must de-duplicate. One uses "B2".
    id1 = _create_entity(entity_type, {field_key: json.dumps("A1")}, random_filament)
    id2 = _create_entity(entity_type, {field_key: json.dumps("B2")}, random_filament)
    id3 = _create_entity(entity_type, {field_key: json.dumps("A1")}, random_filament)
    try:
        result = httpx.get(f"{URL}/api/v1/field/{entity_type}/{field_key}/values")
        assert_httpx_success(result)
        # The field key is unique to this test, so the values are exactly what we set.
        assert result.json() == ["A1", "B2"]
    finally:
        httpx.delete(f"{URL}/api/v1/field/{entity_type}/{field_key}").raise_for_status()
        for eid in (id1, id2, id3):
            httpx.delete(f"{URL}/api/v1/{entity_type}/{eid}").raise_for_status()


@pytest.mark.asyncio
@pytest.mark.parametrize("entity_type", ["spool", "filament", "vendor"])
async def test_values_exclude_unset_and_empty(entity_type: str, random_filament: dict[str, Any]) -> None:
    """Entities with no value, or an explicitly empty value, do not contribute to the values list."""
    field_key = f"vals_opt_{uuid.uuid4().hex[:8]}"
    httpx.post(
        f"{URL}/api/v1/field/{entity_type}/{field_key}",
        json={"name": "Values optional", "field_type": "text"},
    ).raise_for_status()
    id_set = _create_entity(entity_type, {field_key: json.dumps("here")}, random_filament)
    id_empty = _create_entity(entity_type, {field_key: json.dumps("")}, random_filament)
    id_unset = _create_entity(entity_type, {}, random_filament)
    try:
        result = httpx.get(f"{URL}/api/v1/field/{entity_type}/{field_key}/values")
        assert_httpx_success(result)
        assert result.json() == ["here"]
    finally:
        httpx.delete(f"{URL}/api/v1/field/{entity_type}/{field_key}").raise_for_status()
        for eid in (id_set, id_empty, id_unset):
            httpx.delete(f"{URL}/api/v1/{entity_type}/{eid}").raise_for_status()


@pytest.mark.asyncio
@pytest.mark.parametrize("entity_type", ["spool", "filament", "vendor"])
async def test_single_choice_field_values(entity_type: str, random_filament: dict[str, Any]) -> None:
    """The values endpoint returns the in-use choices of a single-choice field (not all defined choices)."""
    field_key = f"vals_choice_{uuid.uuid4().hex[:8]}"
    httpx.post(
        f"{URL}/api/v1/field/{entity_type}/{field_key}",
        json={
            "name": "Values choice",
            "field_type": "choice",
            "choices": ["Good", "Bad", "Meh"],
            "multi_choice": False,
        },
    ).raise_for_status()
    # Only "Good" and "Bad" are actually used; "Meh" is defined but unused.
    id1 = _create_entity(entity_type, {field_key: json.dumps("Good")}, random_filament)
    id2 = _create_entity(entity_type, {field_key: json.dumps("Bad")}, random_filament)
    try:
        result = httpx.get(f"{URL}/api/v1/field/{entity_type}/{field_key}/values")
        assert_httpx_success(result)
        assert result.json() == ["Bad", "Good"]
    finally:
        httpx.delete(f"{URL}/api/v1/field/{entity_type}/{field_key}").raise_for_status()
        httpx.delete(f"{URL}/api/v1/{entity_type}/{id1}").raise_for_status()
        httpx.delete(f"{URL}/api/v1/{entity_type}/{id2}").raise_for_status()


@pytest.mark.asyncio
@pytest.mark.parametrize("entity_type", ["spool", "filament", "vendor"])
async def test_values_non_ascii(entity_type: str, random_filament: dict[str, Any]) -> None:
    """The values endpoint decodes stored JSON, so non-ASCII values round-trip (encoding canary)."""
    field_key = f"vals_unicode_{uuid.uuid4().hex[:8]}"
    httpx.post(
        f"{URL}/api/v1/field/{entity_type}/{field_key}",
        json={"name": "Values unicode", "field_type": "text"},
    ).raise_for_status()
    # Store unescaped, the way the JS frontend's JSON.stringify does.
    id1 = _create_entity(entity_type, {field_key: json.dumps("Café åäö", ensure_ascii=False)}, random_filament)
    id2 = _create_entity(entity_type, {field_key: json.dumps("日本", ensure_ascii=False)}, random_filament)
    try:
        result = httpx.get(f"{URL}/api/v1/field/{entity_type}/{field_key}/values")
        assert_httpx_success(result)
        assert set(result.json()) == {"Café åäö", "日本"}
    finally:
        httpx.delete(f"{URL}/api/v1/field/{entity_type}/{field_key}").raise_for_status()
        httpx.delete(f"{URL}/api/v1/{entity_type}/{id1}").raise_for_status()
        httpx.delete(f"{URL}/api/v1/{entity_type}/{id2}").raise_for_status()


@pytest.mark.asyncio
@pytest.mark.parametrize("entity_type", ["spool", "filament", "vendor"])
async def test_values_unknown_field_returns_404(entity_type: str) -> None:
    """Requesting values for a field that does not exist returns 404."""
    result = httpx.get(f"{URL}/api/v1/field/{entity_type}/does_not_exist/values")
    assert result.status_code == 404
    assert "does_not_exist" in result.json()["message"]


@pytest.mark.asyncio
@pytest.mark.parametrize("entity_type", ["spool", "filament", "vendor"])
async def test_values_empty_when_no_entities(entity_type: str) -> None:
    """A defined field with no values stored anywhere returns an empty list (not an error)."""
    field_key = f"vals_none_{uuid.uuid4().hex[:8]}"
    httpx.post(
        f"{URL}/api/v1/field/{entity_type}/{field_key}",
        json={"name": "Values none", "field_type": "text"},
    ).raise_for_status()
    try:
        result = httpx.get(f"{URL}/api/v1/field/{entity_type}/{field_key}/values")
        assert_httpx_success(result)
        assert result.json() == []
    finally:
        httpx.delete(f"{URL}/api/v1/field/{entity_type}/{field_key}").raise_for_status()

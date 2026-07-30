"""Tests for the update semantics of an entity's extra fields.

A PATCH merges the map per key: a field left out of it keeps whatever it held. A value can
be set to any JSON-encoded string of the field's type, and null says "this entity has no
value for the field", which is what removes one that has been set. Without null there is no
way back to unset — an omitted key means "leave it alone", and the type check rejects every
value that could stand in for "empty" (a single-choice field, for instance, only accepts one
of its choices).

All three entities behave the same way; a filament's and a vendor's extra used to be
replaced wholesale instead, which silently dropped the values a patch didn't mention.
"""

import json
import uuid
from typing import Any

import httpx
import pytest

from ..conftest import URL, assert_httpx_success


def _create_entity(entity_type: str, extra: dict[str, Any], random_filament: dict[str, Any]) -> int:
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
async def test_clear_choice_value(entity_type: str, random_filament: dict[str, Any]) -> None:
    """A single-choice value is removed by patching the key with null."""
    field_key = f"clear_choice_{uuid.uuid4().hex[:8]}"
    httpx.post(
        f"{URL}/api/v1/field/{entity_type}/{field_key}",
        json={"name": "Clear choice", "field_type": "choice", "choices": ["Good", "Bad"], "multi_choice": False},
    ).raise_for_status()
    entity_id = _create_entity(entity_type, {field_key: json.dumps("Good")}, random_filament)
    try:
        result = httpx.patch(f"{URL}/api/v1/{entity_type}/{entity_id}", json={"extra": {field_key: None}})
        assert_httpx_success(result)
        assert field_key not in result.json()["extra"]

        # …and it stayed gone.
        result = httpx.get(f"{URL}/api/v1/{entity_type}/{entity_id}")
        assert_httpx_success(result)
        assert field_key not in result.json()["extra"]
    finally:
        httpx.delete(f"{URL}/api/v1/field/{entity_type}/{field_key}").raise_for_status()
        httpx.delete(f"{URL}/api/v1/{entity_type}/{entity_id}").raise_for_status()


@pytest.mark.asyncio
@pytest.mark.parametrize("entity_type", ["spool", "filament", "vendor"])
async def test_patch_merges_per_key(entity_type: str, random_filament: dict[str, Any]) -> None:
    """A patch that mentions one field leaves the entity's other fields as they were."""
    suffix = uuid.uuid4().hex[:8]
    patched_key = f"merge_a_{suffix}"
    untouched_key = f"merge_b_{suffix}"
    for key in (patched_key, untouched_key):
        httpx.post(
            f"{URL}/api/v1/field/{entity_type}/{key}",
            json={"name": key, "field_type": "text"},
        ).raise_for_status()
    entity_id = _create_entity(
        entity_type,
        {patched_key: json.dumps("before"), untouched_key: json.dumps("untouched")},
        random_filament,
    )
    try:
        result = httpx.patch(
            f"{URL}/api/v1/{entity_type}/{entity_id}",
            json={"extra": {patched_key: json.dumps("after")}},
        )
        assert_httpx_success(result)
        assert result.json()["extra"] == {
            patched_key: json.dumps("after"),
            untouched_key: json.dumps("untouched"),
        }
    finally:
        for key in (patched_key, untouched_key):
            httpx.delete(f"{URL}/api/v1/field/{entity_type}/{key}").raise_for_status()
        httpx.delete(f"{URL}/api/v1/{entity_type}/{entity_id}").raise_for_status()


@pytest.mark.asyncio
@pytest.mark.parametrize("entity_type", ["spool", "filament", "vendor"])
async def test_clear_leaves_other_values_alone(entity_type: str, random_filament: dict[str, Any]) -> None:
    """Clearing one field in a patch that also carries another does not disturb the other."""
    suffix = uuid.uuid4().hex[:8]
    cleared_key = f"clear_a_{suffix}"
    kept_key = f"clear_b_{suffix}"
    for key in (cleared_key, kept_key):
        httpx.post(
            f"{URL}/api/v1/field/{entity_type}/{key}",
            json={"name": key, "field_type": "text"},
        ).raise_for_status()
    entity_id = _create_entity(
        entity_type,
        {cleared_key: json.dumps("gone"), kept_key: json.dumps("stays")},
        random_filament,
    )
    try:
        result = httpx.patch(
            f"{URL}/api/v1/{entity_type}/{entity_id}",
            json={"extra": {cleared_key: None, kept_key: json.dumps("stays")}},
        )
        assert_httpx_success(result)
        assert result.json()["extra"] == {kept_key: json.dumps("stays")}
    finally:
        for key in (cleared_key, kept_key):
            httpx.delete(f"{URL}/api/v1/field/{entity_type}/{key}").raise_for_status()
        httpx.delete(f"{URL}/api/v1/{entity_type}/{entity_id}").raise_for_status()


@pytest.mark.asyncio
@pytest.mark.parametrize("entity_type", ["spool", "filament", "vendor"])
async def test_clear_every_field_type(entity_type: str, random_filament: dict[str, Any]) -> None:
    """Null clears a value of any field type, not just the ones with a JSON string value."""
    suffix = uuid.uuid4().hex[:8]
    fields = {
        f"clr_text_{suffix}": ({"field_type": "text"}, json.dumps("hello")),
        f"clr_int_{suffix}": ({"field_type": "integer"}, json.dumps(42)),
        f"clr_range_{suffix}": ({"field_type": "float_range"}, json.dumps([1.0, 2.0])),
        # "true" is what json.dumps(True) gives; spelled out to keep the wire value obvious.
        f"clr_bool_{suffix}": ({"field_type": "boolean"}, "true"),
        f"clr_date_{suffix}": ({"field_type": "datetime"}, json.dumps("2024-01-02T03:04:05")),
        f"clr_multi_{suffix}": (
            {"field_type": "choice", "choices": ["a", "b"], "multi_choice": True},
            json.dumps(["a"]),
        ),
    }
    for key, (params, _) in fields.items():
        httpx.post(
            f"{URL}/api/v1/field/{entity_type}/{key}",
            json={"name": key, **params},
        ).raise_for_status()
    entity_id = _create_entity(entity_type, {k: v for k, (_, v) in fields.items()}, random_filament)
    try:
        result = httpx.get(f"{URL}/api/v1/{entity_type}/{entity_id}")
        assert_httpx_success(result)
        assert set(result.json()["extra"]) == set(fields)

        result = httpx.patch(
            f"{URL}/api/v1/{entity_type}/{entity_id}",
            json={"extra": dict.fromkeys(fields)},
        )
        assert_httpx_success(result)
        assert result.json()["extra"] == {}
    finally:
        for key in fields:
            httpx.delete(f"{URL}/api/v1/field/{entity_type}/{key}").raise_for_status()
        httpx.delete(f"{URL}/api/v1/{entity_type}/{entity_id}").raise_for_status()


@pytest.mark.asyncio
@pytest.mark.parametrize("entity_type", ["spool", "filament", "vendor"])
async def test_create_with_null_value_stores_nothing(entity_type: str, random_filament: dict[str, Any]) -> None:
    """A null value on create means the entity simply has no value for that field."""
    field_key = f"clear_new_{uuid.uuid4().hex[:8]}"
    httpx.post(
        f"{URL}/api/v1/field/{entity_type}/{field_key}",
        json={"name": "Clear on create", "field_type": "text"},
    ).raise_for_status()
    entity_id = _create_entity(entity_type, {field_key: None}, random_filament)
    try:
        result = httpx.get(f"{URL}/api/v1/{entity_type}/{entity_id}")
        assert_httpx_success(result)
        assert field_key not in result.json()["extra"]
    finally:
        httpx.delete(f"{URL}/api/v1/field/{entity_type}/{field_key}").raise_for_status()
        httpx.delete(f"{URL}/api/v1/{entity_type}/{entity_id}").raise_for_status()


@pytest.mark.asyncio
@pytest.mark.parametrize("entity_type", ["spool", "filament", "vendor"])
async def test_unknown_field_is_still_rejected(entity_type: str, random_filament: dict[str, Any]) -> None:
    """Null does not buy a pass on the key check: an unknown field is still a 400."""
    entity_id = _create_entity(entity_type, {}, random_filament)
    try:
        result = httpx.patch(
            f"{URL}/api/v1/{entity_type}/{entity_id}",
            json={"extra": {f"nonexistent_{uuid.uuid4().hex[:8]}": None}},
        )
        assert result.status_code == 400
    finally:
        httpx.delete(f"{URL}/api/v1/{entity_type}/{entity_id}").raise_for_status()

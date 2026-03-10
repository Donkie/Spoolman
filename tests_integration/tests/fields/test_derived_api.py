"""Integration tests for derived field API payload exposure."""

from typing import Any

import httpx
import pytest

from ..conftest import URL, assert_httpx_success


def _set_api_include_derived(enabled: bool | None) -> None:
    if enabled is None:
        result = httpx.post(f"{URL}/api/v1/setting/api_include_derived_fields", json="")
    else:
        result = httpx.post(
            f"{URL}/api/v1/setting/api_include_derived_fields",
            json="true" if enabled else "false",
        )
    assert_httpx_success(result)


def _create_spool_formula_field(key: str, *, include_in_api: bool) -> None:
    create_result = httpx.post(
        f"{URL}/api/v1/field/derived/spool/{key}",
        json={
            "name": "API Derived Exposure Test",
            "description": "Created by integration test",
            "result_type": "number",
            "expression_json": {"+": [{"var": "used_weight"}, {"var": "remaining_weight"}]},
            "surfaces": ["show", "list"],
            "allow_list_column_toggle": False,
            "include_in_api": include_in_api,
        },
    )
    assert_httpx_success(create_result)


def _delete_spool_formula_field(key: str) -> None:
    delete_result = httpx.delete(f"{URL}/api/v1/field/derived/spool/{key}")
    assert_httpx_success(delete_result)


def test_spool_api_include_derived_toggle(random_filament: dict[str, Any]):
    """Derived API output should support default setting and per-request overrides."""
    key = "api_include_derived_toggle"
    hidden_key = "api_excluded_field"
    _create_spool_formula_field(key, include_in_api=True)
    _create_spool_formula_field(hidden_key, include_in_api=False)

    spool_create = httpx.post(
        f"{URL}/api/v1/spool",
        json={
            "filament_id": random_filament["id"],
            "remaining_weight": 800,
        },
    )
    assert_httpx_success(spool_create)
    spool = spool_create.json()

    try:
        _set_api_include_derived(None)

        default_response = httpx.get(f"{URL}/api/v1/spool/{spool['id']}")
        assert_httpx_success(default_response)
        assert "derived" not in default_response.json()

        explicit_enabled_response = httpx.get(f"{URL}/api/v1/spool/{spool['id']}", params={"include_derived": "true"})
        assert_httpx_success(explicit_enabled_response)
        explicit_enabled_payload = explicit_enabled_response.json()
        assert explicit_enabled_payload["derived"][key] == pytest.approx(1000)
        assert hidden_key not in explicit_enabled_payload["derived"]

        _set_api_include_derived(True)

        default_enabled_response = httpx.get(f"{URL}/api/v1/spool/{spool['id']}")
        assert_httpx_success(default_enabled_response)
        default_enabled_payload = default_enabled_response.json()
        assert default_enabled_payload["derived"][key] == pytest.approx(1000)
        assert hidden_key not in default_enabled_payload["derived"]

        explicit_disabled_response = httpx.get(f"{URL}/api/v1/spool/{spool['id']}", params={"include_derived": "false"})
        assert_httpx_success(explicit_disabled_response)
        assert "derived" not in explicit_disabled_response.json()

        list_enabled_response = httpx.get(
            f"{URL}/api/v1/spool",
            params={"filament.id": str(random_filament["id"]), "include_derived": "true"},
        )
        assert_httpx_success(list_enabled_response)
        list_payload = list_enabled_response.json()
        matching_spool = next(item for item in list_payload if item["id"] == spool["id"])
        assert matching_spool["derived"][key] == pytest.approx(1000)
        assert hidden_key not in matching_spool["derived"]
    finally:
        httpx.delete(f"{URL}/api/v1/spool/{spool['id']}").raise_for_status()
        _delete_spool_formula_field(hidden_key)
        _delete_spool_formula_field(key)
        _set_api_include_derived(None)

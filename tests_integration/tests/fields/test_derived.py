"""Integration tests for derived (formula) fields."""

import httpx

from ..conftest import URL, assert_httpx_code, assert_httpx_success


def test_preview_derived_json_logic_expression():
    """Preview endpoint should accept JSON Logic payloads."""
    result = httpx.post(
        f"{URL}/api/v1/field/derived/spool/preview",
        json={
            "expression_json": {"-": [{"var": "weight"}, {"var": "remaining_weight"}]},
            "sample_values": {"weight": 1000, "remaining_weight": 225},
        },
    )
    assert_httpx_success(result)
    payload = result.json()
    assert payload["result"] == 775
    assert set(payload["references"]) == {"weight", "remaining_weight"}


def test_create_and_delete_derived_json_logic_field():
    """Derived fields should persist expression_json definitions."""
    key = "json_logic_test_field"

    create_result = httpx.post(
        f"{URL}/api/v1/field/derived/spool/{key}",
        json={
            "name": "JSON Logic Test Field",
            "description": "Created by integration test",
            "result_type": "number",
            "expression_json": {"+": [1, 2, 3]},
            "surfaces": ["show"],
            "allow_list_column_toggle": False,
        },
    )
    assert_httpx_success(create_result)
    fields = create_result.json()
    created = next(field for field in fields if field["key"] == key)
    assert created["expression_json"] == {"+": [1, 2, 3]}
    # Transitional behavior keeps a string representation for legacy consumers that still read
    # the expression column while JSON Logic is introduced.
    assert created["expression"] is not None

    delete_result = httpx.delete(f"{URL}/api/v1/field/derived/spool/{key}")
    assert_httpx_success(delete_result)


def test_preview_derived_json_logic_invalid_operator():
    """Preview should reject unknown JSON Logic operators with HTTP 400."""
    result = httpx.post(
        f"{URL}/api/v1/field/derived/spool/preview",
        json={
            "expression_json": {"sqrt": [9]},
            "sample_values": {},
        },
    )
    assert_httpx_code(result, 400)
    assert "not allowed" in result.json()["message"]

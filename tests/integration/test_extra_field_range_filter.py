"""Integration tests for numeric-range and boolean extra-field filters (rows 34, 36).

Oracle: the documented filter grammar over HTTP — an integer field supports
`min:max` / `min:` / `:max` range filtering, and a boolean field filters by
true/false. Values are seeded through the real POST /filament endpoint and matched
via GET /filament?extra.<key>=...
"""

import json

import pytest
from httpx import AsyncClient

FIL = "/api/v1/filament"
FIELD = "/api/v1/field"


async def _define(client: AsyncClient, key: str, field_type: str) -> None:
    resp = await client.post(f"{FIELD}/filament/{key}", json={"field_type": field_type, "name": key.title()})
    assert resp.status_code == 200, resp.text


async def _add(client: AsyncClient, name: str, key: str, value: object) -> None:
    body = {"density": 1.24, "diameter": 1.75, "name": name, "extra": {key: json.dumps(value)}}
    resp = await client.post(FIL, json=body)
    assert resp.status_code == 200, resp.text


async def _names(client: AsyncClient, key: str, value: str) -> set[str]:
    resp = await client.get(FIL, params={f"extra.{key}": value})
    assert resp.status_code == 200, resp.text
    return {f.get("name") for f in resp.json()}


@pytest.fixture
async def _years(client: AsyncClient) -> None:
    await _define(client, "year", "integer")
    await _add(client, "Old", "year", 2019)
    await _add(client, "Mid", "year", 2021)
    await _add(client, "New", "year", 2023)


@pytest.mark.usefixtures("_years")
async def test_integer_closed_range_matches_values_inside(client: AsyncClient):
    assert await _names(client, "year", "2020:2022") == {"Mid"}


@pytest.mark.usefixtures("_years")
async def test_integer_open_lower_bound(client: AsyncClient):
    # "2022:" means >= 2022.
    assert await _names(client, "year", "2022:") == {"New"}


@pytest.mark.usefixtures("_years")
async def test_integer_open_upper_bound(client: AsyncClient):
    # ":2020" means <= 2020.
    assert await _names(client, "year", ":2020") == {"Old"}


@pytest.mark.usefixtures("_years")
async def test_integer_exact_match(client: AsyncClient):
    assert await _names(client, "year", "2021") == {"Mid"}


@pytest.mark.usefixtures("_years")
async def test_invalid_integer_range_returns_400(client: AsyncClient):
    resp = await client.get(FIL, params={"extra.year": "abc:def"})
    assert resp.status_code == 400, resp.text


async def test_boolean_field_filters_by_true_and_false(client: AsyncClient):
    await _define(client, "available", "boolean")
    await _add(client, "InStock", "available", value=True)
    await _add(client, "OutOfStock", "available", value=False)

    assert await _names(client, "available", "true") == {"InStock"}
    assert await _names(client, "available", "false") == {"OutOfStock"}

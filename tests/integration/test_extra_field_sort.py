"""Integration tests for sorting by extra fields + malformed sort (rows 38, 39).

Oracle: the documented sort contract observed over HTTP — an integer extra field
orders rows numerically asc/desc, an unknown extra sort key is silently ignored
(200, not 500), and a malformed sort is rejected with 400.
"""

import json

import pytest
from httpx import AsyncClient

FIL = "/api/v1/filament"
FIELD = "/api/v1/field"
KEY = "year"


async def _define_int_field(client: AsyncClient) -> None:
    resp = await client.post(f"{FIELD}/filament/{KEY}", json={"field_type": "integer", "name": "Year"})
    assert resp.status_code == 200, resp.text


async def _add(client: AsyncClient, name: str, year: int) -> None:
    body = {"density": 1.24, "diameter": 1.75, "name": name, "extra": {KEY: json.dumps(year)}}
    resp = await client.post(FIL, json=body)
    assert resp.status_code == 200, resp.text


async def _names_in_order(client: AsyncClient, sort: str) -> list[str]:
    resp = await client.get(FIL, params={"sort": sort})
    assert resp.status_code == 200, resp.text
    return [f["name"] for f in resp.json()]


@pytest.fixture
async def _seed(client: AsyncClient) -> None:
    await _define_int_field(client)
    await _add(client, "Old", 2019)
    await _add(client, "New", 2023)
    await _add(client, "Mid", 2021)


@pytest.mark.usefixtures("_seed")
async def test_sort_by_extra_field_ascending(client: AsyncClient):
    assert await _names_in_order(client, f"extra.{KEY}:asc") == ["Old", "Mid", "New"]


@pytest.mark.usefixtures("_seed")
async def test_sort_by_extra_field_descending(client: AsyncClient):
    assert await _names_in_order(client, f"extra.{KEY}:desc") == ["New", "Mid", "Old"]


@pytest.mark.usefixtures("_seed")
async def test_sort_by_unknown_extra_field_is_ignored_not_500(client: AsyncClient):
    # A nonexistent extra sort key must be skipped silently (200 + all rows), not error.
    resp = await client.get(FIL, params={"sort": "extra.nonexistent:asc"})
    assert resp.status_code == 200, resp.text
    assert len(resp.json()) == 3


@pytest.mark.usefixtures("_seed")
async def test_malformed_sort_direction_returns_400(client: AsyncClient):
    resp = await client.get(FIL, params={"sort": "name:sideways"})
    assert resp.status_code == 400, resp.text

"""Integration tests for extra-field filtering (TESTING_CANDIDATES rows 32, 51).

Defines a text extra field, tags filaments with values that include SQL LIKE
wildcards, and filters through the real GET /filament?extra.<key>=... contract.
Oracle: the documented filter semantics — notably that a value like "50%" matches
literally (the _escape_like fix), not as a wildcard. Runs against the temp DB.
"""

import json

import pytest
from httpx import AsyncClient

FIL = "/api/v1/filament"
FIELD = "/api/v1/field"
KEY = "promo"


async def _define_text_field(client: AsyncClient) -> None:
    resp = await client.post(f"{FIELD}/filament/{KEY}", json={"field_type": "text", "name": "Promo"})
    assert resp.status_code == 200, resp.text


async def _add_filament(client: AsyncClient, name: str, promo: str) -> None:
    body = {"density": 1.24, "diameter": 1.75, "name": name, "extra": {KEY: json.dumps(promo)}}
    resp = await client.post(FIL, json=body)
    assert resp.status_code == 200, resp.text


async def _filter_names(client: AsyncClient, value: str) -> set[str]:
    resp = await client.get(FIL, params={f"extra.{KEY}": value})
    assert resp.status_code == 200, resp.text
    return {f.get("name") for f in resp.json()}


@pytest.fixture
async def _seed(client: AsyncClient) -> None:
    await _define_text_field(client)
    await _add_filament(client, "Half Off", "50%")
    await _add_filament(client, "Five Hundred", "500")
    await _add_filament(client, "Underscored", "a_b")


@pytest.mark.usefixtures("_seed")
async def test_percent_is_matched_literally_not_as_a_wildcard(client: AsyncClient):
    # The _escape_like fix: "50%" must not behave like the SQL wildcard "50<anything>".
    assert await _filter_names(client, "50%") == {"Half Off"}


@pytest.mark.usefixtures("_seed")
async def test_underscore_is_matched_literally(client: AsyncClient):
    # "_" is also a LIKE wildcard (any single char) and must be escaped.
    assert await _filter_names(client, "a_b") == {"Underscored"}


@pytest.mark.usefixtures("_seed")
async def test_plain_value_still_matches(client: AsyncClient):
    assert await _filter_names(client, "500") == {"Five Hundred"}


@pytest.mark.usefixtures("_seed")
async def test_malformed_extra_filter_does_not_500(client: AsyncClient):
    # Odd characters in the filter value must not crash the endpoint.
    resp = await client.get(FIL, params={f"extra.{KEY}": "%_\\"})
    assert resp.status_code == 200, resp.text

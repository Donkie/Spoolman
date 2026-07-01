"""Integration tests for the filament `search` query param (TESTING_CANDIDATES row 80).

Seeds filaments through the real POST endpoint, then drives GET /filament?search=…
and asserts the returned rows. Oracle: the documented search semantics (fuzzy
substring by default, quoted for exact, comma for OR, numeric id) observed through
the HTTP contract — not the SQL. Also guards that a malformed search is a 200, not a 500.
"""

import pytest
from httpx import AsyncClient

API = "/api/v1/filament"


async def _add_filament(client: AsyncClient, **fields: object) -> dict:
    body = {"density": 1.24, "diameter": 1.75, **fields}
    resp = await client.post(API, json=body)
    assert resp.status_code == 200, resp.text
    return resp.json()


async def _search_names(client: AsyncClient, query: str) -> set[str]:
    resp = await client.get(API, params={"search": query})
    assert resp.status_code == 200, resp.text
    return {f.get("name") for f in resp.json()}


@pytest.fixture
async def _seed(client: AsyncClient) -> None:
    await _add_filament(client, name="Prusament PLA", material="PLA")
    await _add_filament(client, name="Generic PETG", material="PETG")
    await _add_filament(client, name="Fancy PLA Silk", material="PLA")


@pytest.mark.usefixtures("_seed")
async def test_fuzzy_search_matches_substring_case_insensitively(client: AsyncClient):
    assert await _search_names(client, "prusa") == {"Prusament PLA"}
    # Material is one of the searched columns.
    assert await _search_names(client, "petg") == {"Generic PETG"}


@pytest.mark.usefixtures("_seed")
async def test_search_across_material_returns_all_matching(client: AsyncClient):
    assert await _search_names(client, "PLA") == {"Prusament PLA", "Fancy PLA Silk"}


@pytest.mark.usefixtures("_seed")
async def test_comma_separated_terms_are_ored(client: AsyncClient):
    assert await _search_names(client, "prusa,petg") == {"Prusament PLA", "Generic PETG"}


@pytest.mark.usefixtures("_seed")
async def test_empty_search_returns_everything(client: AsyncClient):
    assert await _search_names(client, "") == {"Prusament PLA", "Generic PETG", "Fancy PLA Silk"}


async def test_numeric_search_matches_by_id(client: AsyncClient):
    created = await _add_filament(client, name="ById Filament", material="ABS")
    resp = await client.get(API, params={"search": str(created["id"])})
    assert resp.status_code == 200
    assert {f["id"] for f in resp.json()} == {created["id"]}


@pytest.mark.usefixtures("_seed")
async def test_malformed_search_does_not_500(client: AsyncClient):
    # Odd input must be handled gracefully (200), never crash the endpoint.
    for weird in ['"', ",,,", "%_\\", '"unterminated']:
        resp = await client.get(API, params={"search": weird})
        assert resp.status_code == 200, f"{weird!r} -> {resp.status_code}: {resp.text}"

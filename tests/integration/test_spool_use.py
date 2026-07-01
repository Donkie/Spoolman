"""Integration tests for spool weight consumption/refill (TESTING_CANDIDATES row 40).

Oracle: the documented `use_weight_safe` contract observed over HTTP — consumption
reduces remaining weight; a refill (negative use) is clamped so used_weight never
goes below zero (remaining never exceeds the initial weight). Uses the real
PUT /spool/{id}/use endpoint against the temp DB.
"""

import pytest
from httpx import AsyncClient

FIL = "/api/v1/filament"
SPOOL = "/api/v1/spool"


async def _make_spool(client: AsyncClient, initial_weight: float) -> dict:
    fil = await client.post(FIL, json={"density": 1.24, "diameter": 1.75, "name": "PLA"})
    assert fil.status_code == 200, fil.text
    sp = await client.post(SPOOL, json={"filament_id": fil.json()["id"], "initial_weight": initial_weight})
    assert sp.status_code == 200, sp.text
    return sp.json()


async def _use(client: AsyncClient, spool_id: int, weight: float) -> dict:
    resp = await client.put(f"{SPOOL}/{spool_id}/use", json={"use_weight": weight})
    assert resp.status_code == 200, resp.text
    return resp.json()


async def test_created_spool_starts_full(client: AsyncClient):
    spool = await _make_spool(client, initial_weight=1000)
    assert spool["remaining_weight"] == pytest.approx(1000)
    assert spool["used_weight"] == pytest.approx(0)


async def test_consumption_reduces_remaining_weight(client: AsyncClient):
    spool = await _make_spool(client, initial_weight=1000)
    after = await _use(client, spool["id"], 100)
    assert after["used_weight"] == pytest.approx(100)
    assert after["remaining_weight"] == pytest.approx(900)

    after2 = await _use(client, spool["id"], 250)
    assert after2["used_weight"] == pytest.approx(350)
    assert after2["remaining_weight"] == pytest.approx(650)


async def test_refill_is_clamped_so_used_weight_never_goes_negative(client: AsyncClient):
    spool = await _make_spool(client, initial_weight=1000)
    await _use(client, spool["id"], 200)  # used=200, remaining=800

    # Refill far beyond empty: used_weight must clamp at 0, not go negative.
    refilled = await _use(client, spool["id"], -5000)
    assert refilled["used_weight"] == pytest.approx(0)
    assert refilled["remaining_weight"] == pytest.approx(1000)  # never exceeds initial


async def test_use_rejects_specifying_both_weight_and_length(client: AsyncClient):
    spool = await _make_spool(client, initial_weight=1000)
    resp = await client.put(f"{SPOOL}/{spool['id']}/use", json={"use_weight": 1, "use_length": 1})
    assert resp.status_code == 400

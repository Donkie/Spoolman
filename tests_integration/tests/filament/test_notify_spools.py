"""Integration tests: a filament update emits only a filament event, not a spool fan-out.

Spool responses carry fields derived from the filament (e.g. remaining_length, and the
initial_weight/price fall-backs), so editing a filament does change those derived values
without touching any spool row. Re-broadcasting every affected spool was tried and
deliberately dropped: a filament shared by hundreds of spools turned one PATCH into
hundreds of ORM loads and websocket frames inside the request. Subscribers are instead
expected to treat a filament event as invalidating the spools that reference it.

These tests pin that contract from both sides so the fan-out isn't reintroduced by
accident.
"""

import asyncio
import contextlib
import json
from typing import Any

import httpx
import pytest
from websockets.asyncio.client import connect

from ..conftest import URL

WS_URL = URL.replace("http://", "ws://", 1)

# How long to wait for an event we expect NOT to arrive. Long enough that a
# re-introduced fan-out would reliably land inside it, short enough to keep the
# suite quick across all four database backends.
QUIET_PERIOD_S = 2.0


@pytest.mark.asyncio
async def test_filament_update_does_not_fan_out_to_spools(random_filament: dict[str, Any]) -> None:
    """Patching a filament emits no spool events, however many spools reference it."""
    result = httpx.post(
        f"{URL}/api/v1/spool",
        json={"filament_id": random_filament["id"], "remaining_weight": 500},
    )
    result.raise_for_status()
    spool = result.json()

    try:
        async with connect(f"{WS_URL}/api/v1/spool") as ws:
            # The subscription is registered synchronously right after the handshake,
            # but give the server a beat before triggering the event.
            await asyncio.sleep(0.2)

            httpx.patch(
                f"{URL}/api/v1/filament/{random_filament['id']}",
                json={"density": random_filament["density"] * 2},
            ).raise_for_status()

            # Nothing should reach a /spool subscriber.
            with contextlib.suppress(TimeoutError):
                event = json.loads(await asyncio.wait_for(ws.recv(), timeout=QUIET_PERIOD_S))
                pytest.fail(f"filament update fanned out to a spool event: {event}")
    finally:
        httpx.delete(f"{URL}/api/v1/spool/{spool['id']}").raise_for_status()


@pytest.mark.asyncio
async def test_filament_update_emits_filament_event(random_filament: dict[str, Any]) -> None:
    """The filament event subscribers rely on for invalidation is still emitted."""
    async with connect(f"{WS_URL}/api/v1/filament") as ws:
        await asyncio.sleep(0.2)

        new_density = random_filament["density"] * 2
        httpx.patch(
            f"{URL}/api/v1/filament/{random_filament['id']}",
            json={"density": new_density},
        ).raise_for_status()

        event = json.loads(await asyncio.wait_for(ws.recv(), timeout=10))

    assert event["type"] == "updated"
    assert event["resource"] == "filament"
    assert event["payload"]["id"] == random_filament["id"]
    assert event["payload"]["density"] == new_density

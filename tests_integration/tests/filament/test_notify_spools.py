"""Integration tests: a filament update re-broadcasts its spools over websockets.

Spool responses carry fields derived from the filament (e.g. remaining_length, and the
initial_weight/price fall-backs). Editing the filament changes those derived values
without touching any spool row, so the server must emit a spool 'updated' event for
every spool of the filament — otherwise websocket subscribers keep stale values until
the spool itself is next edited.
"""

import asyncio
import json
from typing import Any

import httpx
import pytest
from websockets.asyncio.client import connect

from ..conftest import URL

WS_URL = URL.replace("http://", "ws://", 1)


@pytest.mark.asyncio
async def test_filament_update_notifies_spools(random_filament: dict[str, Any]) -> None:
    """Patching a filament's density emits a spool 'updated' event with fresh derived fields."""
    # Setup: one spool for this filament.
    result = httpx.post(
        f"{URL}/api/v1/spool",
        json={"filament_id": random_filament["id"], "remaining_weight": 500},
    )
    result.raise_for_status()
    spool = result.json()
    original_length = spool["remaining_length"]

    try:
        async with connect(f"{WS_URL}/api/v1/spool") as ws:
            # The subscription is registered synchronously right after the handshake,
            # but give the server a beat before triggering the event.
            await asyncio.sleep(0.2)

            new_density = random_filament["density"] * 2
            httpx.patch(
                f"{URL}/api/v1/filament/{random_filament['id']}",
                json={"density": new_density},
            ).raise_for_status()

            event = json.loads(await asyncio.wait_for(ws.recv(), timeout=10))

        assert event["type"] == "updated"
        assert event["resource"] == "spool"
        assert event["payload"]["id"] == spool["id"]
        # The embedded filament and the derived length must reflect the new density.
        assert event["payload"]["filament"]["density"] == new_density
        assert event["payload"]["remaining_length"] != original_length
    finally:
        httpx.delete(f"{URL}/api/v1/spool/{spool['id']}").raise_for_status()

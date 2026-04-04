"""Integration tests for spool websocket events."""

import asyncio
import json
from typing import Any

import httpx
import pytest
import websockets

from ..conftest import URL


@pytest.mark.asyncio
async def test_use_weight_websocket_has_weight_delta(random_filament: dict[str, Any]):
    """Test websocket payload extras for spool weight usage."""
    #Setup
    result = httpx.post(
        f"{URL}/api/v1/spool",
        json={"filament_id": random_filament["id"], "remaining_weight": 1000},
    )
    result.raise_for_status()
    spool = result.json()
    spool_id = spool["id"]
    ws_url = URL.replace("http://", "ws://").replace("https://", "wss://") + f"/api/v1/spool/{spool_id}"
    use_weight = 6.9

    try:
        async with websockets.connect(ws_url) as ws:
            # keep the socket loop healthy before triggering update
            await ws.send("ping")
            check = json.loads(await asyncio.wait_for(ws.recv(), timeout=2))
            assert check["status"] == "healthy"

            #execute
            r = httpx.put(f"{URL}/api/v1/spool/{spool_id}/use", json={"use_weight": use_weight})
            r.raise_for_status()
            raw = await asyncio.wait_for(ws.recv(), timeout=5)
            evt = json.loads(raw)
            #verify
            assert evt["resource"] == "spool"
            assert evt["type"] == "updated"
            assert evt["payload"]["id"] == spool_id
            assert evt["payload_extras"]["weight_delta"] == pytest.approx(use_weight)
            assert "event_delta" not in evt["payload"].get("extra", {})
            #cleanup-ws
            await ws.close(code=1000)
            await asyncio.sleep(0.6)
    finally:
        #cleanup
        httpx.delete(f"{URL}/api/v1/spool/{spool_id}").raise_for_status()

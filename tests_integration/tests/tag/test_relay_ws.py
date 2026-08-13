"""Integration tests for the tag scan websockets.

Two things are being pinned here. The first is the routing the pairing UX depends on: a scan
must reach the browser that follows *that* reader, and only it. The second is the API v1
compatibility guard -- scans live in their own subscription tree, so the existing `/api/v1/`
root stream, whose subscribers asked to hear about changes to data, must never see one.
"""

import asyncio
import contextlib
import json
import uuid
from typing import Any

import httpx
import pytest
from websockets.asyncio.client import ClientConnection, connect

from ..conftest import URL

WS_URL = URL.replace("http://", "ws://", 1)

# How long to wait for an event we expect NOT to arrive. Long enough that a leak into the
# wrong pool would reliably land inside it, short enough to keep the suite quick across all
# four database backends.
QUIET_PERIOD_S = 2.0

# Long enough to absorb a slow container, short enough to fail rather than hang.
RECV_TIMEOUT_S = 10.0


def _uid() -> str:
    return uuid.uuid4().hex[:14].upper()


def _reader_id() -> str:
    return f"reader-{uuid.uuid4().hex[:8]}"


def _scan(uid: str, reader_id: str, **kwargs: object) -> httpx.Response:
    return httpx.post(f"{URL}/api/v1/tag/scan", json={"uid": uid, "reader_id": reader_id, **kwargs})


async def _expect_nothing(ws: ClientConnection, why: str) -> None:
    with contextlib.suppress(TimeoutError):
        event = json.loads(await asyncio.wait_for(ws.recv(), timeout=QUIET_PERIOD_S))
        pytest.fail(f"{why}: {event}")


@pytest.mark.asyncio
async def test_scan_reaches_the_readers_own_pool():
    """The subscription a browser holds after tap-to-pair."""
    uid, reader_id = _uid(), _reader_id()

    async with connect(f"{WS_URL}/api/v1/tag/scan/{reader_id}") as ws:
        # The subscription is registered synchronously right after the handshake,
        # but give the server a beat before triggering the event.
        await asyncio.sleep(0.2)
        _scan(uid, reader_id, name="Voron spool holder").raise_for_status()

        event = json.loads(await asyncio.wait_for(ws.recv(), timeout=RECV_TIMEOUT_S))

    assert event["type"] == "scanned"
    assert event["resource"] == "tag_scan"
    assert event["payload"]["uid"] == uid
    assert event["payload"]["reader_id"] == reader_id
    assert event["payload"]["name"] == "Voron spool holder"


@pytest.mark.asyncio
async def test_scan_does_not_reach_another_readers_pool():
    """A wall tablet by printer A must not jump when someone taps a tag at printer B."""
    uid, mine, theirs = _uid(), _reader_id(), _reader_id()

    async with connect(f"{WS_URL}/api/v1/tag/scan/{mine}") as ws:
        await asyncio.sleep(0.2)
        _scan(uid, theirs).raise_for_status()
        await _expect_nothing(ws, "a scan leaked into another reader's pool")


@pytest.mark.asyncio
async def test_root_scan_pool_follows_every_reader():
    """Pairing a scanner works by listening to everything until the first tap arrives."""
    reader_a, reader_b = _reader_id(), _reader_id()
    uid_a, uid_b = _uid(), _uid()

    async with connect(f"{WS_URL}/api/v1/tag/scan") as ws:
        await asyncio.sleep(0.2)
        _scan(uid_a, reader_a).raise_for_status()
        first = json.loads(await asyncio.wait_for(ws.recv(), timeout=RECV_TIMEOUT_S))
        _scan(uid_b, reader_b).raise_for_status()
        second = json.loads(await asyncio.wait_for(ws.recv(), timeout=RECV_TIMEOUT_S))

    assert (first["payload"]["uid"], first["payload"]["reader_id"]) == (uid_a, reader_a)
    assert (second["payload"]["uid"], second["payload"]["reader_id"]) == (uid_b, reader_b)


@pytest.mark.asyncio
async def test_scan_carries_the_match(random_filament: dict[str, Any]):
    """A subscriber navigates from the event alone, without a follow-up request."""
    uid, reader_id = _uid(), _reader_id()

    result = httpx.post(f"{URL}/api/v1/spool", json={"filament_id": random_filament["id"]})
    result.raise_for_status()
    spool = result.json()
    try:
        httpx.post(f"{URL}/api/v1/spool/{spool['id']}/tag", json={"uid": uid}).raise_for_status()

        async with connect(f"{WS_URL}/api/v1/tag/scan/{reader_id}") as ws:
            await asyncio.sleep(0.2)
            _scan(uid, reader_id).raise_for_status()
            event = json.loads(await asyncio.wait_for(ws.recv(), timeout=RECV_TIMEOUT_S))

        assert event["payload"]["matched_spool_id"] == spool["id"]
        assert event["payload"]["spool"]["id"] == spool["id"]
    finally:
        httpx.delete(f"{URL}/api/v1/spool/{spool['id']}")


@pytest.mark.asyncio
async def test_scans_never_reach_the_entity_websockets():
    """THE API v1 compatibility guard.

    `/api/v1/` subscribes with pool () -- "listen to any changes" -- and SubscriptionTree
    broadcasts to every level along a path. Had scans been added as a resource on the shared
    manager, they would have appeared in every existing root consumer's stream. They are on a
    separate manager precisely so they cannot.
    """
    uid, reader_id = _uid(), _reader_id()

    async with connect(f"{WS_URL}/api/v1/") as root, connect(f"{WS_URL}/api/v1/spool") as spools:
        await asyncio.sleep(0.2)
        _scan(uid, reader_id).raise_for_status()

        await _expect_nothing(root, "a scan reached the root entity websocket")
        await _expect_nothing(spools, "a scan reached the spool websocket")


@pytest.mark.asyncio
async def test_repeated_scans_are_broadcast_once():
    """Readers re-detect a tag that is sitting still; subscribers should see one event."""
    uid, reader_id = _uid(), _reader_id()

    async with connect(f"{WS_URL}/api/v1/tag/scan/{reader_id}") as ws:
        await asyncio.sleep(0.2)
        for _ in range(4):
            _scan(uid, reader_id).raise_for_status()

        event = json.loads(await asyncio.wait_for(ws.recv(), timeout=RECV_TIMEOUT_S))
        assert event["payload"]["uid"] == uid

        await _expect_nothing(ws, "a debounced repeat scan was broadcast")


@pytest.mark.asyncio
async def test_debounce_suppresses_the_broadcast_not_the_response(random_filament: dict[str, Any]):
    """A de-duplicated scan must not look to the device like a failed lookup."""
    uid, reader_id = _uid(), _reader_id()

    result = httpx.post(f"{URL}/api/v1/spool", json={"filament_id": random_filament["id"]})
    result.raise_for_status()
    spool = result.json()
    try:
        httpx.post(f"{URL}/api/v1/spool/{spool['id']}/tag", json={"uid": uid}).raise_for_status()

        for _ in range(4):
            scan = _scan(uid, reader_id)
            scan.raise_for_status()
            assert scan.json()["matched_spool_id"] == spool["id"]
    finally:
        httpx.delete(f"{URL}/api/v1/spool/{spool['id']}")


@pytest.mark.asyncio
async def test_distinct_tags_from_one_reader_are_not_debounced():
    """Debouncing is per (uid, reader): moving from one spool to the next is two scans."""
    reader_id = _reader_id()
    uid_a, uid_b = _uid(), _uid()

    async with connect(f"{WS_URL}/api/v1/tag/scan/{reader_id}") as ws:
        await asyncio.sleep(0.2)
        _scan(uid_a, reader_id).raise_for_status()
        _scan(uid_b, reader_id).raise_for_status()

        seen = {
            json.loads(await asyncio.wait_for(ws.recv(), timeout=RECV_TIMEOUT_S))["payload"]["uid"],
            json.loads(await asyncio.wait_for(ws.recv(), timeout=RECV_TIMEOUT_S))["payload"]["uid"],
        }

    assert seen == {uid_a, uid_b}


@pytest.mark.asyncio
async def test_linking_a_tag_emits_a_spool_event(random_filament: dict[str, Any]):
    """Link and unlink ride the existing spool event.

    They mutate a spool as far as any client is concerned, so an open inspector re-renders
    with the new tag list without a single line of client-side wiring.
    """
    uid = _uid()
    result = httpx.post(f"{URL}/api/v1/spool", json={"filament_id": random_filament["id"]})
    result.raise_for_status()
    spool = result.json()
    try:
        async with connect(f"{WS_URL}/api/v1/spool/{spool['id']}") as ws:
            await asyncio.sleep(0.2)

            httpx.post(f"{URL}/api/v1/spool/{spool['id']}/tag", json={"uid": uid}).raise_for_status()
            linked = json.loads(await asyncio.wait_for(ws.recv(), timeout=RECV_TIMEOUT_S))

            httpx.delete(f"{URL}/api/v1/spool/{spool['id']}/tag/{uid}").raise_for_status()
            unlinked = json.loads(await asyncio.wait_for(ws.recv(), timeout=RECV_TIMEOUT_S))

        assert linked["type"] == "updated"
        assert linked["resource"] == "spool"
        assert [tag["uid"] for tag in linked["payload"]["tags"]] == [uid]

        assert unlinked["type"] == "updated"
        assert unlinked["payload"]["tags"] == []
    finally:
        httpx.delete(f"{URL}/api/v1/spool/{spool['id']}")

"""Integration tests: websocket authentication.

This file exists for one subtle behaviour. A websocket handler that closes the socket
*before* accepting the handshake gets translated by uvicorn into an HTTP 403 rejection
with the close code thrown away, and Starlette routes a WebSocketException raised from a
dependency down that same path. Neither can deliver 4401 or 4403 to the browser, so the
client cannot tell "you are signed out, stop retrying" from "the network blipped, back
off and retry" -- and a client that cannot tell reconnects forever.

``ws_authenticated`` therefore accepts first and closes afterwards, which looks wrong at
a glance and is the reason these assertions check the close code explicitly rather than
merely checking that the connection failed.
"""

import asyncio
import json

import httpx
import pytest
from websockets.asyncio.client import connect
from websockets.exceptions import ConnectionClosed

from .conftest import (
    SESSION_COOKIE,
    WS_API_URL,
    WS_UNAUTHENTICATED,
    assert_code,
    signed_in,
)

# Every websocket route the v1 API serves. All of them subscribe at read level.
WS_ROUTES = [
    "/",
    "/spool",
    "/spool/1",
    "/filament",
    "/filament/1",
    "/vendor",
    "/vendor/1",
    "/setting",
    "/setting/currency",
]


async def _close_code(path: str, cookie: str | None = None) -> int | None:
    """Connect, and report the code the server closed with.

    Args:
        path: The websocket path, relative to the v1 API.
        cookie: A session cookie header value, or None to connect with no credentials.

    Returns:
        Optional[int]: The close code, or None if the socket stayed open.

    """
    headers = {"Cookie": f"{SESSION_COOKIE}={cookie}"} if cookie else None
    try:
        async with connect(WS_API_URL + path, additional_headers=headers) as websocket:
            try:
                await asyncio.wait_for(websocket.recv(), timeout=2)
            except TimeoutError:
                # Still open and idle, which is what a healthy subscription looks like.
                return None
    except ConnectionClosed as exc:
        return exc.code
    return None


@pytest.mark.asyncio
@pytest.mark.parametrize("path", WS_ROUTES)
async def test_unauthenticated_websocket_is_closed_with_4401(
    setup_response: httpx.Response,  # noqa: ARG001
    path: str,
) -> None:
    """The handshake is accepted, then closed with 4401 -- not rejected with HTTP 403.

    Asserting the exact code is the regression test. If someone "simplifies"
    ws_authenticated into raising a WebSocketException or closing before accept, the
    handshake starts failing with an HTTP 403 instead and this assertion catches it.
    """
    assert await _close_code(path) == WS_UNAUTHENTICATED


@pytest.mark.asyncio
async def test_authenticated_websocket_stays_open(setup_response: httpx.Response) -> None:  # noqa: ARG001
    """A session cookie on the handshake gets a working subscription."""
    with signed_in() as (client, response):
        assert_code(response, 200)
        token = client.cookies.get(SESSION_COOKIE)

    assert await _close_code("/spool", cookie=token) is None


@pytest.mark.asyncio
async def test_authenticated_websocket_receives_events(setup_response: httpx.Response) -> None:  # noqa: ARG001
    """The subscription is a real one, not merely a socket that was left open."""
    with signed_in() as (client, response):
        assert_code(response, 200)
        token = client.cookies.get(SESSION_COOKIE)

        async with connect(
            f"{WS_API_URL}/vendor",
            additional_headers={"Cookie": f"{SESSION_COOKIE}={token}"},
        ) as websocket:
            # The subscription registers right after the handshake; give the server a
            # beat before triggering the event.
            await asyncio.sleep(0.2)

            created = client.post("/vendor", json={"name": "Websocket test vendor"})
            assert_code(created, 200)
            vendor_id = created.json()["id"]
            try:
                event = json.loads(await asyncio.wait_for(websocket.recv(), timeout=10))
                assert event["type"] == "added"
                assert event["resource"] == "vendor"
                assert event["payload"]["id"] == vendor_id
            finally:
                assert_code(client.delete(f"/vendor/{vendor_id}"), 200)


@pytest.mark.asyncio
async def test_revoked_session_cannot_open_a_websocket(setup_response: httpx.Response) -> None:  # noqa: ARG001
    """A signed-out cookie is refused at the handshake, same as no cookie at all."""
    with signed_in() as (client, response):
        assert_code(response, 200)
        token = client.cookies.get(SESSION_COOKIE)
        assert_code(client.post("/auth/logout"), 200)

    assert await _close_code("/spool", cookie=token) == WS_UNAUTHENTICATED


@pytest.mark.asyncio
async def test_garbage_cookie_cannot_open_a_websocket(setup_response: httpx.Response) -> None:  # noqa: ARG001
    """A made-up token is not a credential over websockets either."""
    assert await _close_code("/spool", cookie="not-a-real-token") == WS_UNAUTHENTICATED

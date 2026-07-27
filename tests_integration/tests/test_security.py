"""Integration tests: cross-origin requests and websockets are refused.

Spoolman has no authentication, so without an origin check any website the user happens to visit
can make their browser write to a Spoolman instance it can reach -- a cross-origin form post
needs no CORS preflight -- and can open a websocket to it, since websockets are exempt from CORS
entirely.

The server under test runs with no SPOOLMAN_CORS_ORIGIN, so the policy is "same origin only".
"""

import asyncio
import json
from urllib.parse import urlsplit

import httpx
import pytest
from websockets.asyncio.client import connect
from websockets.exceptions import InvalidStatus

from .conftest import URL

WS_URL = URL.replace("http://", "ws://", 1)

OWN_HOST = urlsplit(URL).netloc
OWN_ORIGIN = URL
EVIL_ORIGIN = "https://evil.example"


def test_cross_origin_write_is_refused():
    """A write from a foreign origin must be refused, and must not change anything."""
    before = httpx.get(f"{URL}/api/v1/setting/currency")
    before.raise_for_status()

    result = httpx.post(
        f"{URL}/api/v1/setting/currency",
        json='"HAX"',
        headers={"Origin": EVIL_ORIGIN},
    )
    assert result.status_code == 403

    after = httpx.get(f"{URL}/api/v1/setting/currency")
    after.raise_for_status()
    assert after.json() == before.json()


def test_same_origin_write_is_allowed():
    """The web UI's own origin must keep working."""
    result = httpx.post(
        f"{URL}/api/v1/setting/currency",
        json='"SEK"',
        headers={"Origin": OWN_ORIGIN},
    )
    result.raise_for_status()
    assert result.json()["value"] == '"SEK"'

    # Cleanup
    httpx.post(f"{URL}/api/v1/setting/currency", json="").raise_for_status()


def test_write_without_an_origin_header_is_allowed():
    """Moonraker, OctoPrint, Home Assistant and curl send no Origin and must not be affected."""
    result = httpx.post(f"{URL}/api/v1/setting/currency", json='"SEK"')
    result.raise_for_status()

    # Cleanup
    httpx.post(f"{URL}/api/v1/setting/currency", json="").raise_for_status()


def test_cross_origin_read_is_allowed():
    """Only state-changing methods are guarded; the same-origin policy covers reads."""
    result = httpx.get(f"{URL}/api/v1/spool", headers={"Origin": EVIL_ORIGIN})
    assert result.status_code == 200


def test_cross_origin_delete_is_refused():
    result = httpx.delete(f"{URL}/api/v1/spool/1", headers={"Origin": EVIL_ORIGIN})
    assert result.status_code == 403


def test_cross_origin_backup_is_refused():
    """A bodyless form post to /backup would otherwise rotate away every restore point."""
    result = httpx.post(f"{URL}/api/v1/backup", headers={"Origin": EVIL_ORIGIN})
    assert result.status_code == 403


def test_forwarded_host_is_accepted():
    """A reverse proxy that rewrites Host must not have its own web UI refused."""
    result = httpx.post(
        f"{URL}/api/v1/setting/currency",
        json='"SEK"',
        headers={
            "Host": "127.0.0.1:1234",
            "Origin": "https://spoolman.example.com",
            "X-Forwarded-Host": "spoolman.example.com",
        },
    )
    assert result.status_code == 200

    # Cleanup
    httpx.post(f"{URL}/api/v1/setting/currency", json="").raise_for_status()


def test_forwarded_host_does_not_admit_a_foreign_origin():
    result = httpx.post(
        f"{URL}/api/v1/setting/currency",
        json='"HAX"',
        headers={
            "Host": "127.0.0.1:1234",
            "Origin": EVIL_ORIGIN,
            "X-Forwarded-Host": "spoolman.example.com",
        },
    )
    assert result.status_code == 403


@pytest.mark.asyncio
async def test_cross_origin_websocket_is_refused():
    """Websockets bypass CORS, so this is the one channel that leaks reads cross-origin."""
    with pytest.raises(InvalidStatus) as excinfo:
        async with connect(f"{WS_URL}/api/v1/spool", additional_headers={"Origin": EVIL_ORIGIN}):
            pass
    assert excinfo.value.response.status_code == 403


@pytest.mark.asyncio
async def test_same_origin_websocket_is_allowed():
    async with connect(f"{WS_URL}/api/v1/spool", additional_headers={"Origin": OWN_ORIGIN}) as ws:
        await asyncio.sleep(0.2)
        await ws.send("ping")
        assert json.loads(await asyncio.wait_for(ws.recv(), timeout=5))["status"] == "healthy"


@pytest.mark.asyncio
async def test_websocket_without_an_origin_header_is_allowed():
    """Non-browser websocket consumers must keep working."""
    async with connect(f"{WS_URL}/api/v1/spool") as ws:
        await asyncio.sleep(0.2)
        await ws.send("ping")
        assert json.loads(await asyncio.wait_for(ws.recv(), timeout=5))["status"] == "healthy"

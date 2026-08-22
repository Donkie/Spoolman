"""Integration tests for POST /tag/scan and GET /tag/reader.

The scan endpoint is the whole device-side contract: one HTTP POST per tap, and a response a
device can light an LED from. These tests drive it with plain POSTs, which is also how a user
can demo the entire browser-side experience with no NFC hardware in the room.
"""

import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any

import httpx
import pytest

from ..conftest import URL, assert_httpx_code, assert_httpx_success


def _uid() -> str:
    return uuid.uuid4().hex[:14].upper()


def _reader_id() -> str:
    return f"reader-{uuid.uuid4().hex[:8]}"


@contextmanager
def _spool_with_tag(filament_id: int, uid: str) -> Iterator[dict[str, Any]]:
    result = httpx.post(f"{URL}/api/v1/spool", json={"filament_id": filament_id})
    assert_httpx_success(result)
    spool = result.json()
    try:
        httpx.post(f"{URL}/api/v1/spool/{spool['id']}/tag", json={"uid": uid}).raise_for_status()
        yield spool
    finally:
        httpx.delete(f"{URL}/api/v1/spool/{spool['id']}")


def test_scan_of_a_known_tag_returns_the_spool(random_filament: dict[str, Any]):
    """The lookup a device makes on every tap, answered in one round trip."""
    uid = _uid()
    with _spool_with_tag(random_filament["id"], uid) as spool:
        result = httpx.post(f"{URL}/api/v1/tag/scan", json={"uid": uid, "reader_id": _reader_id()})
        assert_httpx_success(result)

        body = result.json()
        assert body["matched_spool_id"] == spool["id"]
        assert body["spool"]["id"] == spool["id"]
        # The embedded spool is the standard object, so a device needs no follow-up request.
        assert body["spool"]["filament"]["id"] == random_filament["id"]


def test_scan_of_an_unknown_tag_reports_no_match():
    """`matched_spool_id` is present and null -- "not known yet" is an answer, not a missing key."""
    result = httpx.post(f"{URL}/api/v1/tag/scan", json={"uid": _uid(), "reader_id": _reader_id()})
    assert_httpx_success(result)

    body = result.json()
    assert "matched_spool_id" in body
    assert body["matched_spool_id"] is None
    assert body.get("spool") is None


def test_scan_normalizes_and_echoes_the_uid(random_filament: dict[str, Any]):
    """A device sending its own spelling still matches, and is told the canonical form."""
    uid = _uid()
    dashed = "-".join(uid[i : i + 2] for i in range(0, len(uid), 2)).lower()
    with _spool_with_tag(random_filament["id"], uid) as spool:
        result = httpx.post(f"{URL}/api/v1/tag/scan", json={"uid": dashed, "reader_id": _reader_id()})
        assert_httpx_success(result)

        body = result.json()
        assert body["uid"] == uid
        assert body["matched_spool_id"] == spool["id"]


def test_scan_finds_an_archived_spool(random_filament: dict[str, Any]):
    """Tapping an archived spool's tag should say which spool it is, not pretend it is unknown."""
    uid = _uid()
    result = httpx.post(f"{URL}/api/v1/spool", json={"filament_id": random_filament["id"], "archived": True})
    assert_httpx_success(result)
    spool = result.json()
    try:
        httpx.post(f"{URL}/api/v1/spool/{spool['id']}/tag", json={"uid": uid}).raise_for_status()

        scan = httpx.post(f"{URL}/api/v1/tag/scan", json={"uid": uid, "reader_id": _reader_id()})
        assert_httpx_success(scan)
        assert scan.json()["matched_spool_id"] == spool["id"]
    finally:
        httpx.delete(f"{URL}/api/v1/spool/{spool['id']}")


@pytest.mark.parametrize("bad", ["not-a-uid", "04A2B3G4", "!!!"])
def test_scan_with_an_invalid_uid_is_400(bad: str):
    assert_httpx_code(httpx.post(f"{URL}/api/v1/tag/scan", json={"uid": bad, "reader_id": _reader_id()}), 400)


def test_scan_with_a_malformed_reader_id_is_rejected():
    """reader_id travels in a websocket path, so it is constrained rather than taken as-is."""
    result = httpx.post(f"{URL}/api/v1/tag/scan", json={"uid": _uid(), "reader_id": "has spaces/and/slashes"})
    assert_httpx_code(result, 422)


def test_scanning_registers_the_reader():
    """The registry backs a 'choose a reader' picker for people who prefer it to tap-to-pair."""
    reader_id = _reader_id()
    httpx.post(
        f"{URL}/api/v1/tag/scan",
        json={"uid": _uid(), "reader_id": reader_id, "name": "Voron spool holder"},
    ).raise_for_status()

    result = httpx.get(f"{URL}/api/v1/tag/reader")
    assert_httpx_success(result)

    readers = {reader["reader_id"]: reader for reader in result.json()}
    assert reader_id in readers
    assert readers[reader_id]["name"] == "Voron spool holder"
    assert "last_seen" in readers[reader_id]


def test_reader_id_is_derived_when_the_agent_sends_none():
    """A dozen lines of ESPHome YAML that will never be rewritten still gets a stable id."""
    result = httpx.post(f"{URL}/api/v1/tag/scan", json={"uid": _uid()})
    assert_httpx_success(result)

    reader_id = result.json()["reader_id"]
    assert reader_id.startswith("ip-")

    listed = httpx.get(f"{URL}/api/v1/tag/reader")
    assert_httpx_success(listed)
    assert reader_id in {reader["reader_id"] for reader in listed.json()}


def test_scan_stores_nothing(random_filament: dict[str, Any]):
    """Scans are ephemeral. A scan must not link a tag, create a spool, or change one."""
    uid = _uid()
    before = httpx.get(f"{URL}/api/v1/spool", params={"limit": 1})
    assert_httpx_success(before)

    httpx.post(f"{URL}/api/v1/tag/scan", json={"uid": uid, "reader_id": _reader_id()}).raise_for_status()

    # The scanned UID is still unlinked afterwards, so a spool can claim it.
    result = httpx.post(f"{URL}/api/v1/spool", json={"filament_id": random_filament["id"]})
    assert_httpx_success(result)
    spool = result.json()
    try:
        assert_httpx_code(httpx.post(f"{URL}/api/v1/spool/{spool['id']}/tag", json={"uid": uid}), 201)
    finally:
        httpx.delete(f"{URL}/api/v1/spool/{spool['id']}")

    after = httpx.get(f"{URL}/api/v1/spool", params={"limit": 1})
    assert_httpx_success(after)
    assert after.headers["x-total-count"] == before.headers["x-total-count"]

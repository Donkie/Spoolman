"""Integration tests for POST /tag/scan's opt-in create-and-link path.

`create: true` is the only gate: a plain scan (create omitted or false) never creates
anything -- see test_scan_stores_nothing in test_scan.py for that half, which predates
decoding entirely. This file covers what happens once a caller does ask for it.
"""

import base64
import uuid
from typing import Any

import httpx

from .._openprinttag_fixtures import (
    MATERIAL_TYPE_PLA,
    MF_BRAND_NAME,
    MF_MATERIAL_TYPE,
    MF_NOMINAL_NETTO_FULL_WEIGHT,
    MF_PRIMARY_COLOR,
    build_openprinttag,
)
from ..conftest import URL, assert_httpx_success


def _uid() -> str:
    return uuid.uuid4().hex[:14].upper()


def _reader_id() -> str:
    return f"reader-{uuid.uuid4().hex[:8]}"


def _payload_b64(main: dict) -> str:
    return base64.b64encode(build_openprinttag(main)).decode("ascii")


def _delete_spool(spool_id: int) -> None:
    httpx.delete(f"{URL}/api/v1/spool/{spool_id}")


def _delete_created_spool(spool: dict[str, Any]) -> None:
    """Clean up a spool this file's endpoint auto-created, including its filament and vendor.

    Unlike `_delete_spool` (used for a spool a test made itself, whose filament/vendor
    belong to a fixture that cleans itself up), auto-create makes all three rows, and
    deleting only the spool would leave the filament and vendor behind -- polluting any
    later test in the same run that lists or counts them (e.g. vendor/test_find.py).
    """
    _delete_spool(spool["id"])
    filament = spool["filament"]
    httpx.delete(f"{URL}/api/v1/filament/{filament['id']}")
    vendor = filament.get("vendor")
    if vendor is not None:
        httpx.delete(f"{URL}/api/v1/vendor/{vendor['id']}")


def test_create_true_on_an_unmatched_decodable_tag_creates_and_links_a_spool():
    uid = _uid()
    payload = _payload_b64(
        {
            MF_MATERIAL_TYPE: MATERIAL_TYPE_PLA,
            MF_BRAND_NAME: "Prusament",
            MF_NOMINAL_NETTO_FULL_WEIGHT: 1000.0,
            MF_PRIMARY_COLOR: bytes([0x11, 0x22, 0x33, 0xFF]),
        },
    )

    result = httpx.post(
        f"{URL}/api/v1/tag/scan",
        json={
            "uid": uid,
            "reader_id": _reader_id(),
            "format": "openprinttag",
            "payload_b64": payload,
            "create": True,
        },
    )
    assert_httpx_success(result)
    body = result.json()
    try:
        assert body["created"] is True
        assert body["matched_spool_id"] is not None
        assert body["spool"]["filament"]["material"] == "PLA"
        assert body["spool"]["filament"]["vendor"]["name"] == "Prusament"

        # And the tag is really linked: a plain rescan (create not set) matches it.
        rescan = httpx.post(f"{URL}/api/v1/tag/scan", json={"uid": uid, "reader_id": _reader_id()})
        assert_httpx_success(rescan)
        assert rescan.json()["matched_spool_id"] == body["matched_spool_id"]
    finally:
        _delete_created_spool(body["spool"])


def test_create_true_on_an_already_matched_tag_does_not_recreate(random_filament: dict[str, Any]):
    uid = _uid()
    result = httpx.post(f"{URL}/api/v1/spool", json={"filament_id": random_filament["id"]})
    assert_httpx_success(result)
    spool = result.json()
    try:
        httpx.post(f"{URL}/api/v1/spool/{spool['id']}/tag", json={"uid": uid}).raise_for_status()

        payload = _payload_b64({MF_MATERIAL_TYPE: MATERIAL_TYPE_PLA})
        scan = httpx.post(
            f"{URL}/api/v1/tag/scan",
            json={
                "uid": uid,
                "reader_id": _reader_id(),
                "format": "openprinttag",
                "payload_b64": payload,
                "create": True,
            },
        )
        assert_httpx_success(scan)

        body = scan.json()
        assert body["created"] is False
        assert body["matched_spool_id"] == spool["id"]
    finally:
        _delete_spool(spool["id"])


def test_create_true_with_an_undecodable_payload_creates_nothing():
    uid = _uid()
    result = httpx.post(
        f"{URL}/api/v1/tag/scan",
        json={
            "uid": uid,
            "reader_id": _reader_id(),
            "format": "openprinttag",
            "payload_b64": base64.b64encode(b"not a tag").decode("ascii"),
            "create": True,
        },
    )
    assert_httpx_success(result)

    body = result.json()
    assert body["created"] is False
    assert body["matched_spool_id"] is None

    listing = httpx.get(f"{URL}/api/v1/spool", params={"tag": uid})
    assert_httpx_success(listing)
    assert listing.json() == []

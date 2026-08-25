"""Integration tests for tag-content decoding on POST /tag/scan.

Runs against the default deployment (SPOOLMAN_TAG_AUTO_CREATE_ENABLED unset, i.e. off),
same as every other file in this directory. Decoding itself is not gated by that setting --
only the auto-create/link side effect is -- so `decoded` is exercised here regardless, and
this file is also where the "off by default" half of the opt-in contract gets pinned: a
`create: true` request against a deployment that never opted in must still do nothing. See
tests_integration/tests_tagcreate/ for the enabled half, in its own compose stack.
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


def test_scan_decodes_a_known_format(random_filament: dict[str, Any]):  # noqa: ARG001
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
        json={"uid": _uid(), "reader_id": _reader_id(), "format": "openprinttag", "payload_b64": payload},
    )
    assert_httpx_success(result)

    decoded = result.json()["decoded"]
    assert decoded["material_type"] == "PLA"
    assert decoded["brand_name"] == "Prusament"
    assert decoded["net_weight_g"] == 1000.0
    assert decoded["color_hex"] == "112233"


def test_scan_without_a_payload_has_no_decoded_field():
    result = httpx.post(f"{URL}/api/v1/tag/scan", json={"uid": _uid(), "reader_id": _reader_id()})
    assert_httpx_success(result)
    assert "decoded" not in result.json()


def test_scan_with_an_unknown_format_has_no_decoded_field():
    payload = _payload_b64({MF_MATERIAL_TYPE: MATERIAL_TYPE_PLA})
    result = httpx.post(
        f"{URL}/api/v1/tag/scan",
        json={"uid": _uid(), "reader_id": _reader_id(), "format": "bambu", "payload_b64": payload},
    )
    assert_httpx_success(result)
    assert "decoded" not in result.json()


def test_scan_with_a_garbled_payload_soft_fails_instead_of_erroring():
    result = httpx.post(
        f"{URL}/api/v1/tag/scan",
        json={
            "uid": _uid(),
            "reader_id": _reader_id(),
            "format": "openprinttag",
            "payload_b64": base64.b64encode(b"not a tag").decode("ascii"),
        },
    )
    assert_httpx_success(result)
    assert "decoded" not in result.json()


def test_scan_decodes_even_when_the_tag_is_already_matched(random_filament: dict[str, Any]):
    """A confirm-consumed-weight flow needs `decoded` on a hit, not just a miss."""
    uid = _uid()
    result = httpx.post(f"{URL}/api/v1/spool", json={"filament_id": random_filament["id"]})
    assert_httpx_success(result)
    spool = result.json()
    try:
        httpx.post(f"{URL}/api/v1/spool/{spool['id']}/tag", json={"uid": uid}).raise_for_status()

        payload = _payload_b64({MF_MATERIAL_TYPE: MATERIAL_TYPE_PLA})
        scan = httpx.post(
            f"{URL}/api/v1/tag/scan",
            json={"uid": uid, "reader_id": _reader_id(), "format": "openprinttag", "payload_b64": payload},
        )
        assert_httpx_success(scan)

        body = scan.json()
        assert body["matched_spool_id"] == spool["id"]
        assert body["decoded"]["material_type"] == "PLA"
        assert body["created"] is False
    finally:
        httpx.delete(f"{URL}/api/v1/spool/{spool['id']}")


def test_create_flag_does_nothing_when_the_server_has_not_opted_in():
    """The other half of "opt-in": `create: true` alone, without the server-side gate, is inert."""
    uid = _uid()
    payload = _payload_b64({MF_MATERIAL_TYPE: MATERIAL_TYPE_PLA})

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
    assert body["created"] is False
    assert body["matched_spool_id"] is None

    # And nothing was actually created or linked -- the UID is still free.
    listing = httpx.get(f"{URL}/api/v1/spool", params={"tag": uid})
    assert_httpx_success(listing)
    assert listing.json() == []

"""Integration tests for /tag/scan with truncated or otherwise malformed tag contents.

A scan's core contract (resolve a UID) must never fail because the tag's contents couldn't be
decoded, so a bad payload has to come back as a normal 200 without a usable `decoded` field,
never a 500. Both truncation shapes below were found on real NFC-V hardware.
"""

import base64
import uuid

import httpx

from .._openprinttag_fixtures import (
    MF_BRAND_NAME,
    MF_EMPTY_CONTAINER_WEIGHT,
    MF_MATERIAL_NAME,
    MF_MATERIAL_TYPE,
    MF_NOMINAL_NETTO_FULL_WEIGHT,
    MF_PRIMARY_COLOR,
    build_openprinttag,
)
from ..conftest import URL, assert_httpx_success

# A realistic Prusament-style field set, big enough (~134 bytes as a tag image) to overflow a
# 128-byte tag.
_MANUFACTURED_DATE = 14
_ACTUAL_NETTO_FULL_WEIGHT = 17
_TEMPERATURES = {34: 205, 35: 220, 36: 170, 37: 40, 38: 60}
_LARGE_MAIN = {
    8: 0,  # material_class: FFF
    MF_MATERIAL_TYPE: 0,
    MF_MATERIAL_NAME: "PLA Galaxy Black",
    MF_BRAND_NAME: "Prusament",
    _MANUFACTURED_DATE: 1739371290,
    MF_NOMINAL_NETTO_FULL_WEIGHT: 1000.0,
    _ACTUAL_NETTO_FULL_WEIGHT: 1012.0,
    MF_EMPTY_CONTAINER_WEIGHT: 100.0,
    MF_PRIMARY_COLOR: bytes([0x3D, 0x3E, 0x3D]),
    **_TEMPERATURES,
}


def _scan(raw: bytes) -> httpx.Response:
    return httpx.post(
        f"{URL}/api/v1/tag/scan",
        json={
            "uid": uuid.uuid4().hex[:14].upper(),
            "reader_id": f"reader-{uuid.uuid4().hex[:8]}",
            "format": "openprinttag",
            "payload_b64": base64.b64encode(raw).decode("ascii"),
        },
    )


def test_scan_with_a_short_read_soft_fails_instead_of_erroring():
    """Bytes cut off mid-CBOR, with nothing padding them out (an agent that read too little)."""
    raw = build_openprinttag(_LARGE_MAIN)
    result = _scan(raw[:-15])
    assert_httpx_success(result)
    assert "decoded" not in result.json()


def test_scan_with_a_tag_truncated_by_a_smaller_chip_does_not_error():
    """A payload larger than the chip's real memory, read back zero-padded to the advertised size.

    The write is cut at the chip's 128-byte limit, so the CBOR is still well-formed but its
    fields are cut off or shifted into the wrong types.
    """
    raw = build_openprinttag(_LARGE_MAIN)
    assert len(raw) > 128
    result = _scan(raw[:128].ljust(192, b"\x00"))
    assert_httpx_success(result)


def test_scan_with_a_blank_tag_has_no_decoded_field():
    result = _scan(b"\x00" * 112)
    assert_httpx_success(result)
    assert "decoded" not in result.json()

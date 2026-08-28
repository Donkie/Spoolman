"""Integration tests for tag-content decoding on POST /tag/scan.

Decoding happens on every scan that carries a known `format` and a parseable
`payload_b64`, matched or not -- `decoded` is populated regardless. The create-and-link
side effect gated behind `create: true` is a separate concern; see test_scan_create.py.
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
    REAL_PRUSA_SAMPLE_TAG_B64,
    REAL_PRUSA_TEST01_B64,
    REAL_PRUSA_TEST01_TAG_UID_HEX,
    build_openprinttag,
)
from .._tigertag_fixtures import TIGERTAG_INIT, build_tigertag
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
    assert decoded["material"] == "PLA"
    assert decoded["vendor_name"] == "Prusament"
    assert decoded["weight"] == 1000.0
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
        assert body["decoded"]["material"] == "PLA"
        assert body["created"] is False
    finally:
        httpx.delete(f"{URL}/api/v1/spool/{spool['id']}")


# --- Real Prusa fixtures ---------------------------------------------------------
# See tests/fixtures/openprinttag/README.md (main test package) for provenance: real
# OpenPrintTag wire dumps from Prusa's own spec repo, not built by build_openprinttag()
# above. These are the only tests here that exercise a real tag's long-form NDEF record
# and 3-byte TLV length over the actual /tag/scan endpoint.


def test_scan_decodes_a_real_prusa_sample_tag():
    result = httpx.post(
        f"{URL}/api/v1/tag/scan",
        json={
            "uid": _uid(),
            "reader_id": _reader_id(),
            "format": "openprinttag",
            "payload_b64": REAL_PRUSA_SAMPLE_TAG_B64,
        },
    )
    assert_httpx_success(result)

    decoded = result.json()["decoded"]
    assert decoded["material"] == "PLA"
    assert decoded["vendor_name"] == "Prusament"
    assert decoded["name"] == "PLA Galaxy Black"
    assert decoded["initial_weight"] == 1012.0
    assert decoded["spool_weight"] == 100.0
    assert decoded["color_hex"] == "3d3e3d"


def test_scan_decodes_a_real_prusa_test_vector_with_derived_instance_id():
    """Ground truth: tests/encode_decode/01_info.yaml in Prusa's spec repo.

    Using the vector's own declared tag_uid as the scan UID reproduces the exact
    instance_uuid the spec's own reference implementation derives for it.
    """
    result = httpx.post(
        f"{URL}/api/v1/tag/scan",
        json={
            "uid": REAL_PRUSA_TEST01_TAG_UID_HEX,
            "reader_id": _reader_id(),
            "format": "openprinttag",
            "payload_b64": REAL_PRUSA_TEST01_B64,
        },
    )
    assert_httpx_success(result)

    decoded = result.json()["decoded"]
    assert decoded["material"] == "PLA"
    assert decoded["vendor_name"] == "Prusament"
    assert decoded["name"] == "PLA Prusa Galaxy Black"
    assert decoded["initial_weight"] == 1012.0
    assert decoded["spool_weight"] == 280.0
    assert decoded["color_hex"] == "3d3e3d"
    assert decoded["instance_uuid"] == "bf63e92d-9ca5-53d7-9fab-ffdd0240c585"


# --- TigerTag ---------------------------------------------------------------------


def test_scan_decodes_a_tigertag():
    payload = base64.b64encode(build_tigertag(id_diameter=1, weight=1000, color_hex="112233")).decode("ascii")
    result = httpx.post(
        f"{URL}/api/v1/tag/scan",
        json={"uid": _uid(), "reader_id": _reader_id(), "format": "tigertag", "payload_b64": payload},
    )
    assert_httpx_success(result)

    decoded = result.json()["decoded"]
    assert decoded["color_hex"] == "112233"
    assert decoded["diameter"] == 1.75
    assert decoded["weight"] == 1000.0
    assert decoded["material_class"] == "FFF"
    # id_material/id_brand need the optional external-DB addon to resolve to names.
    assert decoded.get("material") is None
    assert decoded.get("vendor_name") is None


def test_scan_with_a_blank_tigertag_has_no_decoded_field():
    """TIGERTAG_INIT marks an uninitialized tag -- nothing usable to surface."""
    payload = base64.b64encode(build_tigertag(id_tigertag=TIGERTAG_INIT)).decode("ascii")
    result = httpx.post(
        f"{URL}/api/v1/tag/scan",
        json={"uid": _uid(), "reader_id": _reader_id(), "format": "tigertag", "payload_b64": payload},
    )
    assert_httpx_success(result)
    assert "decoded" not in result.json()

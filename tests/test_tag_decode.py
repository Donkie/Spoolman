"""Tests for the format-dispatching decode wiring in spoolman/tag_decode.py.

Builds the same synthetic OpenPrintTag NFC-V memory dump as test_openprinttag_codec.py, but
only enough of it to exercise dispatch and field mapping -- the codec's own parsing edge
cases are that module's job, not this one's.
"""

import uuid

import cbor2

from spoolman.openprinttag_codec import (
    META_AUX_REGION_OFFSET,
    MF_BRAND_NAME,
    MF_MATERIAL_TYPE,
    MF_NOMINAL_NETTO_FULL_WEIGHT,
    MF_PRIMARY_COLOR,
)
from spoolman.tag_decode import (
    DecodedTag,
    approximate_density,
    decode,
    density_or_fallback,
)


def _cbor_payload(main: dict, aux: dict | None = None) -> bytes:
    if aux is None:
        return cbor2.dumps({}) + cbor2.dumps(main)

    meta: dict = {}
    aux_offset = 0
    for _ in range(4):
        meta[META_AUX_REGION_OFFSET] = aux_offset
        meta_bytes = cbor2.dumps(meta)
        main_bytes = cbor2.dumps(main)
        new_offset = len(meta_bytes) + len(main_bytes)
        if new_offset == aux_offset:
            break
        aux_offset = new_offset
    return meta_bytes + main_bytes + cbor2.dumps(aux)


def _ndef_short_record(mime: str, payload: bytes) -> bytes:
    mime_bytes = mime.encode("ascii")
    header = 0b11010010  # MB=1 ME=1 CF=0 SR=1 IL=0 TNF=0x02
    return bytes([header, len(mime_bytes), len(payload)]) + mime_bytes + payload


def _nfcv_memory(ndef_message: bytes) -> bytes:
    cc = bytes([0xE1, 0x40, 0x00, 0x01])
    tlv = bytes([0x03, len(ndef_message)]) + ndef_message + bytes([0xFE])
    return cc + tlv


def _build_openprinttag(main: dict, aux: dict | None = None) -> bytes:
    payload = _cbor_payload(main, aux)
    ndef = _ndef_short_record("application/vnd.openprinttag", payload)
    return _nfcv_memory(ndef)


# --- decode() dispatch -----------------------------------------------------------


def test_decode_dispatches_openprinttag() -> None:
    raw = _build_openprinttag(
        {
            MF_MATERIAL_TYPE: 0,  # PLA
            MF_BRAND_NAME: "Prusament",
            MF_NOMINAL_NETTO_FULL_WEIGHT: 1000.0,
            MF_PRIMARY_COLOR: bytes([0x11, 0x22, 0x33, 0xFF]),
        },
    )
    result = decode("openprinttag", raw)

    assert result == DecodedTag(
        material_type="PLA",
        material_name=None,
        brand_name="Prusament",
        color_hex="112233",
        diameter_mm=1.75,  # spec default, not set on this tag
        density_g_cm3=None,
        net_weight_g=1000.0,
        empty_container_weight_g=None,
        consumed_weight_g=None,
        external_id=None,
    )


def test_decode_dispatch_is_case_insensitive() -> None:
    raw = _build_openprinttag({MF_MATERIAL_TYPE: 0})
    assert decode("OpenPrintTag", raw) is not None
    assert decode(" OpenPrintTag ", raw) is not None


def test_decode_unknown_format_returns_none() -> None:
    assert decode("bambu", b"\x00" * 16) is None


def test_decode_none_format_returns_none() -> None:
    assert decode(None, b"\x00" * 16) is None


def test_decode_unparseable_payload_returns_none_instead_of_raising() -> None:
    """A recognized format with garbage bytes is a soft failure, not an exception."""
    assert decode("openprinttag", b"not a tag") is None


def test_decode_derives_external_id_from_uid_when_tag_has_no_instance_uuid() -> None:
    raw = _build_openprinttag({MF_MATERIAL_TYPE: 0})
    uid_bytes = bytes.fromhex("04A2B3C4D5E6F7")

    without_uid = decode("openprinttag", raw)
    with_uid = decode("openprinttag", raw, uid_bytes=uid_bytes)

    assert without_uid is not None
    assert without_uid.external_id is None
    assert with_uid is not None
    assert with_uid.external_id == str(uuid.uuid5(uuid.UUID("31062f81-b5bd-4f86-a5f8-46367e841508"), uid_bytes))


# --- density fallback --------------------------------------------------------------


def test_approximate_density_known_material() -> None:
    assert approximate_density("PLA") == 1.24


def test_approximate_density_is_case_insensitive() -> None:
    assert approximate_density("pla") == approximate_density("PLA")


def test_approximate_density_unknown_material_is_none() -> None:
    assert approximate_density("UNOBTANIUM") is None


def test_approximate_density_none_material_is_none() -> None:
    assert approximate_density(None) is None


def test_density_or_fallback_uses_table_when_known() -> None:
    assert density_or_fallback("ABS") == approximate_density("ABS")


def test_density_or_fallback_uses_pla_equivalent_when_unknown() -> None:
    assert density_or_fallback("UNOBTANIUM") == approximate_density("PLA")


def test_density_or_fallback_uses_pla_equivalent_when_none() -> None:
    assert density_or_fallback(None) == approximate_density("PLA")

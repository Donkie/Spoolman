"""Tests for the OpenPrintTag NDEF/CBOR codec.

Builds synthetic NFC-V memory dumps (capability container + NDEF TLV wrapping a CBOR
meta/main/aux payload) rather than relying on hardware or a captured dump, since none
is available in this environment. These exercise the codec's own parsing logic and
its documented field semantics, but are not a substitute for real spec test vectors
or a hardware-read dump -- see the PR description for that gap.
"""

import uuid

import cbor2
import pytest

from spoolman.openprinttag_codec import (
    AUX_CONSUMED_WEIGHT,
    META_AUX_REGION_OFFSET,
    META_AUX_REGION_SIZE,
    MF_BRAND_NAME,
    MF_BRAND_UUID,
    MF_DENSITY,
    MF_DRYING_TEMPERATURE,
    MF_DRYING_TIME,
    MF_FILAMENT_DIAMETER,
    MF_GTIN,
    MF_INSTANCE_UUID,
    MF_MATERIAL_CLASS,
    MF_MATERIAL_NAME,
    MF_MATERIAL_TYPE,
    MF_MATERIAL_UUID,
    MF_MAX_BED_TEMPERATURE,
    MF_MAX_PRINT_TEMPERATURE,
    MF_MIN_BED_TEMPERATURE,
    MF_MIN_PRINT_TEMPERATURE,
    MF_NOMINAL_NETTO_FULL_WEIGHT,
    MF_PACKAGE_UUID,
    MF_PREHEAT_TEMPERATURE,
    MF_PRIMARY_COLOR,
    UUID_NS_BRAND,
    UUID_NS_INSTANCE,
    OpenPrintTagData,
    _decode_cbor_map,
    _parse_ndef_manual,
    decode_nfcv_memory,
    encode_aux_consumed_weight,
)

# --- Synthetic tag builders ---------------------------------------------------


def _cbor_payload(main: dict, aux: dict | None = None) -> bytes:
    """Build a meta+main(+aux) CBOR payload, as decode_nfcv_memory expects it.

    Main is placed immediately after meta (the default offset when meta omits
    META_MAIN_REGION_OFFSET). If aux is given, meta's aux-region-offset is
    computed to a fixed point since its own encoded size can shift meta's length.
    """
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
    """Build a single short NDEF record with TNF=media-type (0x02), no ID field."""
    mime_bytes = mime.encode("ascii")
    header = 0b11010010  # MB=1 ME=1 CF=0 SR=1 IL=0 TNF=0x02
    return bytes([header, len(mime_bytes), len(payload)]) + mime_bytes + payload


def _nfcv_memory(ndef_message: bytes) -> bytes:
    """Wrap an NDEF message in a minimal NFC-V capability container + TLV."""
    cc = bytes([0xE1, 0x40, 0x00, 0x01])
    tlv = bytes([0x03, len(ndef_message)]) + ndef_message + bytes([0xFE])
    return cc + tlv


def _build_tag(main: dict, aux: dict | None = None) -> bytes:
    payload = _cbor_payload(main, aux)
    ndef = _ndef_short_record("application/vnd.openprinttag", payload)
    return _nfcv_memory(ndef)


# --- decode_nfcv_memory ---------------------------------------------------------


def test_decode_full_tag_all_fields() -> None:
    instance_uuid = uuid.uuid4()
    brand_uuid = uuid.uuid4()
    material_uuid = uuid.uuid4()
    package_uuid = uuid.uuid4()

    main = {
        MF_INSTANCE_UUID: instance_uuid.bytes,
        MF_PACKAGE_UUID: package_uuid.bytes,
        MF_MATERIAL_UUID: material_uuid.bytes,
        MF_BRAND_UUID: brand_uuid.bytes,
        MF_GTIN: 1234567890123,
        MF_MATERIAL_CLASS: 0,  # FFF
        MF_MATERIAL_TYPE: 0,  # PLA
        MF_MATERIAL_NAME: "PLA Galaxy Black",
        MF_BRAND_NAME: "Prusament",
        MF_NOMINAL_NETTO_FULL_WEIGHT: 1000.0,
        MF_PRIMARY_COLOR: bytes([0x11, 0x22, 0x33, 0xFF]),
        MF_DENSITY: 1.24,
        MF_FILAMENT_DIAMETER: 1.75,
        MF_MIN_PRINT_TEMPERATURE: 210,
        MF_MAX_PRINT_TEMPERATURE: 230,
        MF_PREHEAT_TEMPERATURE: 50,
        MF_MIN_BED_TEMPERATURE: 60,
        MF_MAX_BED_TEMPERATURE: 70,
        MF_DRYING_TEMPERATURE: 45,
        MF_DRYING_TIME: 240,
    }
    aux = {AUX_CONSUMED_WEIGHT: 123.4}

    raw = _build_tag(main, aux)
    data = decode_nfcv_memory(raw, nfc_tag_uid=b"\x04\xa2\xb3\xc4")

    assert data.instance_uuid == str(instance_uuid)
    assert data.package_uuid == str(package_uuid)
    assert data.material_uuid == str(material_uuid)
    assert data.brand_uuid == str(brand_uuid)
    assert data.gtin == 1234567890123
    assert data.material_class == "FFF"
    assert data.material_type == "PLA"
    assert data.material_name == "PLA Galaxy Black"
    assert data.brand_name == "Prusament"
    assert data.nominal_netto_full_weight == 1000.0
    assert data.primary_color_hex == "112233"
    assert data.density == 1.24
    assert data.filament_diameter == 1.75
    assert data.min_print_temperature == 210
    assert data.max_print_temperature == 230
    assert data.preheat_temperature == 50
    assert data.min_bed_temperature == 60
    assert data.max_bed_temperature == 70
    assert data.drying_temperature == 45
    assert data.drying_time == 240
    assert data.consumed_weight == 123.4


def test_decode_minimal_tag_leaves_optional_fields_none() -> None:
    raw = _build_tag({MF_BRAND_NAME: "Sunlu"})
    data = decode_nfcv_memory(raw)

    assert data.brand_name == "Sunlu"
    assert data.instance_uuid is None
    assert data.material_type is None
    assert data.consumed_weight is None
    assert data.primary_color_hex is None


def test_decode_rgb_color_without_alpha_byte() -> None:
    raw = _build_tag({MF_PRIMARY_COLOR: bytes([0xAA, 0xBB, 0xCC])})
    data = decode_nfcv_memory(raw)

    assert data.primary_color_hex == "aabbcc"


def test_decode_unknown_material_type_falls_back_to_unknown_prefix() -> None:
    raw = _build_tag({MF_MATERIAL_TYPE: 999})
    data = decode_nfcv_memory(raw)

    assert data.material_type == "unknown_999"


def test_decode_unknown_material_class_falls_back_to_unknown_prefix() -> None:
    raw = _build_tag({MF_MATERIAL_CLASS: 7})
    data = decode_nfcv_memory(raw)

    assert data.material_class == "unknown_7"


def test_decode_missing_capability_container_magic_raises() -> None:
    raw = bytes([0x00, 0x40, 0x00, 0x01]) + bytes([0xFE])
    with pytest.raises(ValueError, match="Could not find OpenPrintTag"):
        decode_nfcv_memory(raw)


def test_decode_no_ndef_tlv_raises() -> None:
    raw = bytes([0xE1, 0x40, 0x00, 0x01, 0xFE])
    with pytest.raises(ValueError, match="Could not find OpenPrintTag"):
        decode_nfcv_memory(raw)


def test_decode_ndef_record_with_wrong_mime_type_raises() -> None:
    payload = _cbor_payload({MF_BRAND_NAME: "Sunlu"})
    ndef = _ndef_short_record("application/vnd.other", payload)
    raw = _nfcv_memory(ndef)

    with pytest.raises(ValueError, match="Could not find OpenPrintTag"):
        decode_nfcv_memory(raw)


def test_manual_ndef_parser_matches_the_wrapped_payload() -> None:
    """Exercise the no-ndeflib fallback directly.

    ndeflib is installed in dev and would otherwise always be preferred by
    _parse_ndef_records.
    """
    payload = _cbor_payload({MF_BRAND_NAME: "Sunlu"})
    ndef = _ndef_short_record("application/vnd.openprinttag", payload)

    assert _parse_ndef_manual(ndef) == payload


# --- OpenPrintTagData computed properties ----------------------------------------


def test_effective_weight_prefers_actual_over_nominal() -> None:
    data = OpenPrintTagData(nominal_netto_full_weight=1000.0, actual_netto_full_weight=987.0)
    assert data.effective_weight == 987.0


def test_effective_weight_falls_back_to_nominal() -> None:
    data = OpenPrintTagData(nominal_netto_full_weight=1000.0)
    assert data.effective_weight == 1000.0


def test_effective_diameter_defaults_to_175_when_absent() -> None:
    assert OpenPrintTagData().effective_diameter == 1.75


def test_effective_diameter_uses_explicit_value() -> None:
    assert OpenPrintTagData(filament_diameter=2.85).effective_diameter == 2.85


def test_effective_instance_uuid_prefers_explicit_value() -> None:
    explicit = str(uuid.uuid4())
    data = OpenPrintTagData(instance_uuid=explicit, nfc_tag_uid=b"\x01\x02\x03\x04")
    assert data.effective_instance_uuid == explicit


def test_effective_instance_uuid_derives_from_tag_uid_when_absent() -> None:
    tag_uid = b"\x04\xa2\xb3\xc4\xd5\xe6\xf7"
    data = OpenPrintTagData(nfc_tag_uid=tag_uid)
    assert data.effective_instance_uuid == str(uuid.uuid5(UUID_NS_INSTANCE, tag_uid))


def test_effective_instance_uuid_none_when_nothing_to_derive_from() -> None:
    assert OpenPrintTagData().effective_instance_uuid is None


def test_effective_brand_uuid_derives_from_brand_name() -> None:
    data = OpenPrintTagData(brand_name="Prusament")
    assert data.effective_brand_uuid == str(uuid.uuid5(UUID_NS_BRAND, b"Prusament"))


def test_effective_brand_uuid_prefers_explicit_value() -> None:
    explicit = str(uuid.uuid4())
    data = OpenPrintTagData(brand_uuid=explicit, brand_name="Prusament")
    assert data.effective_brand_uuid == explicit


# --- encode_aux_consumed_weight --------------------------------------------------


def test_encode_aux_consumed_weight_round_trip() -> None:
    payload = _cbor_payload({MF_BRAND_NAME: "Sunlu"}, aux={AUX_CONSUMED_WEIGHT: 10.0, 99: "keep-me"})
    meta, _ = _decode_cbor_map(payload)
    aux_offset = meta[META_AUX_REGION_OFFSET]

    updated = encode_aux_consumed_weight(payload, 55.5)

    aux_data, _ = _decode_cbor_map(updated[aux_offset:])
    assert aux_data[AUX_CONSUMED_WEIGHT] == 55.5
    assert aux_data[99] == "keep-me"  # unrelated aux fields survive the update
    # Region size and offset didn't move -- only bytes within them changed.
    assert len(updated) == len(payload)


def test_encode_aux_consumed_weight_when_existing_aux_is_not_a_map() -> None:
    """Cover a defensive fix made alongside these tests.

    A misaligned/corrupt aux region can decode as valid CBOR that isn't a map (a
    lone 0x00 byte decodes to the int 0). That must be treated as unusable existing
    data, not crash the encoder.
    """
    main_bytes = cbor2.dumps({MF_BRAND_NAME: "Sunlu"})
    meta = {META_AUX_REGION_OFFSET: 0, META_AUX_REGION_SIZE: 16}
    aux_offset = 0
    for _ in range(4):
        meta[META_AUX_REGION_OFFSET] = aux_offset
        meta_bytes = cbor2.dumps(meta)
        new_offset = len(meta_bytes) + len(main_bytes)
        if new_offset == aux_offset:
            break
        aux_offset = new_offset
    payload = meta_bytes + main_bytes + b"\x00" + b"\x00" * 15  # non-map aux content

    updated = encode_aux_consumed_weight(payload, 42.0)

    aux_data, _ = _decode_cbor_map(updated[aux_offset : aux_offset + 16])
    assert aux_data == {AUX_CONSUMED_WEIGHT: 42.0}


def test_encode_aux_consumed_weight_raises_when_no_aux_region() -> None:
    payload = _cbor_payload({MF_BRAND_NAME: "Sunlu"})  # no aux section at all
    with pytest.raises(ValueError, match="no aux region"):
        encode_aux_consumed_weight(payload, 10.0)


def test_encode_aux_consumed_weight_raises_when_it_overflows_the_region() -> None:
    """Reject an aux region too small to hold the re-encoded map.

    Must raise rather than silently truncating tag data.
    """
    main_bytes = cbor2.dumps({MF_BRAND_NAME: "Sunlu"})
    meta = {META_AUX_REGION_OFFSET: 0, META_AUX_REGION_SIZE: 1}
    aux_offset = 0
    for _ in range(4):
        meta[META_AUX_REGION_OFFSET] = aux_offset
        meta_bytes = cbor2.dumps(meta)
        new_offset = len(meta_bytes) + len(main_bytes)
        if new_offset == aux_offset:
            break
        aux_offset = new_offset
    # 1-byte aux region containing a valid empty CBOR map (0xa0): not enough room for
    # the re-encoded {0: <float>} map (>= 3 bytes).
    payload = meta_bytes + main_bytes + b"\xa0"

    with pytest.raises(ValueError, match="exceeds region size"):
        encode_aux_consumed_weight(payload, 12345.6789)

"""Tests for the OpenPrintTag NDEF/CBOR codec.

Builds synthetic NFC-V memory dumps (capability container + NDEF TLV wrapping a CBOR
meta/main/aux payload) rather than relying on hardware or a captured dump, since none
is available in this environment. These exercise the codec's own parsing logic and
its documented field semantics, but are not a substitute for real spec test vectors
or a hardware-read dump -- see the PR description for that gap.
"""

import pathlib
import uuid

import cbor2
import pytest

from spoolman.tags.openprinttag import (
    AUX_CONSUMED_WEIGHT,
    META_AUX_REGION_OFFSET,
    MF_BRAND_NAME,
    MF_BRAND_UUID,
    MF_DENSITY,
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
    MF_PRIMARY_COLOR,
    UUID_NS_BRAND,
    UUID_NS_INSTANCE,
    UUID_NS_MATERIAL,
    UUID_NS_PACKAGE,
    OpenPrintTagData,
    _parse_ndef_records,
    decode_nfcv_memory,
)

_FIXTURES_DIR = pathlib.Path(__file__).parent / "fixtures" / "openprinttag"

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
    """Build a single short NDEF record (1-byte payload length) with TNF=media-type."""
    mime_bytes = mime.encode("ascii")
    header = 0b11010010  # MB=1 ME=1 CF=0 SR=1 IL=0 TNF=0x02
    return bytes([header, len(mime_bytes), len(payload)]) + mime_bytes + payload


def _ndef_long_record(mime: str, payload: bytes) -> bytes:
    """Build a single standard NDEF record (4-byte payload length), TNF=media-type.

    Real tags use this form once payload exceeds 255 bytes -- a short record's 1-byte
    length field can't represent it. See tests/fixtures/openprinttag/README.md.
    """
    mime_bytes = mime.encode("ascii")
    header = 0b11000010  # MB=1 ME=1 CF=0 SR=0 IL=0 TNF=0x02
    return bytes([header, len(mime_bytes)]) + len(payload).to_bytes(4, "big") + mime_bytes + payload


def _ndef_record(mime: str, payload: bytes) -> bytes:
    """Build a short or long NDEF record, whichever the payload size requires."""
    if len(payload) <= 0xFF:
        return _ndef_short_record(mime, payload)
    return _ndef_long_record(mime, payload)


def _nfcv_memory(ndef_message: bytes) -> bytes:
    """Wrap an NDEF message in a minimal NFC-V capability container + TLV."""
    cc = bytes([0xE1, 0x40, 0x00, 0x01])
    if len(ndef_message) <= 0xFE:  # 0xFF is reserved to mean "three-byte length follows"
        tlv = bytes([0x03, len(ndef_message)]) + ndef_message
    else:
        tlv = bytes([0x03, 0xFF]) + len(ndef_message).to_bytes(2, "big") + ndef_message
    return cc + tlv + bytes([0xFE])


def _build_tag(main: dict, aux: dict | None = None) -> bytes:
    payload = _cbor_payload(main, aux)
    ndef = _ndef_record("application/vnd.openprinttag", payload)
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
        MF_MIN_BED_TEMPERATURE: 60,
        MF_MAX_BED_TEMPERATURE: 70,
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
    assert data.min_bed_temperature == 60
    assert data.max_bed_temperature == 70
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


def test_decode_unknown_material_type_is_left_unset() -> None:
    raw = _build_tag({MF_MATERIAL_TYPE: 999})
    data = decode_nfcv_memory(raw)

    assert data.material_type is None


def test_decode_unknown_material_class_is_left_unset() -> None:
    raw = _build_tag({MF_MATERIAL_CLASS: 7})
    data = decode_nfcv_memory(raw)

    assert data.material_class is None


def test_decode_wrong_typed_uuid_field_is_none_not_a_crash() -> None:
    """Regression test: a real tag truncated mid-write reproduced this.

    The truncation left an otherwise-valid CBOR map where MF_INSTANCE_UUID's value had
    been cut down to a bare int instead of a 16-byte string -- still syntactically valid
    CBOR, just the wrong type. _parse_uuid must not assume the field is bytes.
    """
    raw = _build_tag({MF_INSTANCE_UUID: 12345, MF_BRAND_NAME: "Sunlu"})
    data = decode_nfcv_memory(raw)

    assert data.instance_uuid is None
    assert data.brand_name == "Sunlu"


def test_decode_wrong_typed_color_field_is_none_not_a_crash() -> None:
    raw = _build_tag({MF_PRIMARY_COLOR: 12345})
    data = decode_nfcv_memory(raw)

    assert data.primary_color_hex is None


def _wrap_payload(payload: bytes) -> bytes:
    return _nfcv_memory(_ndef_record("application/vnd.openprinttag", payload))


# decode_nfcv_memory documents ValueError as its only failure. Tag memory that was read
# short, torn mid-write, or corrupted can break that in several ways, each of which used to
# escape as a different exception type (and so surface as a 500 from /tag/scan).
@pytest.mark.parametrize(
    "payload",
    [
        pytest.param(
            cbor2.dumps({}) + cbor2.dumps({MF_BRAND_NAME: "Sunlu", MF_MATERIAL_NAME: "PLA"})[:-3],
            id="main-cut-mid-item",
        ),
        pytest.param(b"", id="empty-payload"),
        pytest.param(cbor2.dumps(5) + cbor2.dumps({MF_BRAND_NAME: "Sunlu"}), id="meta-not-a-map"),
        pytest.param(cbor2.dumps({}) + cbor2.dumps(5), id="main-not-a-map"),
        pytest.param(cbor2.dumps({0: "x"}) + cbor2.dumps({MF_BRAND_NAME: "Sunlu"}), id="main-offset-not-an-int"),
        pytest.param(cbor2.dumps({0: -4}) + cbor2.dumps({MF_BRAND_NAME: "Sunlu"}), id="main-offset-negative"),
    ],
)
def test_decode_malformed_cbor_raises_value_error(payload: bytes) -> None:
    with pytest.raises(ValueError):  # noqa: PT011 -- any message; the type is the contract
        decode_nfcv_memory(_wrap_payload(payload))


def test_decode_invalid_aux_offset_is_ignored() -> None:
    """The aux section is optional, so a bad offset for it must not fail the whole decode."""
    payload = cbor2.dumps({META_AUX_REGION_OFFSET: "x"}) + cbor2.dumps({MF_BRAND_NAME: "Sunlu"})
    data = decode_nfcv_memory(_wrap_payload(payload))

    assert data.brand_name == "Sunlu"
    assert data.consumed_weight is None


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


def test_manual_ndef_parser_handles_long_form_records() -> None:
    """Real tags use the long (4-byte length) record form once payload exceeds 255 bytes."""
    payload = _cbor_payload({MF_BRAND_NAME: "Sunlu" * 60})
    assert len(payload) > 0xFF
    ndef = _ndef_long_record("application/vnd.openprinttag", payload)
    assert _parse_ndef_records(ndef) == payload


def test_decode_handles_three_byte_tlv_length_and_long_ndef_record() -> None:
    """Real tags combine both: NDEF TLV length >= 0xFF and a long-form NDEF record."""
    raw = _build_tag({MF_BRAND_NAME: "Sunlu" * 60})
    assert len(raw) > 0xFF + 8  # sanity: this really exercises the long-form paths
    data = decode_nfcv_memory(raw)

    assert data.brand_name == "Sunlu" * 60


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


def test_effective_material_uuid_derives_from_brand_uuid_and_material_name() -> None:
    data = OpenPrintTagData(brand_name="Prusament", material_name="PLA Galaxy Black")
    brand_uuid = uuid.UUID(data.effective_brand_uuid)
    expected = uuid.uuid5(UUID_NS_MATERIAL, brand_uuid.bytes + b"PLA Galaxy Black")
    assert data.effective_material_uuid == str(expected)


def test_effective_material_uuid_prefers_explicit_value() -> None:
    explicit = str(uuid.uuid4())
    data = OpenPrintTagData(material_uuid=explicit, brand_name="Prusament", material_name="PLA Galaxy Black")
    assert data.effective_material_uuid == explicit


def test_effective_material_uuid_none_without_brand_or_material_name() -> None:
    assert OpenPrintTagData().effective_material_uuid is None
    assert OpenPrintTagData(brand_name="Prusament").effective_material_uuid is None


def test_effective_package_uuid_derives_from_brand_uuid_and_gtin() -> None:
    data = OpenPrintTagData(brand_name="Prusament", gtin=8594173675001)
    brand_uuid = uuid.UUID(data.effective_brand_uuid)
    expected = uuid.uuid5(UUID_NS_PACKAGE, brand_uuid.bytes + b"8594173675001")
    assert data.effective_package_uuid == str(expected)


def test_effective_package_uuid_prefers_explicit_value() -> None:
    explicit = str(uuid.uuid4())
    data = OpenPrintTagData(package_uuid=explicit, brand_name="Prusament", gtin=8594173675001)
    assert data.effective_package_uuid == explicit


def test_effective_package_uuid_none_without_brand_or_gtin() -> None:
    assert OpenPrintTagData().effective_package_uuid is None
    assert OpenPrintTagData(brand_name="Prusament").effective_package_uuid is None


# --- Real Prusa fixtures ---------------------------------------------------------
# See tests/fixtures/openprinttag/README.md for provenance. Unlike every test above,
# these dumps are not built by this project's own encoder -- they're real OpenPrintTag
# wire data taken from Prusa's spec repo, so they're the actual proof that this codec
# reads a real tag, not just its own idea of one (in particular: real tags use the
# long-form NDEF record + 3-byte TLV length, which _build_tag never exercises).


def test_decode_real_prusa_sample_tag() -> None:
    raw = (_FIXTURES_DIR / "prusa_sample_tag.bin").read_bytes()
    data = decode_nfcv_memory(raw)

    assert data.material_class == "FFF"
    assert data.material_type == "PLA"
    assert data.material_name == "PLA Galaxy Black"
    assert data.brand_name == "Prusament"
    assert data.nominal_netto_full_weight == 1000.0
    assert data.actual_netto_full_weight == 1012.0
    assert data.primary_color_hex == "3d3e3d"
    assert data.min_print_temperature == 205
    assert data.max_print_temperature == 220
    assert data.min_bed_temperature == 40
    assert data.max_bed_temperature == 60
    assert data.instance_uuid == "473bb8cd-e129-45b8-9fcf-da1c3add9c47"


def test_decode_real_prusa_test_vector_01() -> None:
    """Cross-checked against 01_info.yaml / 01_input.yaml in Prusa's spec repo.

    Field values and the four derived UUIDs below are the spec repo's own stated
    ground truth for this exact dump (the UUIDs come from that repo's own
    utils/opt_check.py, given its declared tag_uid) -- not values this codec produced
    and is merely checked for consistency against itself.
    """
    raw = (_FIXTURES_DIR / "prusa_test01_data.bin").read_bytes()
    tag_uid = bytes.fromhex("E0040108662F6FBC")
    data = decode_nfcv_memory(raw, nfc_tag_uid=tag_uid)

    assert data.gtin == 8594173675001
    assert data.material_class == "FFF"
    assert data.material_type == "PLA"
    assert data.material_name == "PLA Prusa Galaxy Black"
    assert data.brand_name == "Prusament"
    assert data.nominal_netto_full_weight == 1000.0
    assert data.actual_netto_full_weight == 1012.0
    assert data.primary_color_hex == "3d3e3d"
    assert data.density == pytest.approx(1.24, abs=0.01)
    assert data.min_print_temperature == 205
    assert data.max_print_temperature == 225
    assert data.min_bed_temperature == 40
    assert data.max_bed_temperature == 60

    assert data.effective_brand_uuid == "ae5ff34e-298e-50c9-8f77-92a97fb30b09"
    assert data.effective_material_uuid == "1aaca54a-431f-5601-adf5-85dd018f487f"
    assert data.effective_package_uuid == "6e0aece2-1daf-5f2a-ba20-697968ec7d14"
    assert data.effective_instance_uuid == "bf63e92d-9ca5-53d7-9fab-ffdd0240c585"

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

from spoolman.tags import decode as tags_decode
from spoolman.tags.openprinttag import (
    AUX_CONSUMED_WEIGHT,
    META_AUX_REGION_OFFSET,
    MF_BRAND_NAME,
    MF_DENSITY,
    MF_FILAMENT_DIAMETER,
    MF_GTIN,
    MF_INSTANCE_UUID,
    MF_MATERIAL_CLASS,
    MF_MATERIAL_NAME,
    MF_MATERIAL_TYPE,
    MF_MAX_BED_TEMPERATURE,
    MF_MAX_PRINT_TEMPERATURE,
    MF_MIN_BED_TEMPERATURE,
    MF_MIN_PRINT_TEMPERATURE,
    MF_NOMINAL_NETTO_FULL_WEIGHT,
    MF_PRIMARY_COLOR,
    UUID_NS_INSTANCE,
    OpenPrintTagData,
    _decode_cbor_map,
    _parse_ndef_records,
    decode_nfcv_memory,
    uuid5_bytes,
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
    assert data.effective_instance_uuid == str(uuid5_bytes(UUID_NS_INSTANCE, tag_uid))


def test_effective_instance_uuid_none_when_nothing_to_derive_from() -> None:
    assert OpenPrintTagData().effective_instance_uuid is None


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


def test_decode_full_tag_all_fields() -> None:
    instance_uuid = uuid.uuid4()

    main = {
        MF_INSTANCE_UUID: instance_uuid.bytes,
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

    assert data.effective_instance_uuid == "bf63e92d-9ca5-53d7-9fab-ffdd0240c585"


def test_deeply_nested_cbor_is_refused_before_it_can_expand() -> None:
    """Shared references nested level by level grow a small tag into megabytes unless depth is capped."""
    nested: object = 1
    for _ in range(20):
        nested = [nested]
    with pytest.raises(ValueError, match="Invalid CBOR"):
        _decode_cbor_map(cbor2.dumps({0: nested}))


def test_shared_reference_chain_is_refused_by_depth_cap() -> None:
    """Each level reuses the level below twice (CBOR tags 28/29): small on the wire, huge when expanded."""
    shared: object = 1
    for _ in range(20):
        shared = [shared, shared]
    payload = cbor2.dumps({0: shared}, value_sharing=True)
    assert len(payload) < 200  # the sharing is what keeps it small
    with pytest.raises(ValueError, match="Invalid CBOR"):
        _decode_cbor_map(payload)


def test_semantic_tag_is_refused_even_though_it_is_too_shallow_to_trip_the_depth_cap() -> None:
    """A tag can sit two levels deep and still be the start of a real attack; depth alone won't catch that.

    cbor2 validates some tags' arguments (e.g. 260, ipaddress) and on a bad one builds its error
    message with repr(value). repr() isn't sharing-aware, so a tag wrapping a cheap
    shared-reference graph can make that one repr() call -- inside cbor2's own error path, before
    any of our code runs -- allocate gigabytes from a few hundred bytes on the wire, no matter how
    shallow the tag itself sits. The fix refuses every semantic tag outright, so this is
    deliberately shallow (map -> tag, two levels) to prove depth isn't what's catching it.
    """
    payload = cbor2.dumps({0: cbor2.CBORTag(260, b"\x01\x02\x03\x04")})
    with pytest.raises(ValueError, match="Invalid CBOR"):
        _decode_cbor_map(payload)


def test_semantic_tag_nested_inside_an_array_is_refused() -> None:
    """A tag doesn't have to be the top-level value to matter; it has to be found wherever it sits."""
    payload = cbor2.dumps({0: [1, 2, cbor2.CBORTag(0, "2021-01-01T00:00:00Z")]})
    with pytest.raises(ValueError, match="Invalid CBOR"):
        _decode_cbor_map(payload)


def test_semantic_tag_nested_inside_an_indefinite_length_array_is_refused() -> None:
    """cbor2.dumps never emits indefinite-length items, so this is hand-built to exercise that path.

    {0: [1, Tag(999, 0)]}, with the inner array encoded as indefinite-length (0x9f ... 0xff)
    instead of definite-length, since a real tag reader could hand either shape to the decoder.
    """
    payload = bytes.fromhex("a1009f01d903e700ff")
    with pytest.raises(ValueError, match="Invalid CBOR"):
        _decode_cbor_map(payload)


def shared_reference_bomb(levels: int) -> bytes:
    """Build a flat list of shareable arrays that each refer twice to the one before.

    The graph doubles per level at constant nesting depth (RFC 8746, tags 28 and 29) and ends in a
    malformed tag 260, whose error message cbor2 builds from repr(value). It is only ever fed to
    the guard, never to cbor2: the point is that it is refused first.
    """
    steps = "".join(f"d81c82d81d{k - 1:02x}d81d{k - 1:02x}" for k in range(1, levels))
    return bytes.fromhex("9f" + "d81c8100" + steps + f"d9010481d81d{levels - 1:02x}" + "ff")


@pytest.mark.parametrize(
    "hex_payload",
    [
        pytest.param("a1d81c0000", id="tag-as-a-map-key"),
        pytest.param("a100" + "7fd81c616161ff", id="tag-inside-an-indefinite-text-chunk"),
        pytest.param("a1005fd81c4101ff", id="tag-inside-an-indefinite-bytes-chunk"),
        pytest.param("bfd81c0000ff", id="tag-as-a-key-in-an-indefinite-map"),
        pytest.param("ff", id="stray-break-at-the-top-level"),
        pytest.param("a100" + "81ff", id="stray-break-in-a-definite-array"),
        pytest.param("a100" + "81ffd81c00", id="stray-break-in-an-array-followed-by-a-tag"),
        pytest.param("a100" + "ff", id="stray-break-as-a-map-value"),
        pytest.param("a100" + "5f7f6161ffff", id="text-chunk-inside-an-indefinite-bytes-string"),
        pytest.param("a100" + "5f" * 2000, id="nested-indefinite-strings-past-the-scan-depth"),
    ],
)
def test_guard_refuses_tags_and_stray_breaks_wherever_they_hide(hex_payload: str) -> None:
    with pytest.raises(ValueError, match="Invalid CBOR"):
        _decode_cbor_map(bytes.fromhex(hex_payload))


def _cbor2_must_not_see_tags(fp: object, *args: object, **kwargs: object) -> cbor2.CBORDecoder:
    """Stand in for CBORDecoder: behave normally, but fail if cbor2 is handed a tag 28 or 29."""
    data = fp.getvalue()  # type: ignore[attr-defined]
    assert b"\xd8\x1c" not in data
    assert b"\xd8\x1d" not in data
    return _REAL_CBOR_DECODER(fp, *args, **kwargs)  # type: ignore[arg-type]


_REAL_CBOR_DECODER = cbor2.CBORDecoder


@pytest.mark.parametrize("levels", [4, 14, 20])
def test_shared_reference_bomb_never_reaches_cbor2(monkeypatch: pytest.MonkeyPatch, levels: int) -> None:
    """Refuse tags 28/29 before cbor2: it would format their exponential expansion into an error message.

    A malformed tag 260 makes cbor2 build that message inside decode(), before any of our validation.
    Refusing the tags first is the only thing that stops it, so cbor2 must not be handed the bytes.
    """
    monkeypatch.setattr(cbor2, "CBORDecoder", _cbor2_must_not_see_tags)
    with pytest.raises(ValueError, match="Invalid CBOR"):
        _decode_cbor_map(shared_reference_bomb(levels))


def test_shared_reference_bomb_in_the_main_section_makes_the_tag_undecodable(monkeypatch: pytest.MonkeyPatch) -> None:
    raw = _nfcv_memory(_ndef_record("application/vnd.openprinttag", cbor2.dumps({}) + shared_reference_bomb(14)))
    monkeypatch.setattr(cbor2, "CBORDecoder", _cbor2_must_not_see_tags)

    with pytest.raises(ValueError, match="Invalid CBOR"):
        decode_nfcv_memory(raw)
    assert tags_decode.decode("openprinttag", raw) is None


def test_real_prusa_dumps_still_decode_with_the_guard_in_place() -> None:
    for name in ("prusa_sample_tag.bin", "prusa_test01_data.bin"):
        assert decode_nfcv_memory((_FIXTURES_DIR / name).read_bytes()).material_class == "FFF"


def test_zero_filament_diameter_is_kept_not_defaulted_to_175() -> None:
    """A tag stating 0 must reach the database layer as 0, which refuses it, not as a plausible 1.75."""
    raw = _build_tag({MF_FILAMENT_DIAMETER: 0})
    assert decode_nfcv_memory(raw).effective_diameter == 0


def test_overlong_text_field_makes_the_tag_undecodable() -> None:
    raw = _build_tag({MF_BRAND_NAME: "x" * 2000})
    with pytest.raises(TypeError):
        decode_nfcv_memory(raw)


def test_uid_reported_with_e0_last_is_read_in_specification_order() -> None:
    """The spec writes the NFC-V UID starting with E0; some readers report it reversed."""
    spec_order = bytes.fromhex("E0040108660715E3")
    reader_order = spec_order[::-1]
    raw = _build_tag({MF_BRAND_NAME: "Sunlu"})

    data = decode_nfcv_memory(raw, nfc_tag_uid=reader_order)

    assert data.effective_instance_uuid == str(uuid5_bytes(UUID_NS_INSTANCE, spec_order))

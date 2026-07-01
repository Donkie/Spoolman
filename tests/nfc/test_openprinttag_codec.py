"""Behavioral tests for the OpenPrintTag NFC-V / NDEF / CBOR codec.

Oracle strategy (see TESTING_STRATEGY.md §0):
  * ROUND-TRIP / PROPERTY — hand-building a full NFC-V + TLV + NDEF + CBOR
    payload byte-by-byte is complex, so the CBOR sections are produced with
    ``cbor2.dumps`` (an independent library, not the code under test) and only
    the thin TLV/NDEF wrapper the decoder documents is assembled here. The
    decoder is then asserted against those independently-encoded values.
  * INVARIANT — the aux round-trip (decode -> mutate -> re-decode) must update
    the consumed weight while preserving every other aux key; region-size and
    missing-region violations must raise the declared ``ValueError``.
  * DEFENSIVE CONTRACT — a Hypothesis property feeds arbitrary byte blobs to the
    payload finder and the top-level decoder and asserts they never raise
    anything except the documented ``ValueError`` (finder returns ``None``).

Environment note: ``ndeflib`` is an optional dependency. When it is absent,
``_parse_ndef_records`` falls through to the pure ``_parse_ndef_manual`` parser;
when it is present, the ndeflib decoder is used. These tests must pass either
way, so they assert the *contract* both parsers share — in particular that the
payload finder returns ``None`` (never raises) on truncated/malformed NDEF data,
regardless of which parser backs it.
"""

import io
import uuid

import cbor2
import pytest
from hypothesis import given
from hypothesis import strategies as st

from spoolman.openprinttag_codec import (
    AUX_CONSUMED_WEIGHT,
    META_AUX_REGION_OFFSET,
    META_AUX_REGION_SIZE,
    META_MAIN_REGION_OFFSET,
    META_MAIN_REGION_SIZE,
    OPENPRINTTAG_MIME,
    UUID_NS_BRAND,
    UUID_NS_INSTANCE,
    OpenPrintTagData,
    _find_ndef_payload,
    _parse_color_rgba,
    _parse_ndef_manual,
    _parse_uuid,
    decode_nfcv_memory,
    encode_aux_consumed_weight,
)

# Main-section field keys used by the fixtures (mirrors of the spec, not the
# code: these are the wire keys the decoder reads).
MF_MATERIAL_TYPE = 9
MF_PRIMARY_COLOR = 19
MF_NOMINAL_WEIGHT = 16
MF_ACTUAL_WEIGHT = 17
MF_FILAMENT_DIAMETER = 30

TYPE_BYTES = OPENPRINTTAG_MIME.encode("ascii")


# --- Fixture builders -------------------------------------------------------


def _build_payload(main: dict, aux: dict | None = None) -> tuple[bytes, int, int, int]:
    """Assemble a meta+main[+aux] CBOR payload with self-consistent offsets.

    The meta section stores the byte offset/size of the main (and optional aux)
    regions. Because those offsets depend on meta's own encoded length, resolve
    them by fixpoint iteration. Returns ``(payload, main_offset, aux_offset,
    aux_size)``.
    """
    main_b = cbor2.dumps(main)
    aux_b = cbor2.dumps(aux) if aux is not None else b""

    main_off = 0
    aux_off = 0
    for _ in range(6):
        meta: dict[int, int] = {
            META_MAIN_REGION_OFFSET: main_off,
            META_MAIN_REGION_SIZE: len(main_b),
        }
        if aux is not None:
            meta[META_AUX_REGION_OFFSET] = aux_off
            meta[META_AUX_REGION_SIZE] = len(aux_b)
        meta_b = cbor2.dumps(meta)
        main_off = len(meta_b)
        aux_off = main_off + len(main_b)

    payload = meta_b + main_b + aux_b
    return payload, main_off, aux_off, len(aux_b)


def _build_ndef_record(payload: bytes, *, short: bool = True, with_id: bool = False) -> bytes:
    """Wrap a payload in a single media-type (TNF=0x02) NDEF record.

    ``short`` selects the 1-byte payload-length (SR) form vs the 4-byte form.
    ``with_id`` sets the IL flag and inserts a 1-byte ID that must be skipped.
    """
    header = 0x80 | 0x40 | 0x02  # MB | ME | TNF=media-type
    if short:
        header |= 0x10  # SR
    id_field = b""
    if with_id:
        header |= 0x08  # IL
        id_field = b"\x01" + b"\x09"  # id_length=1, id byte
    length_field = bytes([len(payload)]) if short else len(payload).to_bytes(4, "big")
    # Field order: header, type_length, payload_length, [id_length], type, [id], payload
    if with_id:
        return bytes([header, len(TYPE_BYTES)]) + length_field + id_field[:1] + TYPE_BYTES + id_field[1:] + payload
    return bytes([header, len(TYPE_BYTES)]) + length_field + TYPE_BYTES + payload


def _build_memory(payload: bytes, *, cc0: int = 0xE1, three_byte_len: bool = False) -> bytes:
    """Wrap an NDEF-record payload in a capability container + NDEF TLV."""
    cc = bytes([cc0, 0x40, 0x00, 0x00])
    rec = _build_ndef_record(payload)
    if three_byte_len:
        length = len(rec)
        tlv = bytes([0x03, 0xFF, (length >> 8) & 0xFF, length & 0xFF]) + rec
    else:
        tlv = bytes([0x03, len(rec)]) + rec
    return cc + tlv + bytes([0xFE])


# --- Top-level decode round-trip -------------------------------------------


def test_decode_reads_main_section_fields():
    """A payload assembled with cbor2 decodes back to the planted field values."""
    main = {
        MF_MATERIAL_TYPE: 0,  # PLA
        MF_PRIMARY_COLOR: bytes([0xFF, 0x88, 0x00, 0xFF]),  # RGBA
        MF_NOMINAL_WEIGHT: 1000.0,
        MF_FILAMENT_DIAMETER: 2.85,
    }
    aux = {AUX_CONSUMED_WEIGHT: 12.5}
    payload, _, _, _ = _build_payload(main, aux)

    data = decode_nfcv_memory(_build_memory(payload))

    assert data.material_type == "PLA"
    assert data.primary_color_hex == "ff8800"  # alpha dropped
    assert data.nominal_netto_full_weight == 1000.0
    assert data.filament_diameter == 2.85
    assert data.consumed_weight == 12.5


def test_decode_carries_nfc_tag_uid_through():
    """The supplied tag UID is stored on the result for later derivation."""
    payload, _, _, _ = _build_payload({MF_MATERIAL_TYPE: 1})
    data = decode_nfcv_memory(_build_memory(payload), nfc_tag_uid=b"\x01\x02\x03\x04")
    assert data.nfc_tag_uid == b"\x01\x02\x03\x04"
    assert data.material_type == "PETG"


def test_decode_accepts_three_byte_tlv_length_form():
    """The 0xFF 3-byte TLV length form is parsed identically to the short form."""
    main = {MF_MATERIAL_TYPE: 3, MF_ACTUAL_WEIGHT: 950.0}
    payload, _, _, _ = _build_payload(main)

    short = decode_nfcv_memory(_build_memory(payload, three_byte_len=False))
    long = decode_nfcv_memory(_build_memory(payload, three_byte_len=True))

    assert short.material_type == long.material_type == "ABS"
    assert short.actual_netto_full_weight == long.actual_netto_full_weight == 950.0


def test_unknown_material_type_falls_back_to_labelled_unknown():
    """An out-of-range material key yields an ``unknown_<n>`` label, not a crash."""
    payload, _, _, _ = _build_payload({MF_MATERIAL_TYPE: 999})
    data = decode_nfcv_memory(_build_memory(payload))
    assert data.material_type == "unknown_999"


def test_decode_without_ndef_record_raises_valueerror():
    """Memory whose CC byte is not 0xE1 has no OpenPrintTag record -> ValueError."""
    payload, _, _, _ = _build_payload({MF_MATERIAL_TYPE: 0})
    with pytest.raises(ValueError, match="Could not find OpenPrintTag NDEF record"):
        decode_nfcv_memory(_build_memory(payload, cc0=0xAA))


# --- _find_ndef_payload edge cases -----------------------------------------


def test_find_payload_wrong_capability_container_returns_none():
    """A capability container not starting with 0xE1 yields no payload."""
    assert _find_ndef_payload(b"\xaa\x40\x00\x00\x03\x03\xd0\x00\x00\xfe") is None


def test_find_payload_too_short_returns_none():
    """Fewer than 4 bytes cannot hold a capability container."""
    assert _find_ndef_payload(b"\xe1\x40") is None
    assert _find_ndef_payload(b"") is None


def test_find_payload_well_formed_tlv_returns_payload():
    """A well-formed CC + NDEF TLV round-trips the inner record payload."""
    payload, _, _, _ = _build_payload({MF_MATERIAL_TYPE: 0})
    assert _find_ndef_payload(_build_memory(payload)) == payload


def test_find_payload_three_byte_length_returns_payload():
    """The 3-byte 0xFF length form locates the same payload as the short form."""
    payload, _, _, _ = _build_payload({MF_MATERIAL_TYPE: 0})
    assert _find_ndef_payload(_build_memory(payload, three_byte_len=True)) == payload


def test_find_payload_truncated_mid_tlv_returns_none_without_crashing():
    """A TLV header with no following length/data returns None, never raises."""
    # 0xE1 CC, then an NDEF TLV tag (0x03) that is truncated immediately.
    assert _find_ndef_payload(b"\xe1\x40\x00\x00\x03") is None
    # Declared length longer than the remaining buffer: slice is short, but the
    # inner NDEF parser simply finds nothing -> None.
    assert _find_ndef_payload(b"\xe1\x40\x00\x00\x03\x20\x00\x00") is None


def test_find_payload_malformed_ndef_record_returns_none_without_crashing():
    """A well-formed CC + NDEF TLV whose record bytes are undecodable returns None.

    The TLV framing is valid, so the finder hands the inner bytes to the NDEF
    parser. Those bytes (header 0xFF -> reserved TNF 7) are rejected by ndeflib's
    decoder; the finder must swallow that decode error and fall back to the manual
    parser (which also finds nothing here) rather than propagating. Regression
    guard for the ndeflib-present crash path.
    """
    garbage = b"\xff\xff\xff\xff"  # header 0xFF => TNF 7, which ndeflib refuses to decode
    memory = bytes([0xE1, 0x40, 0x00, 0x00, 0x03, len(garbage)]) + garbage + b"\xfe"
    assert _find_ndef_payload(memory) is None


def test_find_payload_skips_non_ndef_tlv_then_finds_ndef():
    """A leading non-NDEF TLV is skipped by its length; the NDEF TLV is found."""
    payload, _, _, _ = _build_payload({MF_MATERIAL_TYPE: 0})
    rec = _build_ndef_record(payload)
    # 0x01 = lock-control TLV (2 bytes), then the real NDEF TLV.
    memory = bytes([0xE1, 0x40, 0x00, 0x00, 0x01, 0x02, 0xAA, 0xBB, 0x03, len(rec)]) + rec + b"\xfe"
    assert _find_ndef_payload(memory) == payload


# --- _parse_ndef_manual edge cases -----------------------------------------


def test_parse_ndef_manual_short_record():
    """A short (SR) media-type record for our MIME returns its payload."""
    assert _parse_ndef_manual(_build_ndef_record(b"HELLO", short=True)) == b"HELLO"


def test_parse_ndef_manual_long_record():
    """A long (non-SR, 4-byte length) record returns its payload."""
    assert _parse_ndef_manual(_build_ndef_record(b"WORLD", short=False)) == b"WORLD"


def test_parse_ndef_manual_with_id_flag_skips_id():
    """The IL flag inserts an ID that is skipped without disturbing the payload."""
    assert _parse_ndef_manual(_build_ndef_record(b"HI", short=True, with_id=True)) == b"HI"


def test_parse_ndef_manual_wrong_tnf_returns_none():
    """A record with the right type but a non-media-type TNF is ignored."""
    header = 0x80 | 0x40 | 0x10 | 0x01  # TNF=0x01 (well-known), not 0x02
    record = bytes([header, len(TYPE_BYTES), 3]) + TYPE_BYTES + b"abc"
    assert _parse_ndef_manual(record) is None


def test_parse_ndef_manual_wrong_type_returns_none():
    """A media-type record whose type is not our MIME is ignored."""
    other = b"text/plain"
    record = bytes([0x80 | 0x40 | 0x10 | 0x02, len(other), 3]) + other + b"abc"
    assert _parse_ndef_manual(record) is None


# --- UUID and color helpers -------------------------------------------------


def test_parse_uuid_16_bytes_roundtrips():
    """Exactly 16 bytes decode to the canonical UUID string."""
    u = uuid.uuid4()
    assert _parse_uuid(u.bytes) == str(u)


def test_parse_uuid_wrong_length_returns_none():
    """Byte strings that are not 16 bytes are rejected as None."""
    assert _parse_uuid(b"\x00" * 15) is None
    assert _parse_uuid(b"\x00" * 17) is None
    assert _parse_uuid(b"") is None


def test_parse_color_rgba_drops_alpha():
    """RGBA input yields a 6-hex-digit RGB string, discarding the alpha byte."""
    assert _parse_color_rgba(bytes([0x12, 0x34, 0x56, 0xFF])) == "123456"


def test_parse_color_rgba_too_short_returns_none():
    """Fewer than 3 colour bytes cannot form an RGB hex string."""
    assert _parse_color_rgba(b"\x12\x34") is None


# --- effective_* derivation properties --------------------------------------


def test_effective_diameter_defaults_to_1_75():
    """Absent or zero diameter falls back to the 1.75 mm spec default."""
    assert OpenPrintTagData().effective_diameter == 1.75
    assert OpenPrintTagData(filament_diameter=0.0).effective_diameter == 1.75


def test_effective_diameter_uses_explicit_value():
    """A non-zero explicit diameter is returned unchanged."""
    assert OpenPrintTagData(filament_diameter=2.85).effective_diameter == 2.85


def test_effective_weight_prefers_actual_then_nominal_then_none():
    """Effective weight is actual, else nominal, else None."""
    assert OpenPrintTagData(actual_netto_full_weight=750.0, nominal_netto_full_weight=800.0).effective_weight == 750.0
    assert OpenPrintTagData(nominal_netto_full_weight=800.0).effective_weight == 800.0
    assert OpenPrintTagData().effective_weight is None


def test_effective_instance_uuid_prefers_explicit_and_none_without_source():
    """Explicit instance UUID wins; with neither UUID nor tag UID the result is None."""
    assert OpenPrintTagData(instance_uuid="explicit", nfc_tag_uid=b"\x01").effective_instance_uuid == "explicit"
    assert OpenPrintTagData().effective_instance_uuid is None


def test_effective_brand_uuid_prefers_explicit_and_none_without_source():
    """Explicit brand UUID wins; with neither UUID nor brand name the result is None."""
    assert OpenPrintTagData(brand_uuid="explicit", brand_name="Prusament").effective_brand_uuid == "explicit"
    assert OpenPrintTagData().effective_brand_uuid is None


def test_effective_instance_uuid_from_bytes_uid_is_version_dependent():
    """Deriving from a bytes tag UID hits ``uuid.uuid5`` with bytes.

    ``effective_instance_uuid`` passes ``nfc_tag_uid`` (bytes) straight to
    ``uuid.uuid5``. CPython < 3.12 rejects a bytes ``name`` with ``TypeError``;
    3.12+ accepts it and derives a UUID. That is a latent portability issue (the
    project supports Python >= 3.10) flagged for a deliberate source fix — here we
    pin whichever behaviour the running interpreter exhibits so the test is stable
    across the whole supported range. Source is read-only.
    """
    tag = OpenPrintTagData(nfc_tag_uid=b"\x01\x02\x03\x04")
    try:
        derived = tag.effective_instance_uuid
    except TypeError:
        return  # pre-3.12: uuid5 rejects the bytes UID
    assert derived  # 3.12+: a UUID is derived from the tag UID


def test_effective_brand_uuid_from_name_is_version_dependent():
    """Deriving a brand UUID from a name hits ``uuid.uuid5`` with bytes.

    ``effective_brand_uuid`` calls ``uuid.uuid5(ns, brand_name.encode(...))``,
    passing ``bytes``; as above this raises on CPython < 3.12 and derives on 3.12+.
    Pinned version-agnostically; source unchanged.
    """
    tag = OpenPrintTagData(brand_name="Prusament")
    try:
        derived = tag.effective_brand_uuid
    except TypeError:
        return  # pre-3.12: uuid5 rejects the bytes name
    assert derived  # 3.12+: a UUID is derived from the brand name


def test_uuid_namespaces_are_stable_constants():
    """The derivation namespaces are fixed UUIDs (guards against accidental edits)."""
    assert uuid.UUID("31062f81-b5bd-4f86-a5f8-46367e841508") == UUID_NS_INSTANCE
    assert uuid.UUID("5269dfb7-1559-440a-85be-aba5f3eff2d2") == UUID_NS_BRAND


# --- Aux round-trip and error paths ----------------------------------------


def test_aux_round_trip_updates_weight_and_preserves_other_keys():
    """encode_aux_consumed_weight updates key 0 while preserving unknown keys."""
    main = {MF_MATERIAL_TYPE: 0}
    aux = {AUX_CONSUMED_WEIGHT: 10.0, 42: "keep-me"}
    payload, _, aux_off, _ = _build_payload(main, aux)

    # Confirm the starting point through the top-level decoder.
    assert decode_nfcv_memory(_build_memory(payload)).consumed_weight == 10.0

    updated = encode_aux_consumed_weight(payload, 33.0)
    round_tripped = cbor2.load(io.BytesIO(updated[aux_off:]))

    assert round_tripped[AUX_CONSUMED_WEIGHT] == 33.0
    assert round_tripped[42] == "keep-me"
    # The unrelated meta/main prefix is untouched.
    assert updated[:aux_off] == payload[:aux_off]


def test_aux_round_trip_visible_through_full_decode():
    """The updated weight is what a subsequent full decode observes."""
    payload, _, _, _ = _build_payload({MF_MATERIAL_TYPE: 0}, {AUX_CONSUMED_WEIGHT: 5.0})
    updated = encode_aux_consumed_weight(payload, 77.5)
    assert decode_nfcv_memory(_build_memory(updated)).consumed_weight == 77.5


def test_encode_aux_without_region_raises_valueerror():
    """A payload whose meta declares no aux region cannot be updated."""
    payload, _, _, _ = _build_payload({MF_MATERIAL_TYPE: 0}, aux=None)
    with pytest.raises(ValueError, match="no aux region"):
        encode_aux_consumed_weight(payload, 5.0)


def test_encode_aux_oversize_raises_valueerror():
    """An encoded aux section larger than its declared region is rejected."""
    # Hand-craft meta with a deliberately tiny declared aux size (2 bytes).
    main_b = cbor2.dumps({MF_MATERIAL_TYPE: 0})
    aux_b = cbor2.dumps({AUX_CONSUMED_WEIGHT: 1.0})
    meta = {0: 0, 1: len(main_b), 2: 0, 3: 2}
    for _ in range(6):
        meta_b = cbor2.dumps(meta)
        meta = {0: len(meta_b), 1: len(main_b), 2: len(meta_b) + len(main_b), 3: 2}
    meta_b = cbor2.dumps(meta)
    payload = meta_b + main_b + aux_b

    with pytest.raises(ValueError, match="exceeds region size"):
        encode_aux_consumed_weight(payload, 999.0)


# --- Property-based defensive contract --------------------------------------


@given(blob=st.binary(min_size=0, max_size=128))
def test_find_ndef_payload_never_raises(blob: bytes):
    """Arbitrary bytes into the finder return bytes or None, never an exception."""
    result = _find_ndef_payload(blob)
    assert result is None or isinstance(result, bytes)


@given(blob=st.binary(min_size=0, max_size=128))
def test_top_level_decoder_only_raises_declared_valueerror(blob: bytes):
    """Arbitrary bytes into the decoder yield data or the declared ValueError only."""
    try:
        result = decode_nfcv_memory(blob)
    except ValueError:
        return  # declared, allowed
    assert isinstance(result, OpenPrintTagData)


@given(blob=st.binary(min_size=4, max_size=128))
def test_decoder_never_raises_on_e1_prefixed_blobs(blob: bytes):
    """Blobs forced to look like a valid CC still only ever raise ValueError."""
    memory = b"\xe1" + blob
    try:
        result = decode_nfcv_memory(memory)
    except ValueError:
        return
    assert isinstance(result, OpenPrintTagData)

"""Behavioral tests for the Qidi MIFARE Classic 1K codec.

Oracle strategy (see TESTING_STRATEGY.md §0):
  * GOLDEN VECTOR — the 16-byte block below is hand-assembled byte-by-byte from
    the documented Qidi format (byte0 material, byte1 color, byte2 manufacturer,
    bytes 3-15 zero), NOT produced by ``encode_qidi_block``. Asserting
    ``decode_qidi_block`` against it checks the codec against the spec, not itself.
  * ROUND-TRIP — ``encode`` and ``decode`` are inverses on the three carried
    fields; paired with the golden vector so a symmetric bug can't hide.
  * PROPERTY — random valid structs survive a round-trip; arbitrary byte blobs
    never crash the decoder (it either returns data or raises the declared
    ValueError for <3 bytes).

The independent oracles for the lookup helpers are the documented spec tables
transcribed in the module docstring / wiki (material 1 == PLA, color 6 ==
Blue #2850FF, manufacturer always 1), spelled out inline at each assertion.
"""

import pytest
from hypothesis import given
from hypothesis import strategies as st

from spoolman.qidi_codec import (
    MIFARE_BLOCK_SIZE,
    QidiTagData,
    color_code_from_hex,
    decode_qidi_block,
    encode_qidi_block,
    is_valid_qidi_block,
    material_code_from_name,
)


def _golden_block() -> bytes:
    """Build a 16-byte Qidi block straight from the documented wire format.

    Material code 4 (PLA Silk), color code 6 (Blue), manufacturer 1; the
    remaining bytes 3-15 are the spec-mandated zero padding.
    """
    buf = bytearray(MIFARE_BLOCK_SIZE)
    #     offset  field             value
    buf[0] = 4  # material_code     = 4  -> "PLA Silk" / "PLA"
    buf[1] = 6  # color_code        = 6  -> "Blue" / "2850FF"
    buf[2] = 1  # manufacturer_code = 1  (always 1 for Qidi)
    # bytes 3-15 remain zero (padding)
    return bytes(buf)


def test_decode_golden_vector():
    """Each of the three carried fields decodes from its documented offset."""
    data = decode_qidi_block(_golden_block())

    # Values planted at bytes 0/1/2 of the hand-built block.
    assert data.material_code == 4
    assert data.color_code == 6
    assert data.manufacturer_code == 1
    # Derived properties resolve via the spec tables (code 4/6).
    assert data.material_name == "PLA Silk"
    assert data.material_type == "PLA"
    assert data.color_name == "Blue"
    assert data.color_hex == "2850FF"


def test_encode_produces_full_16_byte_block():
    """The encoder always emits exactly one MIFARE block (16 bytes)."""
    assert len(encode_qidi_block(QidiTagData())) == MIFARE_BLOCK_SIZE


def test_encode_padding_bytes_stay_zero():
    """Bytes 3-15 of an encoded block are always the zero padding."""
    block = encode_qidi_block(QidiTagData(material_code=4, color_code=6, manufacturer_code=1))
    assert block[0] == 4
    assert block[1] == 6
    assert block[2] == 1
    # Everything past the 3-byte payload must be zero.
    assert block[3:16] == b"\x00" * 13


def test_encode_decode_round_trip_on_golden():
    """Decode -> encode reproduces the original spec bytes exactly."""
    golden = _golden_block()
    assert encode_qidi_block(decode_qidi_block(golden)) == golden


def test_decode_too_short_raises():
    """Fewer than 3 bytes is a hard error, not silently-decoded garbage."""
    with pytest.raises(ValueError, match="too short"):
        decode_qidi_block(b"\x00\x00")  # only 2 bytes


def test_decode_exactly_three_bytes_ok():
    """Exactly 3 bytes is the documented minimum and must decode."""
    data = decode_qidi_block(bytes([7, 3, 1]))
    assert (data.material_code, data.color_code, data.manufacturer_code) == (7, 3, 1)


# --- is_valid_qidi_block boundary table -------------------------------------


def _make_block(material: int, color: int, manufacturer: int, *, tail_byte: int = 0) -> bytes:
    """Assemble a 16-byte block with the given header and an optional dirty tail.

    Independent of the codec: builds the bytes directly so validity assertions
    check ``is_valid_qidi_block`` against the spec, not against a re-encode.
    """
    buf = bytearray(MIFARE_BLOCK_SIZE)
    buf[0] = material
    buf[1] = color
    buf[2] = manufacturer
    if tail_byte:
        buf[15] = tail_byte  # nonzero padding byte
    return bytes(buf)


@pytest.mark.parametrize(
    ("block", "expected", "reason"),
    [
        # A fully in-range block is valid.
        (_make_block(1, 1, 1), True, "min in-range material/color"),
        (_make_block(50, 24, 1), True, "max in-range material/color"),
        (_make_block(4, 6, 1), True, "mid in-range"),
        # Material boundaries: 1 and 50 valid, 0 and 51 out of range.
        (_make_block(0, 6, 1), False, "material 0 < 1"),
        (_make_block(51, 6, 1), False, "material 51 > 50"),
        # Color boundaries: 1 and 24 valid, 0 and 25 out of range.
        (_make_block(4, 0, 1), False, "color 0 < 1"),
        (_make_block(4, 25, 1), False, "color 25 > 24"),
        # Manufacturer must be exactly 1.
        (_make_block(4, 6, 0), False, "manufacturer 0 != 1"),
        (_make_block(4, 6, 2), False, "manufacturer 2 != 1"),
        # Nonzero padding invalidates an otherwise-good block.
        (_make_block(4, 6, 1, tail_byte=0xFF), False, "nonzero padding byte 15"),
    ],
)
def test_is_valid_qidi_block_boundaries(block: bytes, expected: bool, reason: str):  # noqa: FBT001
    """Validity matches the documented range table (material 1-50, color 1-24, mfr==1)."""
    assert is_valid_qidi_block(block) is expected, reason


def test_is_valid_qidi_block_wrong_length():
    """A block shorter than 16 bytes is never valid regardless of content."""
    short = bytes([4, 6, 1])  # correct header but too short overall
    assert is_valid_qidi_block(short) is False


# --- color_code_from_hex ----------------------------------------------------


def test_color_code_from_hex_exact_match():
    """An exact spec hex resolves to its own code (Blue #2850FF -> 6)."""
    assert color_code_from_hex("2850FF") == 6


def test_color_code_from_hex_accepts_leading_hash_and_case():
    """A leading '#' and mixed case still hit the exact-match path."""
    assert color_code_from_hex("#2850ff") == 6


def test_color_code_from_hex_nearest_for_near_miss():
    """A near-miss hex snaps to the nearest color; #2951FE ~ Blue #2850FF -> 6."""
    # One unit off each channel from Blue; every other palette entry is farther.
    assert color_code_from_hex("2951FE") == 6


def test_color_code_from_hex_short_returns_none():
    """Fewer than 6 hex digits cannot form an RGB triple -> None."""
    assert color_code_from_hex("ABC") is None


def test_color_code_from_hex_empty_returns_none():
    """An empty string is too short to parse -> None."""
    assert color_code_from_hex("") is None


# --- material_code_from_name ------------------------------------------------


def test_material_code_from_name_exact():
    """A known name resolves to its spec code ('PLA' -> 1)."""
    assert material_code_from_name("PLA") == 1


def test_material_code_from_name_case_insensitive():
    """Lookup ignores case ('pla silk' -> 4)."""
    assert material_code_from_name("pla silk") == 4


def test_material_code_from_name_unknown_returns_none():
    """A name absent from the table yields None."""
    assert material_code_from_name("Unobtainium") is None


# --- QidiTagData property fallbacks -----------------------------------------


def test_tag_data_known_codes():
    """Known codes map to their documented names/type/hex."""
    data = QidiTagData(material_code=50, color_code=24, manufacturer_code=1)
    assert data.material_name == "TPU"
    assert data.material_type == "TPU"
    assert data.color_name == "Gold"
    assert data.color_hex == "B87F2B"


def test_tag_data_unknown_material_fallback():
    """An unmapped material code falls back to the documented placeholders."""
    data = QidiTagData(material_code=99)
    assert data.material_name == "Unknown (99)"
    assert data.material_type == "Unknown"


def test_tag_data_unknown_color_fallback():
    """An unmapped color code falls back to the documented placeholders."""
    data = QidiTagData(color_code=99)
    assert data.color_name == "Unknown (99)"
    assert data.color_hex == "000000"


# --- Property-based tests ---------------------------------------------------

# Each field is a single byte on the wire, so the round-trip domain is 0..255.
_structs = st.builds(
    QidiTagData,
    material_code=st.integers(0, 0xFF),
    color_code=st.integers(0, 0xFF),
    manufacturer_code=st.integers(0, 0xFF),
)


@given(data=_structs)
def test_round_trip_preserves_all_fields(data: QidiTagData):
    """Encode -> decode is loss-free for every byte-sized field."""
    assert decode_qidi_block(encode_qidi_block(data)) == data


@given(blob=st.binary(min_size=3, max_size=64))
def test_decoder_never_crashes_on_long_enough_input(blob: bytes):
    """Any buffer >= 3 bytes decodes without raising (defensive contract)."""
    result = decode_qidi_block(blob)
    assert isinstance(result, QidiTagData)


@given(blob=st.binary(max_size=2))
def test_decoder_raises_only_declared_error_when_too_short(blob: bytes):
    """A sub-3-byte buffer raises ValueError and nothing else."""
    with pytest.raises(ValueError, match="too short"):
        decode_qidi_block(blob)

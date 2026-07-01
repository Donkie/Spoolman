"""Behavioral tests for the TigerTag NTAG213 codec.

Oracle strategy (see TESTING_STRATEGY.md §0):
  * GOLDEN VECTOR — the payload below is hand-assembled byte-by-byte from the
    documented TigerTag wire format, NOT produced by ``encode_ntag213``. Asserting
    ``decode_ntag213`` against it therefore checks the codec against the spec, not
    against itself.
  * ROUND-TRIP — ``encode`` and ``decode`` are inverses. Paired with the golden
    vector so a symmetric encode+decode bug can't hide.
  * PROPERTY — random structs survive a round-trip; arbitrary byte blobs never
    crash the decoder (it either returns data or raises the declared ValueError).
"""

import struct

import pytest
from hypothesis import given
from hypothesis import strategies as st

from spoolman.tigertag_codec import (
    NTAG213_USER_BYTES,
    TIGERTAG_MAKER_V1,
    TigerTagData,
    decode_ntag213,
    encode_ntag213,
    is_tigertag,
)


def _golden_payload() -> bytes:
    """Build a 144-byte TigerTag payload straight from the wire spec.

    Each field is written at its documented offset with a known value; the
    expected decoded values are asserted in ``test_decode_golden_vector``.
    """
    buf = bytearray(NTAG213_USER_BYTES)
    #        offset  bytes         field                       value
    buf[0:4] = bytes.fromhex("5bf59264")  # id_tigertag  = TigerTag Maker v1
    buf[4:8] = bytes.fromhex("0000002a")  # id_product   = 42
    buf[8:10] = bytes.fromhex("0007")  # id_material  = 7
    buf[10] = 0x03  # aspect_1     = 3
    buf[11] = 0x00  # aspect_2     = 0 (ignored by decoder)
    buf[12] = 0x8E  # id_type      = 142 (filament)
    buf[13] = 0x01  # id_diameter  = 1  -> 1.75 mm
    buf[14:16] = bytes.fromhex("0005")  # id_brand     = 5
    buf[16:20] = bytes.fromhex("ff8800ff")  # color RGBA  = #ff8800, alpha 255
    buf[20:24] = bytes.fromhex("0003e801")  # weight_unit = (1000<<8)|1 -> 1000 g
    buf[24:26] = bytes.fromhex("00d2")  # nozzle_min   = 210
    buf[26:28] = bytes.fromhex("00e6")  # nozzle_max   = 230
    buf[28] = 0x50  # drying_temp  = 80
    buf[29] = 0x08  # drying_time  = 8 h
    buf[30:32] = bytes.fromhex("0000")  # reserved
    buf[32:36] = bytes.fromhex("30000000")  # timestamp  = 0x30000000
    buf[36] = 0x3C  # bed_temp_min = 60
    buf[37] = 0x46  # bed_temp_max = 70
    buf[54:58] = bytes.fromhex("0001f600")  # emoji       = U+1F600
    msg = b"PLA Orange"
    buf[58 : 58 + len(msg)] = msg  # user_message (null-padded to 28)
    return bytes(buf)


def test_decode_golden_vector():
    """Every field decodes to the value planted at its documented offset."""
    data = decode_ntag213(_golden_payload())

    assert data.id_tigertag == TIGERTAG_MAKER_V1
    assert is_tigertag(data.id_tigertag) is True
    assert data.id_product == 42
    assert data.id_material == 7
    assert data.id_aspect == 3
    assert data.id_type == 142
    assert data.id_diameter == 1
    assert data.diameter_mm == 1.75
    assert data.id_brand == 5
    assert (data.color_r, data.color_g, data.color_b, data.color_a) == (255, 136, 0, 255)
    assert data.color_hex == "ff8800"
    assert data.weight == 1000
    assert data.nozzle_temp == 210
    assert data.nozzle_temp_max == 230
    assert data.drying_temp == 80
    assert data.drying_duration == 8
    assert data.timestamp == 0x30000000
    assert data.bed_temp == 60
    assert data.bed_temp_max == 70
    assert data.emoji == 0x0001F600
    assert data.user_message == "PLA Orange"


def test_encode_produces_full_ntag213_page():
    """The encoder always emits exactly the NTAG213 user-memory size."""
    assert len(encode_ntag213(TigerTagData())) == NTAG213_USER_BYTES


def test_encode_decode_round_trip_on_golden():
    """Decode -> encode reproduces the original spec bytes exactly."""
    golden = _golden_payload()
    assert encode_ntag213(decode_ntag213(golden)) == golden


def test_decode_too_short_raises():
    """A buffer smaller than the 36-byte header is a hard error, not garbage."""
    with pytest.raises(ValueError, match="too short"):
        decode_ntag213(b"\x00" * 35)


def test_user_message_truncated_to_28_utf8_bytes():
    """Messages longer than the 28-byte field are truncated, not overflowed."""
    data = TigerTagData(user_message="x" * 40)
    decoded = decode_ntag213(encode_ntag213(data))
    assert decoded.user_message == "x" * 28


def test_non_utf8_message_bytes_are_replaced_not_raised():
    """Invalid UTF-8 in the message region decodes with replacement chars."""
    payload = bytearray(_golden_payload())
    payload[58:62] = b"\xff\xfe\xfd\x00"  # invalid UTF-8, then terminator
    data = decode_ntag213(bytes(payload))
    assert "�" in data.user_message  # replacement char, no exception


# --- Property-based tests ---------------------------------------------------

# Field ranges chosen to match the wire encoding (byte / uint16 / 24-bit weight).
_structs = st.builds(
    TigerTagData,
    id_tigertag=st.integers(0, 0xFFFFFFFF),
    id_product=st.integers(0, 0xFFFFFFFF),
    id_material=st.integers(0, 0xFFFF),
    id_aspect=st.integers(0, 0xFF),
    id_type=st.integers(0, 0xFF),
    id_diameter=st.integers(0, 0xFF),
    id_brand=st.integers(0, 0xFFFF),
    color_r=st.integers(0, 0xFF),
    color_g=st.integers(0, 0xFF),
    color_b=st.integers(0, 0xFF),
    color_a=st.integers(0, 0xFF),
    weight=st.integers(0, 0xFFFFFF),
    nozzle_temp=st.integers(0, 0xFFFF),
    nozzle_temp_max=st.integers(0, 0xFFFF),
    drying_temp=st.integers(0, 0xFF),
    drying_duration=st.integers(0, 0xFF),
    timestamp=st.integers(0, 0xFFFFFFFF),
    emoji=st.integers(0, 0xFFFFFFFF),
    user_message=st.text(alphabet=st.characters(min_codepoint=32, max_codepoint=126), max_size=28),
)


@given(data=_structs)
def test_round_trip_preserves_all_fields(data: TigerTagData):
    """Encode -> decode is loss-free for every field within its wire range."""
    assert decode_ntag213(encode_ntag213(data)) == data


@given(blob=st.binary(min_size=struct.calcsize(">II HBB BBH I I HH BBH I"), max_size=200))
def test_decoder_never_crashes_on_valid_length_input(blob: bytes):
    """Any buffer >= header size decodes without raising (defensive contract)."""
    result = decode_ntag213(blob)
    assert isinstance(result, TigerTagData)

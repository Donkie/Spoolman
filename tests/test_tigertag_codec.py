"""Tests for the TigerTag NTAG213 binary codec."""

import pytest

from spoolman.tigertag_codec import (
    NTAG213_USER_BYTES,
    TIGERTAG_INIT,
    TIGERTAG_MAKER_V1,
    TIGERTAG_PRO_V1,
    TigerTagData,
    decode_ntag213,
    encode_ntag213,
    is_tigertag,
)

# --- is_tigertag -----------------------------------------------------------------


def test_is_tigertag_true_for_maker_and_pro() -> None:
    assert is_tigertag(TIGERTAG_MAKER_V1)
    assert is_tigertag(TIGERTAG_PRO_V1)


def test_is_tigertag_false_for_init_and_junk() -> None:
    # TIGERTAG_INIT marks a blank/uninitialized tag, deliberately excluded from the
    # detectable-magic set.
    assert not is_tigertag(TIGERTAG_INIT)
    assert not is_tigertag(0xDEADBEEF)


# --- TigerTagData.color_hex --------------------------------------------------------


def test_color_hex_getter_formats_rgb_only() -> None:
    data = TigerTagData(color_r=0x11, color_g=0x22, color_b=0x33, color_a=0xFF)
    assert data.color_hex == "112233"


def test_color_hex_setter_accepts_rgb() -> None:
    data = TigerTagData()
    data.color_hex = "aabbcc"
    assert (data.color_r, data.color_g, data.color_b) == (0xAA, 0xBB, 0xCC)


def test_color_hex_setter_accepts_rgba_and_updates_alpha() -> None:
    data = TigerTagData()
    data.color_hex = "aabbcc80"
    assert (data.color_r, data.color_g, data.color_b, data.color_a) == (0xAA, 0xBB, 0xCC, 0x80)


def test_color_hex_setter_strips_leading_hash() -> None:
    data = TigerTagData()
    data.color_hex = "#112233"
    assert (data.color_r, data.color_g, data.color_b) == (0x11, 0x22, 0x33)


def test_color_hex_setter_ignores_wrong_length() -> None:
    data = TigerTagData(color_r=1, color_g=2, color_b=3)
    data.color_hex = "abc"  # neither 6 nor 8 hex chars
    assert (data.color_r, data.color_g, data.color_b) == (1, 2, 3)


# --- TigerTagData.diameter_mm -------------------------------------------------------


@pytest.mark.parametrize("diameter_id", [1, 56])
def test_diameter_mm_175(diameter_id: int) -> None:
    assert TigerTagData(id_diameter=diameter_id).diameter_mm == 1.75


@pytest.mark.parametrize("diameter_id", [2, 57])
def test_diameter_mm_285(diameter_id: int) -> None:
    assert TigerTagData(id_diameter=diameter_id).diameter_mm == 2.85


def test_diameter_mm_unknown_id_is_zero() -> None:
    assert TigerTagData(id_diameter=99).diameter_mm == 0.0


# --- decode_ntag213 / encode_ntag213 round trip -------------------------------------


def _sample_data() -> TigerTagData:
    data = TigerTagData(
        id_tigertag=TIGERTAG_MAKER_V1,
        id_product=0xFFFFFFFF,
        id_material=38219,
        id_diameter=1,
        id_aspect=2,
        id_type=142,
        id_brand=19961,
        weight=1000,
        nozzle_temp=200,
        nozzle_temp_max=220,
        bed_temp=60,
        bed_temp_max=70,
        drying_temp=45,
        drying_duration=6,
        timestamp=800000000,
        emoji=0x1F600,
        user_message="Hello Spoolman",
    )
    data.color_hex = "112233"
    data.color_a = 0xFF
    return data


def test_encode_produces_full_user_memory_size() -> None:
    assert len(encode_ntag213(_sample_data())) == NTAG213_USER_BYTES


def test_round_trip_preserves_all_fields() -> None:
    original = _sample_data()
    decoded = decode_ntag213(encode_ntag213(original))

    assert decoded.id_tigertag == original.id_tigertag
    assert decoded.id_product == original.id_product
    assert decoded.id_material == original.id_material
    assert decoded.id_aspect == original.id_aspect
    assert decoded.id_type == original.id_type
    assert decoded.id_diameter == original.id_diameter
    assert decoded.id_brand == original.id_brand
    assert decoded.color_hex == original.color_hex
    assert decoded.color_a == original.color_a
    assert decoded.weight == original.weight
    assert decoded.nozzle_temp == original.nozzle_temp
    assert decoded.nozzle_temp_max == original.nozzle_temp_max
    assert decoded.bed_temp == original.bed_temp
    assert decoded.bed_temp_max == original.bed_temp_max
    assert decoded.drying_temp == original.drying_temp
    assert decoded.drying_duration == original.drying_duration
    assert decoded.timestamp == original.timestamp
    assert decoded.emoji == original.emoji
    assert decoded.user_message == original.user_message


def test_round_trip_is_tigertag_true_after_decode() -> None:
    decoded = decode_ntag213(encode_ntag213(_sample_data()))
    assert is_tigertag(decoded.id_tigertag)


def test_encode_truncates_user_message_over_28_bytes() -> None:
    data = _sample_data()
    data.user_message = "x" * 40
    decoded = decode_ntag213(encode_ntag213(data))
    assert decoded.user_message == "x" * 28


def test_encode_masks_weight_to_24_bits() -> None:
    data = _sample_data()
    data.weight = 0xFFFFFFFF  # larger than the 24-bit field can hold
    decoded = decode_ntag213(encode_ntag213(data))
    assert decoded.weight == 0xFFFFFF


def test_decode_raises_on_too_short_data() -> None:
    with pytest.raises(ValueError, match="Data too short"):
        decode_ntag213(b"\x00" * 10)


def test_decode_accepts_header_only_data_and_defaults_the_rest() -> None:
    # Exactly the 36-byte header, no bed temp / emoji / user message region.
    raw = encode_ntag213(_sample_data())[:36]
    decoded = decode_ntag213(raw)

    assert decoded.bed_temp == 0
    assert decoded.bed_temp_max == 0
    assert decoded.emoji == 0
    assert decoded.user_message == ""


def test_decode_user_message_stops_at_null_terminator() -> None:
    data = _sample_data()
    data.user_message = "short"
    raw = bytearray(encode_ntag213(data))
    # Message is null-padded already by encode; decode must stop at the first \x00
    # rather than reading through the padding as garbage.
    decoded = decode_ntag213(bytes(raw))
    assert decoded.user_message == "short"


def test_decode_user_message_handles_invalid_utf8_with_replacement() -> None:
    data = _sample_data()
    data.user_message = "ok"
    raw = bytearray(encode_ntag213(data))
    # Corrupt one byte of the (short, non-null-padded) message region to invalid UTF-8.
    raw[58] = 0xFF
    decoded = decode_ntag213(bytes(raw))
    assert decoded.user_message.startswith("�")

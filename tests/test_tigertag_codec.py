"""Tests for the TigerTag NTAG213 binary codec.

Field offsets are checked against three worked examples from the spec repo's own README
(TigerTag-Project/TigerTag-RFID-Guide, sections 4, 4.1, 4.2): a Rosa3D red PLA Maker tag, a
Polymaker PolyTerra+ tag (whose weight is in kilograms, not grams), and a blank Init tag.
Real reference values, not just synthetic ones -- same role the Prusa spec repo's sample
dumps played for the OpenPrintTag codec's tests.
"""

import struct

import pytest

from spoolman.tags.tigertag import (
    NTAG213_USER_BYTES,
    TIGERTAG_INIT,
    TIGERTAG_MAKER_V1,
    TIGERTAG_PRO_V1,
    TigerTagData,
    decode_ntag213,
    is_tigertag,
)

# encode_ntag213 has no production caller -- nothing writes a TigerTag today -- so it lives
# here rather than in spoolman/tags/tigertag.py, same precedent set for OpenPrintTag's own
# encoder (spoolman/tags/openprinttag.py dropped encode_nfcv_memory for the same reason).
_HEADER_FMT = ">II HBB BBH I I HH BBBB I"
_USER_MESSAGE_SIZE = 28
_USER_MESSAGE_OFFSET = 48


def encode_ntag213(data: TigerTagData) -> bytes:
    """Encode TigerTagData into raw bytes for NTAG213 user memory, test-only.

    Mirrors decode_ntag213's layout exactly (see that module's byte table) so round-trip
    tests exercise real field packing, not a shortcut.
    """
    color_val = (data.color_r << 24) | (data.color_g << 16) | (data.color_b << 8) | data.color_a
    measure_unit = ((data.weight & 0xFFFFFF) << 8) | (data.id_unit & 0xFF)

    header = struct.pack(
        _HEADER_FMT,
        data.id_tigertag,
        data.id_product,
        data.id_material,
        data.id_aspect,  # aspect_1
        0,  # aspect_2
        data.id_type,
        data.id_diameter,
        data.id_brand,
        color_val,
        measure_unit,
        data.nozzle_temp,
        data.nozzle_temp_max,
        data.drying_temp,
        data.drying_duration,
        data.bed_temp,
        data.bed_temp_max,
        data.timestamp,
    )

    payload = bytearray(NTAG213_USER_BYTES)
    payload[: len(header)] = header

    msg_bytes = data.user_message.encode("utf-8")[:_USER_MESSAGE_SIZE]
    payload[_USER_MESSAGE_OFFSET : _USER_MESSAGE_OFFSET + len(msg_bytes)] = msg_bytes

    return bytes(payload)


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
#
# 56 (0x38) and 221 (0xDD) are the only ids the spec repo's database/id_diameter.json
# defines -- confirmed against every worked example in its README too.


def test_diameter_mm_175() -> None:
    assert TigerTagData(id_diameter=56).diameter_mm == 1.75


def test_diameter_mm_285() -> None:
    assert TigerTagData(id_diameter=221).diameter_mm == 2.85


def test_diameter_mm_unknown_id_is_zero() -> None:
    assert TigerTagData(id_diameter=99).diameter_mm == 0.0


# --- TigerTagData.weight_grams -------------------------------------------------------
#
# database/id_measure_unit.json: 21=g is the only unit weight_grams trusts. The README's
# own Polymaker PolyTerra+ example reports its weight in kilograms (unit 35), which is
# exactly the case this guards against -- see test_decode_polymaker_example below.


def test_weight_grams_passes_through_for_grams_unit() -> None:
    assert TigerTagData(weight=1000, id_unit=21).weight_grams == 1000


def test_weight_grams_is_none_for_a_non_gram_unit() -> None:
    assert TigerTagData(weight=1000, id_unit=35).weight_grams is None  # 35 = kilograms


# --- decode_ntag213 / encode_ntag213 round trip -------------------------------------


def _sample_data() -> TigerTagData:
    data = TigerTagData(
        id_tigertag=TIGERTAG_MAKER_V1,
        id_product=0xFFFFFFFF,
        id_material=38219,
        id_diameter=56,
        id_aspect=2,
        id_type=142,
        id_brand=19961,
        weight=1000,
        id_unit=21,
        nozzle_temp=200,
        nozzle_temp_max=220,
        bed_temp=60,
        bed_temp_max=70,
        drying_temp=45,
        drying_duration=6,
        timestamp=800000000,
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
    assert decoded.id_unit == original.id_unit
    assert decoded.nozzle_temp == original.nozzle_temp
    assert decoded.nozzle_temp_max == original.nozzle_temp_max
    assert decoded.bed_temp == original.bed_temp
    assert decoded.bed_temp_max == original.bed_temp_max
    assert decoded.drying_temp == original.drying_temp
    assert decoded.drying_duration == original.drying_duration
    assert decoded.timestamp == original.timestamp
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
    # Exactly the 36-byte header, no user-message region.
    raw = encode_ntag213(_sample_data())[:36]
    decoded = decode_ntag213(raw)
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
    raw[_USER_MESSAGE_OFFSET] = 0xFF
    decoded = decode_ntag213(bytes(raw))
    assert decoded.user_message.startswith("\N{REPLACEMENT CHARACTER}")


# --- Real reference payloads, from the spec repo's README -------------------------------


def test_decode_rosa3d_red_pla_example() -> None:
    """README section 4: TigerTag-encoded Rosa3D red PLA, a plain Maker tag."""
    data = TigerTagData(
        id_tigertag=0x5BF59264,
        id_product=0xFFFFFFFF,
        id_material=0x954B,  # 38219
        id_aspect=0x68,  # 104, "Basic"
        id_type=0x8E,  # 142, Filament
        id_diameter=0x38,  # 56, 1.75mm
        id_brand=0x4E19,  # 19961, Rosa3D
        weight=0x0003E8,  # 1000
        id_unit=0x15,  # 21, grams
        nozzle_temp=0x00C3,  # 195
        nozzle_temp_max=0x00E6,  # 230
        drying_temp=0x32,  # 50
        drying_duration=0x05,
        bed_temp=0x32,  # 50
        bed_temp_max=0x3C,  # 60
        timestamp=0x2F7A0A5C,  # 796527196
        user_message="Starter Red",
    )
    data.color_hex = "FF0000"
    data.color_a = 0xFF

    decoded = decode_ntag213(encode_ntag213(data))

    assert is_tigertag(decoded.id_tigertag)
    assert decoded.diameter_mm == 1.75
    assert decoded.weight_grams == 1000
    assert decoded.color_hex == "ff0000"
    assert decoded.nozzle_temp == 195
    assert decoded.nozzle_temp_max == 230
    assert decoded.bed_temp == 50
    assert decoded.bed_temp_max == 60
    assert decoded.user_message == "Starter Red"


def test_decode_polymaker_tigertag_plus_example_reports_weight_in_kilograms() -> None:
    """README section 4.1: a TigerTag+ tag whose Measure is in kilograms, not grams.

    This is the real-world case weight_grams exists to guard: trusting the raw measure
    as grams here would read 1000 kg as 1000 g, a thousandfold error.
    """
    data = TigerTagData(
        id_tigertag=0xBC0FCB97,  # TigerTag+ V1.0
        id_product=0x0000000A,
        id_material=0x954B,  # 38219, PLA
        id_aspect=0x86,  # 134, Matt
        id_type=0x8E,  # Filament
        id_diameter=0x38,  # 56, 1.75mm
        id_brand=0xC5DC,  # 50652, Polymaker
        weight=0x0003E8,  # 1000
        id_unit=0x23,  # 35, kilograms -- not grams
        nozzle_temp=0x00BE,  # 190
        nozzle_temp_max=0x00F0,  # 240
        drying_temp=0x37,  # 55
        drying_duration=0x06,
        bed_temp=0x23,  # 35
        bed_temp_max=0x41,  # 65
        timestamp=0x2F7A0E90,  # 796528272
        user_message="Private msg",
    )
    data.color_hex = "89D9D9"
    data.color_a = 0xFF

    decoded = decode_ntag213(encode_ntag213(data))

    assert is_tigertag(decoded.id_tigertag)
    assert decoded.diameter_mm == 1.75
    assert decoded.weight == 1000  # the raw measure round-trips...
    assert decoded.weight_grams is None  # ...but it is not usable as grams.
    assert decoded.color_hex == "89d9d9"


def test_decode_init_tag_example() -> None:
    """README section 4.2: a blank/uninitialized Init tag, every field at its default."""
    decoded = decode_ntag213(encode_ntag213(TigerTagData(id_tigertag=0x6C41A2E1, id_unit=0x00)))

    assert not is_tigertag(decoded.id_tigertag)
    assert decoded.id_tigertag == TIGERTAG_INIT
    assert decoded.diameter_mm == 0.0
    # Unit ID 0x00 is "Not defined" on a blank tag -- not grams, so not a usable weight.
    assert decoded.weight_grams is None

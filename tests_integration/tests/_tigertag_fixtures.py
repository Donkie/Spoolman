"""Build a synthetic TigerTag NTAG213 memory dump for integration tests.

Same construction as spoolman's own unit tests (tests/test_tigertag_codec.py,
tests/test_tag_decode.py), duplicated here rather than imported: this package runs inside
the separate `spoolman-tester` container/image, which has no access to the `spoolman`
package's own test modules. Unlike OpenPrintTag, this needs no extra dependency -- the
TigerTag format is plain stdlib struct packing.
"""

import struct

TIGERTAG_MAKER_V1 = 0x5BF59264
TIGERTAG_INIT = 0x6C41A2E1

NTAG213_USER_BYTES = 144

# Field order/offsets per spoolman/tags/tigertag.py's byte table, checked against the real
# spec repo (TigerTag-Project/TigerTag-RFID-Guide). 56 (0x38) and 221 (0xDD) are the only
# diameter ids the spec defines; 21 is the "grams" measure-unit id.
_HEADER_FMT = ">II HBB BBH I I HH BBBB I"
_UNIT_ID_GRAMS = 21


def build_tigertag(
    *,
    id_tigertag: int = TIGERTAG_MAKER_V1,
    id_material: int = 0,
    id_diameter: int = 56,
    id_brand: int = 0,
    weight: int = 0,
    id_unit: int = _UNIT_ID_GRAMS,
    color_hex: str = "000000",
) -> bytes:
    """Build a full 144-byte NTAG213 user memory dump wrapping TigerTag fields."""
    color_r, color_g, color_b = (int(color_hex[i : i + 2], 16) for i in (0, 2, 4))
    color_val = (color_r << 24) | (color_g << 16) | (color_b << 8) | 0xFF
    measure_unit = ((weight & 0xFFFFFF) << 8) | (id_unit & 0xFF)

    header = struct.pack(
        _HEADER_FMT,
        id_tigertag,
        0,  # id_product
        id_material,
        0,  # id_aspect
        0,  # aspect_2
        142,  # id_type: filament
        id_diameter,
        id_brand,
        color_val,
        measure_unit,
        0,  # nozzle_temp
        0,  # nozzle_temp_max
        0,  # drying_temp
        0,  # drying_duration
        0,  # bed_temp_min
        0,  # bed_temp_max
        0,  # timestamp
    )

    payload = bytearray(NTAG213_USER_BYTES)
    payload[: len(header)] = header
    return bytes(payload)

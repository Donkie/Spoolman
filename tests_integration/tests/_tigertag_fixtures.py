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

_HEADER_FMT = ">II HBB BBH I I HH BBH I"
_BED_TEMP_OFFSET = 36
_EMOJI_OFFSET = 54
_USER_MESSAGE_OFFSET = 58
_USER_MESSAGE_SIZE = 28


def build_tigertag(
    *,
    id_tigertag: int = TIGERTAG_MAKER_V1,
    id_material: int = 0,
    id_diameter: int = 1,
    id_brand: int = 0,
    weight: int = 0,
    color_hex: str = "000000",
) -> bytes:
    """Build a full 144-byte NTAG213 user memory dump wrapping TigerTag fields."""
    color_r, color_g, color_b = (int(color_hex[i : i + 2], 16) for i in (0, 2, 4))
    color_val = (color_r << 24) | (color_g << 16) | (color_b << 8) | 0xFF
    weight_unit = ((weight & 0xFFFFFF) << 8) | 1

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
        weight_unit,
        0,  # nozzle_temp
        0,  # nozzle_temp_max
        0,  # drying_temp
        0,  # drying_duration
        0,  # reserved
        0,  # timestamp
    )

    payload = bytearray(NTAG213_USER_BYTES)
    payload[: len(header)] = header
    return bytes(payload)

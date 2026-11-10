"""TigerTag NTAG213 binary decoder.

Decodes the TigerTag Maker/+ format from NTAG213 NFC chips (144 bytes user memory,
pages 4-39). Byte offsets below are verified against the normative table in
TigerTag-Project/TigerTag-RFID-Guide's README and the offsets its own
`Sample code/parse_tigertag.py` reference parser reads, which agree exactly. Only the
fields something downstream actually reads are decoded; the rest of the spec
(Color 2/3, tag index/count, HueForge TD, Measure Available, the ECDSA signature) is
left for a later PR, same scope discipline as the OpenPrintTag codec.
"""

import logging
import struct
from dataclasses import dataclass

logger = logging.getLogger(__name__)

# NTAG213 has 144 bytes of user memory (pages 4-39, 36 pages x 4 bytes)
NTAG213_USER_BYTES = 144

# TigerTag magic numbers (from id_version.json API database — the README hex values are incorrect)
TIGERTAG_MAKER_V1 = 0x5BF59264  # TigerTag Maker v1.0 — offline only (decimal 1542820452)
TIGERTAG_PRO_V1 = 0xBC0FCB97  # TigerTag+ v1.0 — offline + cloud sync (decimal 3155151767)
TIGERTAG_INIT = 0x6C41A2E1  # TigerTag Init — blank/uninitialized (decimal 1816240865)

# All valid TigerTag magic numbers (for detection)
TIGERTAG_MAGIC_NUMBERS = {TIGERTAG_MAKER_V1, TIGERTAG_PRO_V1}

# Hex color string lengths: RGB (no alpha) vs RGBA.
_RGB_HEX_LEN = 6
_RGBA_HEX_LEN = 8

# TigerTag diameter IDs, from the spec repo's database/id_diameter.json (and confirmed by
# every worked example in its README): 56 (0x38) = 1.75mm, 221 (0xDD) = 2.85mm. No other
# values are defined -- a tag using anything else has an id this codec doesn't recognize.
_DIAMETER_ID_175 = 56
_DIAMETER_ID_285 = 221

# Measure unit IDs, from the spec repo's database/id_measure_unit.json. The "Measure" field
# (see decode_ntag213) is only grams when this is 21 -- the README's own Polymaker example
# uses 35 (kilograms) for the same field, so the raw value can't be trusted as grams on its
# own. Other defined units (mg, ml, cl, L, m^3, mm, cm, m, m^2) aren't grams either.
_UNIT_ID_GRAMS = 21


def is_tigertag(magic: int) -> bool:
    """Check if a magic number identifies a valid TigerTag (Maker or Pro/+)."""
    return magic in TIGERTAG_MAGIC_NUMBERS


@dataclass
class TigerTagData:
    """Represents all data fields stored on a TigerTag NFC chip."""

    # Core identifiers
    id_tigertag: int = 0  # 4 bytes - magic number / format identifier
    id_product: int = 0  # 4 bytes - product/filament ID (0xFFFFFFFF = Factory)
    id_material: int = 0  # 2 bytes - material type ID
    id_diameter: int = 0  # 1 byte - diameter ID (TigerTag numbering)
    id_aspect: int = 0  # 1 byte - aspect/finish ID
    id_type: int = 0  # 1 byte - type ID (142=filament)
    id_brand: int = 0  # 2 bytes - brand/manufacturer ID

    # Color as RGBA
    color_r: int = 0  # 1 byte
    color_g: int = 0  # 1 byte
    color_b: int = 0  # 1 byte
    color_a: int = 255  # 1 byte

    # Spool properties. `weight` is the raw "Measure" value -- only trustable as grams when
    # `id_unit` says so, see `weight_grams`. Defaults to grams, the overwhelmingly common
    # real-world case (and the spec repo's own first worked example), so constructing a
    # TigerTagData without specifying a unit behaves the way every caller already expects.
    weight: int = 0
    id_unit: int = _UNIT_ID_GRAMS  # 1 byte - measure unit ID (database/id_measure_unit.json)

    # Temperature settings
    nozzle_temp: int = 0  # nozzle temp min in °C
    nozzle_temp_max: int = 0  # nozzle temp max in °C
    bed_temp: int = 0  # bed temp min in °C
    bed_temp_max: int = 0  # bed temp max in °C
    drying_temp: int = 0  # drying temp in °C
    drying_duration: int = 0  # drying time in hours

    # Metadata
    timestamp: int = 0  # 4 bytes - seconds since 2000-01-01 GMT

    # User message - 28 bytes UTF-8
    user_message: str = ""

    @property
    def color_hex(self) -> str:
        """Get color as hex string (without alpha)."""
        return f"{self.color_r:02x}{self.color_g:02x}{self.color_b:02x}"

    @color_hex.setter
    def color_hex(self, value: str) -> None:
        """Set color from hex string."""
        value = value.lstrip("#")
        if len(value) == _RGB_HEX_LEN:
            self.color_r = int(value[0:2], 16)
            self.color_g = int(value[2:4], 16)
            self.color_b = int(value[4:6], 16)
        elif len(value) == _RGBA_HEX_LEN:
            self.color_r = int(value[0:2], 16)
            self.color_g = int(value[2:4], 16)
            self.color_b = int(value[4:6], 16)
            self.color_a = int(value[6:8], 16)

    @property
    def diameter_mm(self) -> float:
        """Get diameter in mm from the diameter ID."""
        if self.id_diameter == _DIAMETER_ID_175:
            return 1.75
        if self.id_diameter == _DIAMETER_ID_285:
            return 2.85
        return 0.0

    @property
    def weight_grams(self) -> int | None:
        """The measured weight in grams, or None if the tag reports it in some other unit.

        `weight` is the raw "Measure" field -- the spec also carries a measure *unit* ID
        alongside it (database/id_measure_unit.json: 21=g, but also mg/kg/ml/cl/L/m^3/mm/
        cm/m/m^2), and a real tag can use any of them -- the README's own worked example
        for a Polymaker TigerTag+ tag reports its weight in kilograms, not grams. Rather
        than guess a conversion, a non-gram tag is treated as not carrying a usable weight.
        """
        return self.weight if self.id_unit == _UNIT_ID_GRAMS else None


# TigerTag binary format (big-endian, 36-byte header), per the spec repo's byte table:
#
# Offset  Size  Format  Field
# 0       4     >I      id_tigertag
# 4       4     >I      id_product
# 8       2     >H      id_material
# 10      1     B       id_aspect_1
# 11      1     B       id_aspect_2
# 12      1     B       id_type
# 13      1     B       id_diameter
# 14      2     >H      id_brand
# 16      4     >I      color_rgba (R<<24 | G<<16 | B<<8 | A)
# 20      4     >I      measure_unit (measure<<8 | id_unit)
# 24      2     >H      nozzle_temp_min
# 26      2     >H      nozzle_temp_max
# 28      1     B       drying_temp
# 29      1     B       drying_time (hours)
# 30      1     B       bed_temp_min
# 31      1     B       bed_temp_max
# 32      4     >I      timestamp
#
# After the header (optional; not written by every tool, so length-guarded on read):
# 36-47   12    -       Color 2/3, tag index, HueForge TD, reserved -- not decoded here
# 48      28    UTF-8   user_message
# 76-143  68    -       Measure Available, reserved, ECDSA signature -- not decoded here

_HEADER_FMT = ">II HBB BBH I I HH BBBB I"
_HEADER_SIZE = struct.calcsize(_HEADER_FMT)  # 36 bytes
_USER_MESSAGE_SIZE = 28
_USER_MESSAGE_OFFSET = 48


def decode_ntag213(raw_bytes: bytes) -> TigerTagData:
    """Decode raw NTAG213 user memory bytes into TigerTagData.

    Args:
        raw_bytes: The raw bytes from NTAG213 pages 4-39 (up to 144 bytes).

    Returns:
        TigerTagData: The decoded tag data.

    Raises:
        ValueError: If the data is too short to decode.

    """
    if len(raw_bytes) < _HEADER_SIZE:
        raise ValueError(f"Data too short: expected at least {_HEADER_SIZE} bytes, got {len(raw_bytes)}")

    # Debug: dump raw bytes for diagnosing format issues
    hex_dump = " ".join(f"{b:02x}" for b in raw_bytes[:68])
    logger.info("TigerTag raw bytes (first 68): %s", hex_dump)

    values = struct.unpack_from(_HEADER_FMT, raw_bytes, 0)

    # Unpack color from RGBA uint32: value = R<<24 | G<<16 | B<<8 | A
    color_val = values[8]
    color_r = (color_val >> 24) & 0xFF
    color_g = (color_val >> 16) & 0xFF
    color_b = (color_val >> 8) & 0xFF
    color_a = color_val & 0xFF

    # Unpack measure + unit: measure in upper 24 bits, id_unit in lower 8. Whether `measure`
    # means grams depends on id_unit -- see TigerTagData.weight_grams.
    measure_unit = values[9]
    weight = (measure_unit >> 8) & 0xFFFFFF
    id_unit = measure_unit & 0xFF

    data = TigerTagData(
        id_tigertag=values[0],
        id_product=values[1],
        id_material=values[2],
        id_aspect=values[3],  # aspect_1
        # index 4 is aspect_2, ignored
        id_type=values[5],
        id_diameter=values[6],
        id_brand=values[7],
        color_r=color_r,
        color_g=color_g,
        color_b=color_b,
        color_a=color_a,
        weight=weight,
        id_unit=id_unit,
        nozzle_temp=values[10],
        nozzle_temp_max=values[11],
        drying_temp=values[12],
        drying_duration=values[13],
        bed_temp=values[14],
        bed_temp_max=values[15],
        timestamp=values[16],
    )

    # Read user message at offset 48 (28 bytes, optional region)
    if len(raw_bytes) >= _USER_MESSAGE_OFFSET + _USER_MESSAGE_SIZE:
        msg_bytes = raw_bytes[_USER_MESSAGE_OFFSET : _USER_MESSAGE_OFFSET + _USER_MESSAGE_SIZE]
        null_idx = msg_bytes.find(b"\x00")
        if null_idx >= 0:
            msg_bytes = msg_bytes[:null_idx]
        data.user_message = msg_bytes.decode("utf-8", errors="replace")

    return data

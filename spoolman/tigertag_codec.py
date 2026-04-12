"""TigerTag NTAG213 binary encoder/decoder.

Implements the TigerTag Maker format for encoding/decoding filament data
to/from NTAG213 NFC chips (144 bytes user memory, pages 4-39).

Based on the TigerTag RFID Guide specification.
"""

import logging
import struct
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)

# NTAG213 has 144 bytes of user memory (pages 4-39, 36 pages x 4 bytes)
NTAG213_USER_BYTES = 144

# TigerTag magic numbers (from id_version.json API database — the README hex values are incorrect)
TIGERTAG_MAKER_V1 = 0x5BF59264  # TigerTag Maker v1.0 — offline only (decimal 1542820452)
TIGERTAG_PRO_V1 = 0xBC0FCB97  # TigerTag+ v1.0 — offline + cloud sync (decimal 3155151767)
TIGERTAG_INIT = 0x6C41A2E1  # TigerTag Init — blank/uninitialized (decimal 1816240865)

# All valid TigerTag magic numbers (for detection)
TIGERTAG_MAGIC_NUMBERS = {TIGERTAG_MAKER_V1, TIGERTAG_PRO_V1}


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

    # Spool properties
    weight: int = 0  # net weight in grams

    # Temperature settings
    nozzle_temp: int = 0  # nozzle temp min in °C
    nozzle_temp_max: int = 0  # nozzle temp max in °C
    bed_temp: int = 0  # bed temp min in °C
    bed_temp_max: int = 0  # bed temp max in °C
    drying_temp: int = 0  # drying temp in °C
    drying_duration: int = 0  # drying time in hours

    # Metadata
    timestamp: int = 0  # 4 bytes - seconds since 2000-01-01 GMT
    emoji: int = 0  # 4 bytes - emoji codepoint

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
        if len(value) == 6:
            self.color_r = int(value[0:2], 16)
            self.color_g = int(value[2:4], 16)
            self.color_b = int(value[4:6], 16)
        elif len(value) == 8:
            self.color_r = int(value[0:2], 16)
            self.color_g = int(value[2:4], 16)
            self.color_b = int(value[4:6], 16)
            self.color_a = int(value[6:8], 16)

    @property
    def diameter_mm(self) -> float:
        """Get diameter in mm from the diameter ID."""
        if self.id_diameter == 1:
            return 1.75
        if self.id_diameter == 2:
            return 2.85
        # TigerTag uses larger IDs — look up common ones
        if self.id_diameter == 56:
            return 1.75
        if self.id_diameter == 57:
            return 2.85
        return 0.0


# TigerTag binary format (big-endian, 36-byte header):
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
# 20      4     >I      weight_unit (weight<<8 | unit_id)
# 24      2     >H      nozzle_temp_min
# 26      2     >H      nozzle_temp_max
# 28      1     B       drying_temp
# 29      1     B       drying_time (hours)
# 30      2     >H      reserved (0)
# 32      4     >I      timestamp
#
# After header:
# 36      1     B       bed_temp_min
# 37      1     B       bed_temp_max
# 38-53   16    -       reserved
# 54      4     >I      emoji
# 58      28    UTF-8   user_message
# 86-143  58    -       signature / reserved

_HEADER_FMT = ">II HBB BBH I I HH BBH I"
_HEADER_SIZE = struct.calcsize(_HEADER_FMT)  # 36 bytes
_USER_MESSAGE_SIZE = 28
_USER_MESSAGE_OFFSET = 58
_EMOJI_OFFSET = 54
_BED_TEMP_OFFSET = 36


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

    # Unpack weight + unit: weight in upper 24 bits, unit_id in lower 8
    weight_unit = values[9]
    weight = (weight_unit >> 8) & 0xFFFFFF

    data = TigerTagData(
        id_tigertag=values[0],
        id_product=values[1],
        id_material=values[2],
        id_aspect=values[3],  # aspect_1
        # values[4] = aspect_2, ignored
        id_type=values[5],
        id_diameter=values[6],
        id_brand=values[7],
        color_r=color_r,
        color_g=color_g,
        color_b=color_b,
        color_a=color_a,
        weight=weight,
        nozzle_temp=values[10],
        nozzle_temp_max=values[11],
        drying_temp=values[12],
        drying_duration=values[13],
        # values[14] = reserved
        timestamp=values[15],
    )

    # Read bed temp (uint8 each) at offset 36-37
    if len(raw_bytes) > _BED_TEMP_OFFSET + 1:
        data.bed_temp = raw_bytes[_BED_TEMP_OFFSET]
        data.bed_temp_max = raw_bytes[_BED_TEMP_OFFSET + 1]

    # Read emoji at offset 54
    if len(raw_bytes) >= _EMOJI_OFFSET + 4:
        data.emoji = struct.unpack_from(">I", raw_bytes, _EMOJI_OFFSET)[0]

    # Read user message at offset 58
    if len(raw_bytes) >= _USER_MESSAGE_OFFSET + _USER_MESSAGE_SIZE:
        msg_bytes = raw_bytes[_USER_MESSAGE_OFFSET : _USER_MESSAGE_OFFSET + _USER_MESSAGE_SIZE]
        null_idx = msg_bytes.find(b"\x00")
        if null_idx >= 0:
            msg_bytes = msg_bytes[:null_idx]
        data.user_message = msg_bytes.decode("utf-8", errors="replace")

    return data


def encode_ntag213(data: TigerTagData) -> bytes:
    """Encode TigerTagData into raw bytes for NTAG213 user memory.

    Returns:
        bytes: 144 bytes to write to NTAG213 pages 4-39.

    """
    # Pack color as RGBA uint32: R<<24 | G<<16 | B<<8 | A
    color_val = (data.color_r << 24) | (data.color_g << 16) | (data.color_b << 8) | data.color_a

    # Pack weight + unit_id: weight<<8 | unit (unit=1 for grams)
    weight_unit = ((data.weight & 0xFFFFFF) << 8) | 1

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
        weight_unit,
        data.nozzle_temp,
        data.nozzle_temp_max,
        data.drying_temp,
        data.drying_duration,
        0,  # reserved
        data.timestamp,
    )

    # Build full 144-byte payload
    payload = bytearray(NTAG213_USER_BYTES)
    payload[: len(header)] = header

    # Bed temp at offset 36-37
    payload[_BED_TEMP_OFFSET] = data.bed_temp & 0xFF
    payload[_BED_TEMP_OFFSET + 1] = data.bed_temp_max & 0xFF

    # Emoji at offset 54
    struct.pack_into(">I", payload, _EMOJI_OFFSET, data.emoji)

    # User message at offset 58 (28 bytes, null-padded)
    msg_bytes = data.user_message.encode("utf-8")[:_USER_MESSAGE_SIZE]
    payload[_USER_MESSAGE_OFFSET : _USER_MESSAGE_OFFSET + len(msg_bytes)] = msg_bytes

    return bytes(payload)

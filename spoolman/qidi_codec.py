"""Qidi MIFARE Classic 1K encoder/decoder.

Implements the Qidi RFID tag format for encoding/decoding filament data
to/from MIFARE Classic 1K tags (FM11RF08S / ISO 14443-A).

Data is stored in Sector 1, Block 0 (absolute block 4) as 3 bytes:
  byte 0: material code (1-50)
  byte 1: color code (1-24)
  byte 2: manufacturer code (always 1 for Qidi)
  bytes 3-15: zero-filled

Authentication uses Key A with two keys tried in order:
  1. Qidi custom key: D3 F7 D3 F7 D3 F7
  2. Factory default:  FF FF FF FF FF FF

Based on the Qidi RFID specification:
  https://wiki.qidi3d.com/en/QIDIBOX/RFID
"""

import logging
from dataclasses import dataclass

logger = logging.getLogger(__name__)

# MIFARE Classic 1K layout
QIDI_SECTOR = 1
QIDI_BLOCK_IN_SECTOR = 0
QIDI_ABSOLUTE_BLOCK = QIDI_SECTOR * 4 + QIDI_BLOCK_IN_SECTOR  # block 4
MIFARE_BLOCK_SIZE = 16

# Authentication keys (Key A), tried in order
QIDI_KEY_CUSTOM = bytes([0xD3, 0xF7, 0xD3, 0xF7, 0xD3, 0xF7])
QIDI_KEY_DEFAULT = bytes([0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF])
QIDI_KEYS = [QIDI_KEY_CUSTOM, QIDI_KEY_DEFAULT]

# Material code -> (name, Spoolman material string)
MATERIAL_CODE_MAP: dict[int, tuple[str, str]] = {
    1: ("PLA", "PLA"),
    2: ("PLA Matte", "PLA"),
    3: ("PLA Metal", "PLA"),
    4: ("PLA Silk", "PLA"),
    5: ("PLA-CF", "PLA-CF"),
    6: ("PLA-Wood", "PLA"),
    7: ("PLA Basic", "PLA"),
    8: ("PLA Matte Basic", "PLA"),
    11: ("ABS", "ABS"),
    12: ("ABS-GF", "ABS-GF"),
    13: ("ABS-Metal", "ABS"),
    14: ("ABS-Odorless", "ABS"),
    18: ("ASA", "ASA"),
    19: ("ASA-AERO", "ASA"),
    24: ("UltraPA", "PA"),
    25: ("PA-CF", "PA-CF"),
    26: ("UltraPA-CF25", "PA-CF"),
    27: ("PA12-CF", "PA-CF"),
    30: ("PAHT-CF", "PA-CF"),
    31: ("PAHT-GF", "PA-GF"),
    32: ("Support For PAHT", "PLA"),
    33: ("Support For PET/PA", "PLA"),
    34: ("PC/ABS-FR", "PC"),
    37: ("PET-CF", "PET-CF"),
    38: ("PET-GF", "PET-GF"),
    39: ("PETG Basic", "PETG"),
    40: ("PETG Tough", "PETG"),
    41: ("PETG Rapido", "PETG"),
    42: ("PETG-CF", "PETG-CF"),
    43: ("PETG-GF", "PETG-GF"),
    44: ("PPS-CF", "PPS"),
    45: ("PETG Translucent", "PETG"),
    47: ("PVA", "PVA"),
    49: ("TPU-Aero", "TPU"),
    50: ("TPU", "TPU"),
}

# Color code -> (name, RGB hex)
COLOR_CODE_MAP: dict[int, tuple[str, str]] = {
    1: ("White", "FAFAFA"),
    2: ("Black", "060606"),
    3: ("Light Gray", "D9E3ED"),
    4: ("Lime Green", "5CF30F"),
    5: ("Mint Green", "63E492"),
    6: ("Blue", "2850FF"),
    7: ("Pink", "FE98FE"),
    8: ("Yellow", "DFD628"),
    9: ("Forest Green", "228332"),
    10: ("Light Blue", "99DEFF"),
    11: ("Dark Blue", "1714B0"),
    12: ("Lavender", "CEC0FE"),
    13: ("Yellow Green", "CADE4B"),
    14: ("Navy Blue", "1353AB"),
    15: ("Sky Blue", "5EA9FD"),
    16: ("Purple", "A878FF"),
    17: ("Coral", "FE717A"),
    18: ("Red", "FF362D"),
    19: ("Beige", "E2DFCD"),
    20: ("Gray", "898F9B"),
    21: ("Brown", "6E3812"),
    22: ("Tan", "CAC59F"),
    23: ("Orange", "F28636"),
    24: ("Gold", "B87F2B"),
}


@dataclass
class QidiTagData:
    """Represents all data fields stored on a Qidi RFID tag."""

    material_code: int = 0
    color_code: int = 0
    manufacturer_code: int = 1  # Always 1 for Qidi

    @property
    def material_name(self) -> str:
        """Get the Qidi material name (e.g. 'PLA Silk')."""
        entry = MATERIAL_CODE_MAP.get(self.material_code)
        return entry[0] if entry else f"Unknown ({self.material_code})"

    @property
    def material_type(self) -> str:
        """Get the Spoolman-compatible material type (e.g. 'PLA')."""
        entry = MATERIAL_CODE_MAP.get(self.material_code)
        return entry[1] if entry else "Unknown"

    @property
    def color_name(self) -> str:
        """Get the color name."""
        entry = COLOR_CODE_MAP.get(self.color_code)
        return entry[0] if entry else f"Unknown ({self.color_code})"

    @property
    def color_hex(self) -> str:
        """Get the RGB hex string (without #)."""
        entry = COLOR_CODE_MAP.get(self.color_code)
        return entry[1] if entry else "000000"


def decode_qidi_block(raw_bytes: bytes) -> QidiTagData:
    """Decode a 16-byte MIFARE Classic block into QidiTagData.

    Args:
        raw_bytes: 16 bytes from MIFARE Classic block 4.

    Returns:
        QidiTagData with decoded fields.

    Raises:
        ValueError: If the data is too short.
    """
    if len(raw_bytes) < 3:
        raise ValueError(f"Data too short: expected at least 3 bytes, got {len(raw_bytes)}")

    logger.info(
        "Qidi raw block: %s",
        " ".join(f"{b:02x}" for b in raw_bytes[:16]),
    )

    return QidiTagData(
        material_code=raw_bytes[0],
        color_code=raw_bytes[1],
        manufacturer_code=raw_bytes[2],
    )


def encode_qidi_block(data: QidiTagData) -> bytes:
    """Encode QidiTagData into a 16-byte MIFARE Classic block.

    Returns:
        bytes: 16 bytes to write to MIFARE Classic block 4.
    """
    block = bytearray(MIFARE_BLOCK_SIZE)
    block[0] = data.material_code & 0xFF
    block[1] = data.color_code & 0xFF
    block[2] = data.manufacturer_code & 0xFF
    # bytes 3-15 remain zero
    return bytes(block)


def is_valid_qidi_block(raw_bytes: bytes) -> bool:
    """Check if a 16-byte block looks like valid Qidi data.

    Validates: bytes 3-15 are all zero, material code 1-50,
    color code 1-24, manufacturer code == 1.
    """
    if len(raw_bytes) < 16:
        return False

    # Check padding bytes are zero
    if any(b != 0 for b in raw_bytes[3:16]):
        return False

    material = raw_bytes[0]
    color = raw_bytes[1]
    manufacturer = raw_bytes[2]

    return 1 <= material <= 50 and 1 <= color <= 24 and manufacturer == 1


def material_code_from_name(name: str) -> int | None:
    """Look up a Qidi material code from a material name (case-insensitive)."""
    name_lower = name.lower()
    for code, (qidi_name, _spoolman_type) in MATERIAL_CODE_MAP.items():
        if qidi_name.lower() == name_lower:
            return code
    return None


def color_code_from_hex(hex_color: str) -> int | None:
    """Find the closest Qidi color code for a given RGB hex string.

    Exact match first, then Euclidean distance in RGB space.
    """
    hex_color = hex_color.lstrip("#").lower()
    if len(hex_color) < 6:
        return None

    target_r = int(hex_color[0:2], 16)
    target_g = int(hex_color[2:4], 16)
    target_b = int(hex_color[4:6], 16)

    best_code = None
    best_dist = float("inf")

    for code, (_name, rgb_hex) in COLOR_CODE_MAP.items():
        r = int(rgb_hex[0:2], 16)
        g = int(rgb_hex[2:4], 16)
        b = int(rgb_hex[4:6], 16)

        dist = (target_r - r) ** 2 + (target_g - g) ** 2 + (target_b - b) ** 2
        if dist == 0:
            return code  # Exact match
        if dist < best_dist:
            best_dist = dist
            best_code = code

    return best_code

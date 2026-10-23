"""OpenPrintTag NDEF/CBOR decoder for NFC-V (ISO 15693) tags.

Decodes OpenPrintTag data from ICODE SLIX2 NFC-V tag memory.
The data is stored as an NDEF record with MIME type application/vnd.openprinttag,
containing CBOR-encoded sections (meta, main, aux).

Only the fields Spoolman reads are decoded. Everything else in the specification (tags,
certifications, chamber and drying settings, container dimensions, measured color in LAB or
RAL, dates) is left out on purpose: nothing consumes it yet, and a copy of the spec's enums
drifts out of date. Add a field here together with the code that uses it.

Based on the OpenPrintTag specification: https://specs.openprinttag.org
"""

import io
import logging
import math
import uuid
from dataclasses import dataclass

import cbor2

logger = logging.getLogger(__name__)

OPENPRINTTAG_MIME = "application/vnd.openprinttag"

# Material type enum (key -> abbreviation). A key that is not in this table is left unset
# rather than stored under a made-up name.
MATERIAL_TYPE_MAP: dict[int, str] = {
    0: "PLA",
    1: "PETG",
    2: "TPU",
    3: "ABS",
    4: "ASA",
    5: "PC",
    6: "PCTG",
    7: "PP",
    8: "PA6",
    9: "PA11",
    10: "PA12",
    11: "PA66",
    12: "CPE",
    13: "TPE",
    14: "HIPS",
    15: "PHA",
    16: "PET",
    17: "PEI",
    18: "PBT",
    19: "PVB",
    20: "PVA",
    21: "PEKK",
    22: "PEEK",
    23: "BVOH",
    24: "TPC",
    25: "PPS",
    26: "PPSU",
    27: "PVC",
    28: "PEBA",
    29: "PVDF",
    30: "PPA",
    31: "PCL",
    32: "PES",
    33: "PMMA",
    34: "POM",
    35: "PPE",
    36: "PS",
    37: "PSU",
    38: "TPI",
    39: "SBS",
    40: "OBC",
    41: "EVA",
    42: "PA612",
}

# Material class enum: FFF is filament, SLA is resin
MATERIAL_CLASS_MAP: dict[int, str] = {
    0: "FFF",
    1: "SLA",
}

# UUID namespaces for deriving UUIDs from other fields
UUID_NS_INSTANCE = uuid.UUID("31062f81-b5bd-4f86-a5f8-46367e841508")

# Nesting depth allowed in a tag's CBOR. OpenPrintTag needs three or four levels; the library's
# default of 400 lets shared references nest until a small tag expands to megabytes.
_MAX_CBOR_DEPTH = 8

# Meta section field keys
META_MAIN_REGION_OFFSET = 0
META_AUX_REGION_OFFSET = 2

# Main section field keys (only the ones decoded below)
MF_INSTANCE_UUID = 0
MF_GTIN = 4
MF_MATERIAL_CLASS = 8
MF_MATERIAL_TYPE = 9
MF_MATERIAL_NAME = 10
MF_BRAND_NAME = 11
MF_NOMINAL_NETTO_FULL_WEIGHT = 16
MF_ACTUAL_NETTO_FULL_WEIGHT = 17
MF_EMPTY_CONTAINER_WEIGHT = 18
MF_PRIMARY_COLOR = 19
MF_DENSITY = 29
MF_FILAMENT_DIAMETER = 30
MF_MIN_PRINT_TEMPERATURE = 34
MF_MAX_PRINT_TEMPERATURE = 35
MF_MIN_BED_TEMPERATURE = 37
MF_MAX_BED_TEMPERATURE = 38

# Aux section field keys
AUX_CONSUMED_WEIGHT = 0

# NFC-V Type 5 Tag TLV block tags (ISO/IEC 15693 capability container)
_TLV_NDEF_MESSAGE = 0x03
_TLV_TERMINATOR = 0xFE
_TLV_THREE_BYTE_LENGTH = 0xFF

# NDEF record TNF (Type Name Format): Media-type, per RFC 2046
_NDEF_TNF_MEDIA_TYPE = 0x02


@dataclass
class OpenPrintTagData:
    """The decoded fields of an OpenPrintTag NFC tag that Spoolman reads."""

    # UUID of this roll, if the tag carries one
    instance_uuid: str | None = None

    # Identifiers
    gtin: int | None = None

    # Material info
    material_class: str | None = None  # "FFF" or "SLA"
    material_type: str | None = None  # e.g. "PLA", "PETG"
    material_name: str | None = None  # e.g. "PLA Galaxy Black"
    brand_name: str | None = None  # e.g. "Prusament"

    # Physical properties
    density: float | None = None
    filament_diameter: float | None = None  # defaults to 1.75 if absent

    # Weights, in grams
    nominal_netto_full_weight: float | None = None
    actual_netto_full_weight: float | None = None
    empty_container_weight: float | None = None
    consumed_weight: float | None = None  # from aux section

    # Color as hex string (without #)
    primary_color_hex: str | None = None

    # Temperatures (°C)
    min_print_temperature: int | None = None
    max_print_temperature: int | None = None
    min_bed_temperature: int | None = None
    max_bed_temperature: int | None = None

    # Raw NFC tag UID (for UUID derivation)
    nfc_tag_uid: bytes | None = None

    @property
    def effective_diameter(self) -> float:
        """Get filament diameter, defaulting to 1.75mm per spec.

        A tag that states 0 keeps 0: the database layer refuses it, which is the decision point.
        Defaulting here would turn a bad value into a plausible one.
        """
        return self.filament_diameter if self.filament_diameter is not None else 1.75

    @property
    def effective_instance_uuid(self) -> str | None:
        """Get instance UUID, deriving from tag UID if not explicit."""
        if self.instance_uuid:
            return self.instance_uuid
        if self.nfc_tag_uid:
            derived = uuid.uuid5(UUID_NS_INSTANCE, self.nfc_tag_uid)
            return str(derived)
        return None


def _parse_color_rgba(data: object) -> str | None:
    """Convert RGBA byte string to hex color (RGB only, drop alpha).

    `data` is whatever CBOR decoded the field to -- for truncated/corrupt tag memory
    that's still syntactically valid CBOR, that can be any type, not just bytes, so the
    type is checked before anything that assumes a byte string (starting with `len`).
    """
    if isinstance(data, (bytes, bytearray)) and len(data) >= 3:  # noqa: PLR2004
        return f"{data[0]:02x}{data[1]:02x}{data[2]:02x}"
    return None


def _parse_uuid(data: object) -> str | None:
    """Convert CBOR byte string to UUID string.

    See `_parse_color_rgba` docstring for why `data`'s type is checked first.
    """
    if isinstance(data, (bytes, bytearray)) and len(data) == 16:  # noqa: PLR2004
        return str(uuid.UUID(bytes=bytes(data)))
    return None


def _decode_cbor_map(raw: bytes) -> tuple[dict, int]:
    """Decode a CBOR map from bytes, return (map, bytes_consumed).

    Raises:
        ValueError: If the bytes are not a complete CBOR map. Tag memory that was truncated
            or corrupted can be an incomplete item (cbor2 raises its own error types, none of
            them ValueError) or complete CBOR that just isn't a map, and callers rely on
            this function's only failure being ValueError.

    """
    buf = io.BytesIO(raw)
    try:
        data = cbor2.CBORDecoder(buf, max_depth=_MAX_CBOR_DEPTH).decode()
    except cbor2.CBORDecodeError as exc:
        raise ValueError(f"Invalid CBOR: {exc}") from exc
    if not isinstance(data, dict):
        raise ValueError(f"Expected a CBOR map, got {type(data).__name__}")  # noqa: TRY004 -- ValueError is the contract
    return data, buf.tell()


def _find_ndef_payload(raw_bytes: bytes) -> bytes | None:
    """Extract OpenPrintTag NDEF record payload from NFC-V tag memory.

    Parses the capability container, walks TLV blocks to find the NDEF TLV,
    then parses NDEF records to find the application/vnd.openprinttag record.
    """
    if len(raw_bytes) < 4 or raw_bytes[0] != 0xE1:  # noqa: PLR2004
        return None

    pos = 4  # skip 4-byte capability container

    # Walk TLV blocks
    while pos < len(raw_bytes):
        tag = raw_bytes[pos]
        pos += 1

        if tag == _TLV_TERMINATOR:
            break
        if tag == 0x00:  # null TLV, no length
            continue

        if pos >= len(raw_bytes):
            break
        tlv_len = raw_bytes[pos]
        pos += 1

        if tlv_len == _TLV_THREE_BYTE_LENGTH:
            if pos + 2 > len(raw_bytes):
                break
            tlv_len = (raw_bytes[pos] << 8) | raw_bytes[pos + 1]
            pos += 2

        if tag == _TLV_NDEF_MESSAGE:
            return _parse_ndef_records(raw_bytes[pos : pos + tlv_len])

        pos += tlv_len  # skip non-NDEF TLVs

    return None


def _read_ndef_length(ndef_data: bytes, pos: int, *, short_record: bool) -> tuple[int, int] | None:
    """Read an NDEF length field (1 byte for a short record, 4 bytes otherwise).

    Returns (length, new_pos), or None if the buffer is truncated.
    """
    if short_record:
        if pos >= len(ndef_data):
            return None
        return ndef_data[pos], pos + 1
    if pos + 4 > len(ndef_data):
        return None
    return int.from_bytes(ndef_data[pos : pos + 4], "big"), pos + 4


def _parse_ndef_records(ndef_data: bytes) -> bytes | None:
    """Minimal NDEF parser that returns the payload of the application/vnd.openprinttag record.

    Handles short and standard NDEF records. Anything it cannot read is treated as no record.
    """
    pos = 0
    while pos < len(ndef_data):
        header = ndef_data[pos]
        pos += 1

        message_end = bool(header & 0x40)
        short_record = bool(header & 0x10)
        id_present = bool(header & 0x08)
        tnf = header & 0x07

        if pos >= len(ndef_data):
            break
        type_length = ndef_data[pos]
        pos += 1

        length_result = _read_ndef_length(ndef_data, pos, short_record=short_record)
        if length_result is None:
            break
        payload_length, pos = length_result

        id_length = 0
        if id_present:
            if pos >= len(ndef_data):
                break
            id_length = ndef_data[pos]
            pos += 1

        record_type = ndef_data[pos : pos + type_length]
        pos += type_length

        pos += id_length  # skip ID

        payload = ndef_data[pos : pos + payload_length]
        pos += payload_length

        if tnf == _NDEF_TNF_MEDIA_TYPE and record_type == OPENPRINTTAG_MIME.encode("ascii"):
            return bytes(payload)

        if message_end:
            break

    return None


_NFC_V_UID_LENGTH = 8
_NFC_V_UID_LEAD_BYTE = 0xE0


def _spec_order_uid(uid: bytes | None) -> bytes | None:
    """Return an 8-byte NFC-V UID in specification order, which starts with E0."""
    if uid is None or len(uid) != _NFC_V_UID_LENGTH:
        return uid
    if uid[-1] == _NFC_V_UID_LEAD_BYTE and uid[0] != _NFC_V_UID_LEAD_BYTE:
        return uid[::-1]
    return uid


def decode_nfcv_memory(raw_bytes: bytes, nfc_tag_uid: bytes | None = None) -> OpenPrintTagData:
    """Decode OpenPrintTag data from raw NFC-V tag memory.

    Args:
        raw_bytes: Full tag memory dump (e.g. 320 bytes for ICODE SLIX2).
        nfc_tag_uid: Optional NFC tag UID for instance_uuid derivation.

    Returns:
        OpenPrintTagData with the decoded fields.

    Raises:
        ValueError: If the data cannot be parsed.

    """
    payload = _find_ndef_payload(raw_bytes)
    if payload is None:
        raise ValueError("Could not find OpenPrintTag NDEF record in tag memory")

    data = OpenPrintTagData(nfc_tag_uid=_spec_order_uid(nfc_tag_uid))

    # Parse meta section (first CBOR object in payload)
    meta, meta_size = _decode_cbor_map(payload)

    main_offset = meta.get(META_MAIN_REGION_OFFSET, meta_size)
    aux_offset = meta.get(META_AUX_REGION_OFFSET)

    if not isinstance(main_offset, int) or main_offset < 0:
        raise ValueError("Invalid main region offset in OpenPrintTag meta section")
    if not isinstance(aux_offset, int) or aux_offset < 0:
        aux_offset = None  # the aux section is optional; a bad offset just means there isn't one

    # Parse main section
    if main_offset < len(payload):
        main_data, _ = _decode_cbor_map(payload[main_offset:])
        _populate_main_fields(data, main_data)

    # Parse aux section if present
    if aux_offset is not None and aux_offset < len(payload):
        try:
            aux_data, _ = _decode_cbor_map(payload[aux_offset:])
            if AUX_CONSUMED_WEIGHT in aux_data:
                data.consumed_weight = _number(aux_data[AUX_CONSUMED_WEIGHT])
        except (cbor2.CBORDecodeError, TypeError, ValueError):
            logger.debug("Could not decode aux section")

    return data


def _number(value: object) -> float:
    """Read a CBOR number as a float. Anything else makes the whole tag undecodable.

    A list, a string, a boolean, an integer too large to be a physical measurement, NaN and
    infinity are all refused here, rather than being stored or silently dropped.
    """
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise TypeError(f"Expected a number, got {type(value).__name__}")
    if isinstance(value, int) and abs(value) > 2**53:
        raise ValueError("Integer too large to be a physical measurement")
    result = float(value)
    if not math.isfinite(result):
        raise ValueError("Expected a finite number")
    return result


# (main-section CBOR key, OpenPrintTagData attribute, value caster) for every field that is a
# plain cast with no further lookup. UUIDs, the enum-mapped fields and the color are handled
# separately in _populate_main_fields.
# Text is capped at the codec level: a crafted tag must not be able to make decoding allocate much.
# Create also checks the real column limits, so a name that is too long is refused, not stored.
_MAX_TEXT_LENGTH = 1024
_INT32_MIN, _INT32_MAX = -(2**31), 2**31 - 1
_GTIN_MAX = 2**63 - 1


def _text(value: object) -> str:
    """Read a CBOR text string. Byte strings, numbers and nested values are refused."""
    if not isinstance(value, str) or len(value) > _MAX_TEXT_LENGTH:
        raise TypeError("Expected a text string of reasonable length")
    return value


def _int_between(value: object, low: int, high: int) -> int:
    """Read a CBOR integer in range. Booleans, floats, bignums and out-of-range values are refused."""
    if isinstance(value, bool) or not isinstance(value, int) or not low <= value <= high:
        raise TypeError("Expected an integer in range")
    return value


def _int32(value: object) -> int:
    return _int_between(value, _INT32_MIN, _INT32_MAX)


def _gtin(value: object) -> int:
    return _int_between(value, 0, _GTIN_MAX)


_SIMPLE_MAIN_FIELDS: list[tuple[int, str, object]] = [
    (MF_GTIN, "gtin", _gtin),
    (MF_MATERIAL_NAME, "material_name", _text),
    (MF_BRAND_NAME, "brand_name", _text),
    (MF_DENSITY, "density", _number),
    (MF_FILAMENT_DIAMETER, "filament_diameter", _number),
    (MF_NOMINAL_NETTO_FULL_WEIGHT, "nominal_netto_full_weight", _number),
    (MF_ACTUAL_NETTO_FULL_WEIGHT, "actual_netto_full_weight", _number),
    (MF_EMPTY_CONTAINER_WEIGHT, "empty_container_weight", _number),
    (MF_MIN_PRINT_TEMPERATURE, "min_print_temperature", _int32),
    (MF_MAX_PRINT_TEMPERATURE, "max_print_temperature", _int32),
    (MF_MIN_BED_TEMPERATURE, "min_bed_temperature", _int32),
    (MF_MAX_BED_TEMPERATURE, "max_bed_temperature", _int32),
]


def _populate_main_uuids(data: OpenPrintTagData, main: dict) -> None:
    """Populate the roll's own UUID from the decoded main CBOR map."""
    if MF_INSTANCE_UUID in main:
        data.instance_uuid = _parse_uuid(main[MF_INSTANCE_UUID])


def _populate_main_fields(data: OpenPrintTagData, main: dict) -> None:
    """Populate OpenPrintTagData from the decoded main CBOR map."""
    for key, attr, caster in _SIMPLE_MAIN_FIELDS:
        if key in main:
            setattr(data, attr, caster(main[key]))

    _populate_main_uuids(data, main)

    if MF_MATERIAL_CLASS in main:
        data.material_class = MATERIAL_CLASS_MAP.get(main[MF_MATERIAL_CLASS])
    if MF_MATERIAL_TYPE in main:
        data.material_type = MATERIAL_TYPE_MAP.get(main[MF_MATERIAL_TYPE])

    if MF_PRIMARY_COLOR in main:
        data.primary_color_hex = _parse_color_rgba(main[MF_PRIMARY_COLOR])

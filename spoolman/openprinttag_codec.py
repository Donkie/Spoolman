"""OpenPrintTag NDEF/CBOR decoder for NFC-V (ISO 15693) tags.

Decodes OpenPrintTag data from ICODE SLIX2 NFC-V tag memory.
The data is stored as an NDEF record with MIME type application/vnd.openprinttag,
containing CBOR-encoded sections (meta, main, aux).

Based on the OpenPrintTag specification: https://specs.openprinttag.org
"""

import io
import logging
import uuid
from dataclasses import dataclass, field

import cbor2

logger = logging.getLogger(__name__)

OPENPRINTTAG_MIME = "application/vnd.openprinttag"

# Material type enum (key -> abbreviation) from material_type_enum.yaml
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
}

# Material class enum
MATERIAL_CLASS_MAP: dict[int, str] = {
    0: "FFF",
    1: "SLA",
}

# UUID namespaces for deriving UUIDs from other fields
UUID_NS_BRAND = uuid.UUID("5269dfb7-1559-440a-85be-aba5f3eff2d2")
UUID_NS_MATERIAL = uuid.UUID("616fc86d-7d99-4953-96c7-46d2836b9be9")
UUID_NS_PACKAGE = uuid.UUID("6f7d485e-db8d-4979-904e-a231cd6602b2")
UUID_NS_INSTANCE = uuid.UUID("31062f81-b5bd-4f86-a5f8-46367e841508")

# Main section field keys
MF_INSTANCE_UUID = 0
MF_PACKAGE_UUID = 1
MF_MATERIAL_UUID = 2
MF_BRAND_UUID = 3
MF_GTIN = 4
MF_MATERIAL_CLASS = 8
MF_MATERIAL_TYPE = 9
MF_MATERIAL_NAME = 10
MF_BRAND_NAME = 11
MF_MANUFACTURED_DATE = 14
MF_NOMINAL_NETTO_FULL_WEIGHT = 16
MF_ACTUAL_NETTO_FULL_WEIGHT = 17
MF_EMPTY_CONTAINER_WEIGHT = 18
MF_PRIMARY_COLOR = 19
MF_DENSITY = 29
MF_FILAMENT_DIAMETER = 30
MF_MIN_PRINT_TEMPERATURE = 34
MF_MAX_PRINT_TEMPERATURE = 35
MF_PREHEAT_TEMPERATURE = 36
MF_MIN_BED_TEMPERATURE = 37
MF_MAX_BED_TEMPERATURE = 38
MF_DRYING_TEMPERATURE = 57
MF_DRYING_TIME = 58

# Meta section field keys
META_MAIN_REGION_OFFSET = 0
META_MAIN_REGION_SIZE = 1
META_AUX_REGION_OFFSET = 2
META_AUX_REGION_SIZE = 3

# Aux section field keys
AUX_CONSUMED_WEIGHT = 0


@dataclass
class OpenPrintTagData:
    """All data decoded from an OpenPrintTag NFC tag."""

    # UUIDs
    instance_uuid: str | None = None
    package_uuid: str | None = None
    material_uuid: str | None = None
    brand_uuid: str | None = None

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

    # Weights (grams)
    nominal_netto_full_weight: float | None = None
    actual_netto_full_weight: float | None = None
    empty_container_weight: float | None = None
    consumed_weight: float | None = None  # from aux section

    # Color as hex string (without #)
    primary_color_hex: str | None = None

    # Temperatures (°C)
    min_print_temperature: int | None = None
    max_print_temperature: int | None = None
    preheat_temperature: int | None = None
    min_bed_temperature: int | None = None
    max_bed_temperature: int | None = None
    drying_temperature: int | None = None
    drying_time: int | None = None  # minutes

    # Dates
    manufactured_date: int | None = None  # unix timestamp

    # Raw NFC tag UID (for UUID derivation)
    nfc_tag_uid: bytes | None = None

    @property
    def effective_diameter(self) -> float:
        """Get filament diameter, defaulting to 1.75mm per spec."""
        return self.filament_diameter if self.filament_diameter else 1.75

    @property
    def effective_weight(self) -> float | None:
        """Get the best available net weight."""
        return self.actual_netto_full_weight or self.nominal_netto_full_weight

    @property
    def effective_instance_uuid(self) -> str | None:
        """Get instance UUID, deriving from tag UID if not explicit."""
        if self.instance_uuid:
            return self.instance_uuid
        if self.nfc_tag_uid:
            derived = uuid.uuid5(UUID_NS_INSTANCE, self.nfc_tag_uid)
            return str(derived)
        return None

    @property
    def effective_brand_uuid(self) -> str | None:
        """Get brand UUID, deriving from brand_name if not explicit."""
        if self.brand_uuid:
            return self.brand_uuid
        if self.brand_name:
            derived = uuid.uuid5(UUID_NS_BRAND, self.brand_name.encode("utf-8"))
            return str(derived)
        return None


def _parse_color_rgba(data: bytes) -> str | None:
    """Convert RGBA byte string to hex color (RGB only, drop alpha)."""
    if len(data) >= 3:  # noqa: PLR2004
        return f"{data[0]:02x}{data[1]:02x}{data[2]:02x}"
    return None


def _parse_uuid(data: bytes) -> str | None:
    """Convert CBOR byte string to UUID string."""
    if len(data) == 16:  # noqa: PLR2004
        return str(uuid.UUID(bytes=bytes(data)))
    return None


def _decode_cbor_map(raw: bytes) -> tuple[dict, int]:
    """Decode a CBOR map from bytes, return (map, bytes_consumed)."""
    buf = io.BytesIO(raw)
    data = cbor2.load(buf)
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
        if pos >= len(raw_bytes):
            break
        tag = raw_bytes[pos]
        pos += 1

        if tag == 0xFE:  # terminator
            break
        if tag == 0x00:  # null TLV, no length
            continue

        if pos >= len(raw_bytes):
            break
        tlv_len = raw_bytes[pos]
        pos += 1

        if tlv_len == 0xFF:  # 3-byte length format
            if pos + 2 > len(raw_bytes):
                break
            tlv_len = (raw_bytes[pos] << 8) | raw_bytes[pos + 1]
            pos += 2

        if tag == 0x03:  # NDEF message TLV
            ndef_data = raw_bytes[pos : pos + tlv_len]
            return _parse_ndef_records(ndef_data)

        pos += tlv_len  # skip non-NDEF TLVs

    return None


def _parse_ndef_records(ndef_data: bytes) -> bytes | None:
    """Parse NDEF message bytes and extract the OpenPrintTag record payload."""
    try:
        import ndef  # noqa: PLC0415
    except ImportError:
        # Fall back to manual NDEF parsing if ndeflib is not available
        return _parse_ndef_manual(ndef_data)

    for record in ndef.message_decoder(io.BytesIO(ndef_data)):
        if record.type == OPENPRINTTAG_MIME:
            return bytes(record.data)

    return None


def _parse_ndef_manual(ndef_data: bytes) -> bytes | None:
    """Minimal NDEF record parser for application/vnd.openprinttag.

    Handles short and standard NDEF records without requiring ndeflib.
    """
    pos = 0
    while pos < len(ndef_data):
        if pos >= len(ndef_data):
            break
        header = ndef_data[pos]
        pos += 1

        mb = bool(header & 0x80)  # noqa: F841
        me = bool(header & 0x40)
        cf = bool(header & 0x20)
        sr = bool(header & 0x10)
        il = bool(header & 0x08)
        tnf = header & 0x07

        if pos >= len(ndef_data):
            break
        type_length = ndef_data[pos]
        pos += 1

        if sr:
            if pos >= len(ndef_data):
                break
            payload_length = ndef_data[pos]
            pos += 1
        else:
            if pos + 4 > len(ndef_data):
                break
            payload_length = int.from_bytes(ndef_data[pos : pos + 4], "big")
            pos += 4

        id_length = 0
        if il:
            if pos >= len(ndef_data):
                break
            id_length = ndef_data[pos]
            pos += 1

        record_type = ndef_data[pos : pos + type_length]
        pos += type_length

        pos += id_length  # skip ID

        payload = ndef_data[pos : pos + payload_length]
        pos += payload_length

        # TNF 0x02 = Media-type (RFC 2046)
        if tnf == 0x02 and record_type == OPENPRINTTAG_MIME.encode("ascii"):
            return bytes(payload)

        if me:
            break

    return None


def decode_nfcv_memory(raw_bytes: bytes, nfc_tag_uid: bytes | None = None) -> OpenPrintTagData:
    """Decode OpenPrintTag data from raw NFC-V tag memory.

    Args:
        raw_bytes: Full tag memory dump (e.g. 320 bytes for ICODE SLIX2).
        nfc_tag_uid: Optional NFC tag UID for instance_uuid derivation.

    Returns:
        OpenPrintTagData with all decoded fields.

    Raises:
        ValueError: If the data cannot be parsed.

    """
    payload = _find_ndef_payload(raw_bytes)
    if payload is None:
        raise ValueError("Could not find OpenPrintTag NDEF record in tag memory")

    data = OpenPrintTagData(nfc_tag_uid=nfc_tag_uid)

    # Parse meta section (first CBOR object in payload)
    meta, meta_size = _decode_cbor_map(payload)

    main_offset = meta.get(META_MAIN_REGION_OFFSET, meta_size)
    aux_offset = meta.get(META_AUX_REGION_OFFSET)

    # Parse main section
    if main_offset < len(payload):
        main_data, _ = _decode_cbor_map(payload[main_offset:])
        _populate_main_fields(data, main_data)

    # Parse aux section if present
    if aux_offset is not None and aux_offset < len(payload):
        try:
            aux_data, _ = _decode_cbor_map(payload[aux_offset:])
            if AUX_CONSUMED_WEIGHT in aux_data:
                data.consumed_weight = float(aux_data[AUX_CONSUMED_WEIGHT])
        except Exception:
            logger.debug("Could not decode aux section")

    return data


def _populate_main_fields(data: OpenPrintTagData, main: dict) -> None:
    """Populate OpenPrintTagData from the decoded main CBOR map."""
    # UUIDs (stored as CBOR byte strings)
    if MF_INSTANCE_UUID in main:
        data.instance_uuid = _parse_uuid(main[MF_INSTANCE_UUID])
    if MF_PACKAGE_UUID in main:
        data.package_uuid = _parse_uuid(main[MF_PACKAGE_UUID])
    if MF_MATERIAL_UUID in main:
        data.material_uuid = _parse_uuid(main[MF_MATERIAL_UUID])
    if MF_BRAND_UUID in main:
        data.brand_uuid = _parse_uuid(main[MF_BRAND_UUID])

    # Identifiers
    if MF_GTIN in main:
        data.gtin = int(main[MF_GTIN])

    # Material classification
    if MF_MATERIAL_CLASS in main:
        data.material_class = MATERIAL_CLASS_MAP.get(main[MF_MATERIAL_CLASS], f"unknown_{main[MF_MATERIAL_CLASS]}")
    if MF_MATERIAL_TYPE in main:
        data.material_type = MATERIAL_TYPE_MAP.get(main[MF_MATERIAL_TYPE], f"unknown_{main[MF_MATERIAL_TYPE]}")

    # Strings
    if MF_MATERIAL_NAME in main:
        data.material_name = str(main[MF_MATERIAL_NAME])
    if MF_BRAND_NAME in main:
        data.brand_name = str(main[MF_BRAND_NAME])

    # Physical properties
    if MF_DENSITY in main:
        data.density = float(main[MF_DENSITY])
    if MF_FILAMENT_DIAMETER in main:
        data.filament_diameter = float(main[MF_FILAMENT_DIAMETER])

    # Weights
    if MF_NOMINAL_NETTO_FULL_WEIGHT in main:
        data.nominal_netto_full_weight = float(main[MF_NOMINAL_NETTO_FULL_WEIGHT])
    if MF_ACTUAL_NETTO_FULL_WEIGHT in main:
        data.actual_netto_full_weight = float(main[MF_ACTUAL_NETTO_FULL_WEIGHT])
    if MF_EMPTY_CONTAINER_WEIGHT in main:
        data.empty_container_weight = float(main[MF_EMPTY_CONTAINER_WEIGHT])

    # Color
    if MF_PRIMARY_COLOR in main:
        data.primary_color_hex = _parse_color_rgba(main[MF_PRIMARY_COLOR])

    # Temperatures
    if MF_MIN_PRINT_TEMPERATURE in main:
        data.min_print_temperature = int(main[MF_MIN_PRINT_TEMPERATURE])
    if MF_MAX_PRINT_TEMPERATURE in main:
        data.max_print_temperature = int(main[MF_MAX_PRINT_TEMPERATURE])
    if MF_PREHEAT_TEMPERATURE in main:
        data.preheat_temperature = int(main[MF_PREHEAT_TEMPERATURE])
    if MF_MIN_BED_TEMPERATURE in main:
        data.min_bed_temperature = int(main[MF_MIN_BED_TEMPERATURE])
    if MF_MAX_BED_TEMPERATURE in main:
        data.max_bed_temperature = int(main[MF_MAX_BED_TEMPERATURE])
    if MF_DRYING_TEMPERATURE in main:
        data.drying_temperature = int(main[MF_DRYING_TEMPERATURE])
    if MF_DRYING_TIME in main:
        data.drying_time = int(main[MF_DRYING_TIME])

    # Dates
    if MF_MANUFACTURED_DATE in main:
        data.manufactured_date = int(main[MF_MANUFACTURED_DATE])


def encode_aux_consumed_weight(payload: bytes, consumed_weight: float) -> bytes:
    """Update the consumed_weight in the aux section of an OpenPrintTag payload.

    Args:
        payload: The original NDEF record payload (CBOR sections).
        consumed_weight: New consumed weight in grams.

    Returns:
        Updated payload bytes with the aux section modified.

    """
    meta, meta_size = _decode_cbor_map(payload)
    aux_offset = meta.get(META_AUX_REGION_OFFSET)
    if aux_offset is None:
        raise ValueError("Tag has no aux region")

    aux_size = meta.get(META_AUX_REGION_SIZE)
    if aux_size is None:
        # Aux extends to end of payload
        aux_size = len(payload) - aux_offset

    # Read existing aux data to preserve unknown fields
    try:
        aux_data, _ = _decode_cbor_map(payload[aux_offset:aux_offset + aux_size])
    except Exception:
        aux_data = {}

    aux_data[AUX_CONSUMED_WEIGHT] = consumed_weight

    new_aux = cbor2.dumps(aux_data)
    if len(new_aux) > aux_size:
        raise ValueError(f"Encoded aux section ({len(new_aux)} bytes) exceeds region size ({aux_size} bytes)")

    result = bytearray(payload)
    # Zero the aux region, then write new data
    result[aux_offset:aux_offset + aux_size] = b"\x00" * aux_size
    result[aux_offset:aux_offset + len(new_aux)] = new_aux
    return bytes(result)

"""Decode a scanned tag's raw payload into fields the rest of Spoolman understands.

`POST /tag/scan` (spoolman/api/v1/tag.py) accepts a `format` and a raw `payload_b64` but,
on its own, never looks inside them -- that split is deliberate (see spoolman/tags/__init__.py):
the scan-relay layer only ever needs a UID. Format-specific decoding lives in one module per
format (openprinttag.py here, more later), and `decode()` is the one place that knows which
module answers for which format string.

Decoding is best-effort and pure: no database, no FastAPI. An unrecognized format or a payload
that fails to parse returns None rather than raising -- a scan's core contract (resolve a UID)
must never fail because enrichment of it didn't work.
"""

import logging
import math
from dataclasses import dataclass

from spoolman.tags import normalize_format

logger = logging.getLogger(__name__)


@dataclass
class DecodedTag:
    """Tag contents named after the fields of the rest of the API.

    Deliberately flatter than any one codec's own dataclass: every format's decode funnels into
    this shape, so the wiring in tag.py and database/tag.py never has to know which codec
    produced it.
    """

    material_class: str | None = None  # "FFF" or "SLA"; only FFF tags can create a filament
    material: str | None = None  # e.g. "PLA"
    name: str | None = None  # e.g. "PLA Galaxy Black"
    vendor_name: str | None = None  # e.g. "Prusament"
    article_number: str | None = None  # vendor GTIN, as text
    color_hex: str | None = None
    diameter: float | None = None
    density: float | None = None
    weight: float | None = None  # nominal full net weight of the filament, in grams
    initial_weight: float | None = None  # measured net weight on this roll, in grams
    spool_weight: float | None = None  # tare weight of the empty spool, in grams
    used_weight: float | None = None  # already used, per the tag -- shown, never applied automatically
    extruder_temp: int | None = None  # print temperature, °C
    bed_temp: int | None = None  # bed temperature, °C
    instance_uuid: str | None = None  # identifies this roll, not the product


# Approximate densities (g/cm^3) for common materials, used only as a fallback when a
# decoded tag doesn't carry its own density and the caller needs one anyway (creating a
# Filament requires a density -- see spoolman.database.filament.create). These are rough
# industry-typical values, not per-manufacturer figures; a wrong guess here is still better
# than refusing to auto-create a spool over a field most tags never bothered to include.
APPROXIMATE_DENSITY_BY_MATERIAL: dict[str, float] = {
    "PLA": 1.24,
    "PETG": 1.27,
    "ABS": 1.04,
    "ASA": 1.07,
    "TPU": 1.21,
    "PA6": 1.14,
    "PA11": 1.03,
    "PA12": 1.01,
    "PA66": 1.15,
    "PC": 1.20,
    "PCTG": 1.23,
    "HIPS": 1.04,
    "PVA": 1.23,
}

# Used when even the material type is unknown. PLA is the most common filament by far, so
# it is the least-wrong default rather than a principled one.
_FALLBACK_DENSITY = 1.24


def approximate_density(material: str | None) -> float | None:
    """Look up a rough density for a material, or None if it is not in the table."""
    if material is None:
        return None
    return APPROXIMATE_DENSITY_BY_MATERIAL.get(material.upper())


def density_or_fallback(material: str | None) -> float:
    """Approximate density for a material, or the PLA-equivalent fallback."""
    return approximate_density(material) or _FALLBACK_DENSITY


def _finite(value: float | None) -> float | None:
    """Drop NaN and infinity: CBOR can carry them, but JSON cannot, and neither is storable."""
    if value is None or math.isfinite(value):
        return value
    return None


def decode(tag_format: str | None, payload: bytes, uid_bytes: bytes | None = None) -> DecodedTag | None:
    """Decode a tag's raw payload for a known format.

    Args:
        tag_format: The format string as reported by the scanning agent, e.g. "openprinttag".
            Matched case-insensitively via the same normalization the storage layer uses.
        payload: The tag's raw contents.
        uid_bytes: The tag's UID as raw bytes, if available. Some formats (OpenPrintTag) derive
            the instance identifier from it when the tag itself doesn't carry one.

    Returns:
        DecodedTag | None: The decoded fields, or None if the format is unknown or the payload
        could not be decoded. Never raises: whatever a hostile or damaged payload does to a
        codec, the scan carries on as if the payload were not decodable.

    """
    fmt = normalize_format(tag_format)
    try:
        if fmt == "openprinttag":
            return _decode_openprinttag(payload, uid_bytes)
    except Exception:  # noqa: BLE001 -- best effort by contract, see the module docstring
        logger.warning("Could not decode %s payload", fmt, exc_info=True)
    return None


def _decode_openprinttag(payload: bytes, uid_bytes: bytes | None) -> DecodedTag | None:
    # Imported here, not at module level: cbor2 is only needed when a payload actually arrives,
    # so a missing or broken cbor2 must not stop the server from starting.
    from spoolman.tags import openprinttag as openprinttag_codec  # noqa: PLC0415

    try:
        data = openprinttag_codec.decode_nfcv_memory(payload, nfc_tag_uid=uid_bytes)
    except ValueError:
        logger.debug("Could not decode payload as OpenPrintTag", exc_info=True)
        return None

    # Print and bed temperatures come as a range. Use the upper end: it is the value a
    # profile is normally set to, and it is still inside the range the vendor specifies.
    extruder_temp = data.max_print_temperature or data.min_print_temperature
    bed_temp = data.max_bed_temperature or data.min_bed_temperature

    return DecodedTag(
        material_class=data.material_class,
        material=data.material_type,
        name=data.material_name,
        vendor_name=data.brand_name,
        article_number=str(data.gtin) if data.gtin is not None else None,
        color_hex=data.primary_color_hex,
        diameter=_finite(data.effective_diameter),
        density=_finite(data.density),
        weight=_finite(data.nominal_netto_full_weight),
        initial_weight=_finite(data.actual_netto_full_weight),
        spool_weight=_finite(data.empty_container_weight),
        used_weight=_finite(data.consumed_weight),
        extruder_temp=extruder_temp,
        bed_temp=bed_temp,
        instance_uuid=data.effective_instance_uuid,
    )

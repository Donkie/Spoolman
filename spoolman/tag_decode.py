"""Decode a scanned tag's raw payload into fields the rest of Spoolman understands.

`POST /tag/scan` (spoolman/api/v1/tag.py) accepts a `format` and a raw `payload_b64` but,
on its own, never looks inside them -- that split is deliberate (see spoolman/tags.py): the
scan-relay layer only ever needs a UID. This module is where "Spoolman owns the codec" gets
exercised: format-specific decoding lives in its own codec module (openprinttag_codec.py and,
as later PRs add them, tigertag_codec.py / qidi_codec.py), and `decode()` is the one place
that knows which codec answers for which format string.

Decoding is best-effort and pure: no database, no FastAPI, mirrors tags.py in that regard.
An unrecognized format or a payload that fails to parse returns None rather than raising --
a scan's core contract (resolve a UID) must never fail because enrichment of it didn't work.
"""

import logging
from dataclasses import dataclass

from spoolman import openprinttag_codec
from spoolman.tags import normalize_format

logger = logging.getLogger(__name__)


@dataclass
class DecodedTag:
    """Tag contents normalized to the fields Spoolman's data model cares about.

    Deliberately flatter than any one codec's own dataclass (e.g. OpenPrintTagData): this is
    the shape every format's decode eventually funnels into, so the wiring in tag.py and
    database/tag.py never has to know which codec produced it.
    """

    material_type: str | None = None
    material_name: str | None = None
    brand_name: str | None = None
    color_hex: str | None = None
    diameter_mm: float | None = None
    density_g_cm3: float | None = None
    net_weight_g: float | None = None  # full net filament weight, before any use
    empty_container_weight_g: float | None = None  # tare weight of the spool itself
    consumed_weight_g: float | None = None  # already used, per the tag -- shown, never applied automatically
    external_id: str | None = None  # a stable id for the specific roll/instance, if the tag carries one


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


def approximate_density(material_type: str | None) -> float | None:
    """Look up a rough density for a material type, or None if it is not in the table."""
    if material_type is None:
        return None
    return APPROXIMATE_DENSITY_BY_MATERIAL.get(material_type.upper())


def density_or_fallback(material_type: str | None) -> float:
    """Approximate density for a material type, or the PLA-equivalent fallback."""
    return approximate_density(material_type) or _FALLBACK_DENSITY


def decode(tag_format: str | None, payload: bytes, uid_bytes: bytes | None = None) -> DecodedTag | None:
    """Decode a tag's raw payload for a known format.

    Args:
        tag_format: The format string as reported by the scanning agent, e.g. "openprinttag".
            Matched case-insensitively via the same normalization `tags.py` uses for storage.
        payload: The tag's raw contents.
        uid_bytes: The tag's UID as raw bytes, if available. Some formats (OpenPrintTag) can
            derive an instance identifier from it when the tag itself doesn't carry one.

    Returns:
        DecodedTag | None: The decoded fields, or None if the format is unknown or the
        payload could not be parsed as that format.

    """
    fmt = normalize_format(tag_format)
    if fmt == "openprinttag":
        return _decode_openprinttag(payload, uid_bytes)
    return None


def _decode_openprinttag(payload: bytes, uid_bytes: bytes | None) -> DecodedTag | None:
    try:
        data = openprinttag_codec.decode_nfcv_memory(payload, nfc_tag_uid=uid_bytes)
    except ValueError:
        logger.debug("Could not decode payload as OpenPrintTag", exc_info=True)
        return None

    return DecodedTag(
        material_type=data.material_type,
        material_name=data.material_name,
        brand_name=data.brand_name,
        color_hex=data.primary_color_hex,
        diameter_mm=data.effective_diameter,
        density_g_cm3=data.density,
        net_weight_g=data.effective_weight,
        empty_container_weight_g=data.empty_container_weight,
        consumed_weight_g=data.consumed_weight,
        external_id=data.effective_instance_uuid,
    )

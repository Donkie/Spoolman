"""Qidi tag to Spoolman spool matching, binding, and auto-creation.

Provides functions to:
- Find a Spoolman spool from decoded Qidi tag data + tag UID
- Bind a spool to a specific Qidi tag via its hardware UID
- Map a Spoolman spool to Qidi tag format for writing
- Auto-create a filament and spool from Qidi tag data
"""

import logging
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from spoolman.database import filament as filament_db
from spoolman.database import spool as spool_db
from spoolman.database import vendor as vendor_db
from spoolman.database.models import Filament, Spool, SpoolField
from spoolman.qidi_codec import (
    MATERIAL_CODE_MAP,
    QidiTagData,
    color_code_from_hex,
    material_code_from_name,
)

logger = logging.getLogger(__name__)

QIDI_VENDOR_NAME = "Qidi"


def _make_nfc_tag_id(tag_uid_hex: str) -> str:
    """Build a spool-level NFC tag identifier from the MIFARE Classic UID.

    Since Qidi tags only store material+color (not a unique spool ID),
    we use the hardware UID as the binding key.
    """
    return f"qidi_{tag_uid_hex.lower()}"


async def bind_spool_to_qidi_tag(db: AsyncSession, spool: Spool, tag_uid_hex: str) -> bool:
    """Bind a spool to a specific Qidi tag by storing its hardware UID.

    Stores a SpoolField with key="nfc_tag_id" so future scans resolve to this
    exact spool.

    Returns True if a new binding was created, False if already bound.
    """
    nfc_tag_id = _make_nfc_tag_id(tag_uid_hex)

    for field in spool.extra:
        if field.key == "nfc_tag_id":
            if field.value == nfc_tag_id:
                return False  # Already bound to this tag
            logger.debug("Spool %d already bound to %s, not rebinding to %s", spool.id, field.value, nfc_tag_id)
            return False

    db.add(SpoolField(spool_id=spool.id, key="nfc_tag_id", value=nfc_tag_id))
    await db.flush()
    logger.info("Bound spool %d to Qidi tag %s", spool.id, nfc_tag_id)
    return True


async def find_spool_by_qidi_tag(
    db: AsyncSession,
    tag_data: QidiTagData,
    tag_uid_hex: str | None = None,
    auto_bind: bool = True,
) -> Optional[Spool]:
    """Find a Spoolman spool matching a Qidi tag.

    Matching strategies (tried in order):
    1. Exact match by nfc_tag_id SpoolField == "qidi_{uid}" (bound tag)
    2. Fuzzy match by material type + color hex on filament

    When auto_bind is True and a spool is found via strategy 2,
    the tag is automatically bound for future exact matches.

    Args:
        db: Database session.
        tag_data: Decoded Qidi tag data.
        tag_uid_hex: Hex-encoded MIFARE Classic UID (e.g. "A1B2C3D4").
        auto_bind: Automatically bind unbound tags to matched spools.

    Returns:
        The matched spool, or None if no match found.
    """
    # Strategy 1: Exact match by UID binding
    if tag_uid_hex:
        nfc_tag_id = _make_nfc_tag_id(tag_uid_hex)
        stmt = (
            select(Spool)
            .join(Spool.extra)
            .options(
                selectinload(Spool.filament).selectinload(Filament.vendor),
                selectinload(Spool.extra),
            )
            .where(SpoolField.key == "nfc_tag_id")
            .where(SpoolField.value == nfc_tag_id)
            .limit(1)
        )
        result = await db.execute(stmt)
        spool = result.unique().scalar_one_or_none()
        if spool is not None:
            logger.debug("Qidi exact match: spool %d via nfc_tag_id %s", spool.id, nfc_tag_id)
            return spool

    # Strategy 2: Fuzzy match by material + color on filament
    color_hex = tag_data.color_hex.lower()
    material_type = tag_data.material_type

    stmt = (
        select(Spool)
        .join(Spool.filament)
        .options(
            selectinload(Spool.filament).selectinload(Filament.vendor),
            selectinload(Spool.extra),
        )
        .where(Filament.material == material_type)
        .where(Filament.color_hex == color_hex)
        .where(Spool.archived.is_(False))
        .order_by(Spool.registered.desc())
        .limit(1)
    )
    result = await db.execute(stmt)
    spool = result.unique().scalar_one_or_none()
    if spool is not None:
        logger.debug("Qidi fuzzy match: spool %d via material=%s color=%s", spool.id, material_type, color_hex)
        if auto_bind and tag_uid_hex:
            await bind_spool_to_qidi_tag(db, spool, tag_uid_hex)
        return spool

    return None


def map_spool_to_qidi(spool: Spool) -> QidiTagData:
    """Map a Spoolman spool/filament to Qidi tag data for writing.

    Args:
        spool: The Spoolman spool to encode.

    Returns:
        QidiTagData ready for encoding.
    """
    filament = spool.filament
    data = QidiTagData()

    # Material code lookup
    if filament.material:
        # Try exact Qidi material name first (e.g. "PLA Silk")
        code = material_code_from_name(filament.material)
        if code is not None:
            data.material_code = code
        else:
            # Try matching the Spoolman material type to any Qidi material
            # Pick the first (most generic) match
            material_lower = filament.material.lower()
            for c, (_name, spoolman_type) in sorted(MATERIAL_CODE_MAP.items()):
                if spoolman_type.lower() == material_lower:
                    data.material_code = c
                    break

    # Color code lookup
    if filament.color_hex:
        code = color_code_from_hex(filament.color_hex)
        if code is not None:
            data.color_code = code

    return data


async def create_spool_from_qidi_tag(
    db: AsyncSession,
    tag_data: QidiTagData,
    tag_uid_hex: str | None = None,
) -> Spool:
    """Create a filament and spool from Qidi tag data.

    Creates a Qidi vendor (if needed), filament with the tag's material/color,
    and a spool linked to it. Binds the tag UID if available.
    """
    # Find or create Qidi vendor
    vendor_id = await _find_or_create_vendor(db, QIDI_VENDOR_NAME)

    # Build filament name from material
    name = f"Qidi {tag_data.material_name}"

    # Use the Qidi color as the filament color
    color_hex = tag_data.color_hex if tag_data.color_hex != "000000" else None

    # Default diameter 1.75mm (Qidi tags don't store diameter)
    db_filament = await filament_db.create(
        db=db,
        density=1.24,
        diameter=1.75,
        name=name,
        vendor_id=vendor_id,
        material=tag_data.material_type,
        weight=None,
        color_hex=color_hex,
        external_id=None,
    )

    db_spool = await spool_db.create(db=db, filament_id=db_filament.id)

    # Bind tag UID to spool
    if tag_uid_hex:
        nfc_tag_id = _make_nfc_tag_id(tag_uid_hex)
        db.add(SpoolField(spool_id=db_spool.id, key="nfc_tag_id", value=nfc_tag_id))
        await db.flush()
        logger.info("Bound new spool %d to Qidi tag %s", db_spool.id, nfc_tag_id)

    return db_spool


async def _find_or_create_vendor(db: AsyncSession, name: str) -> int:
    """Find a vendor by name or create one."""
    vendors, _ = await vendor_db.find(db=db, name=name)
    if vendors:
        return vendors[0].id
    new_vendor = await vendor_db.create(db=db, name=name)
    return new_vendor.id

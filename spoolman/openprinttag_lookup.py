"""OpenPrintTag to Spoolman spool matching and auto-creation.

Provides functions to:
- Find a Spoolman spool from decoded OpenPrintTag data
- Auto-create a filament and spool from OpenPrintTag data on first scan
"""

import logging
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from spoolman.database import filament as filament_db
from spoolman.database import spool as spool_db
from spoolman.database import vendor as vendor_db
from spoolman.database.models import Filament, Spool
from spoolman.openprinttag_codec import OpenPrintTagData

logger = logging.getLogger(__name__)


async def find_spool_by_openprinttag(db: AsyncSession, tag_data: OpenPrintTagData) -> Optional[Spool]:
    """Find a Spoolman spool matching OpenPrintTag data.

    Matching strategy (in order):
    1. Match by external_id == "opt_{instance_uuid}" — exact physical spool
    2. Match by external_id == "opt_pkg_{package_uuid}" — same product

    Returns the most recent non-archived spool for the matched filament.
    """
    instance_uuid = tag_data.effective_instance_uuid

    # Strategy 1: Match by instance UUID (specific physical spool)
    if instance_uuid:
        external_id = f"opt_{instance_uuid}"
        spool = await _find_spool_by_filament_external_id(db, external_id)
        if spool is not None:
            return spool

    # Strategy 2: Match by package UUID (same product)
    if tag_data.package_uuid:
        external_id = f"opt_pkg_{tag_data.package_uuid}"
        spool = await _find_spool_by_filament_external_id(db, external_id)
        if spool is not None:
            return spool

    return None


async def create_spool_from_openprinttag(db: AsyncSession, tag_data: OpenPrintTagData) -> Spool:
    """Create a filament and spool from OpenPrintTag data.

    Creates or finds the vendor, creates a filament with the tag's material data,
    and creates a spool linked to it.
    """
    instance_uuid = tag_data.effective_instance_uuid
    external_id = f"opt_{instance_uuid}" if instance_uuid else None

    # Check if filament already exists (shouldn't if find didn't match, but be safe)
    if external_id:
        stmt = select(Filament).where(Filament.external_id == external_id)
        result = await db.execute(stmt)
        existing = result.scalar_one_or_none()
        if existing:
            # Filament exists but no spool — create spool only
            return await _create_spool_for_filament(db, existing.id, tag_data)

    # Find or create vendor
    vendor_id = None
    if tag_data.brand_name:
        vendor_id = await _find_or_create_vendor(db, tag_data.brand_name)

    # Build filament name
    if tag_data.material_name:
        name = tag_data.material_name
    elif tag_data.material_type and tag_data.brand_name:
        name = f"{tag_data.brand_name} {tag_data.material_type}"
    elif tag_data.material_type:
        name = tag_data.material_type
    else:
        name = "OpenPrintTag Unknown"

    # Determine extruder temp (use min as the setting)
    extruder_temp = tag_data.min_print_temperature
    bed_temp = tag_data.min_bed_temperature

    db_filament = await filament_db.create(
        db=db,
        density=tag_data.density or 1.24,
        diameter=tag_data.effective_diameter,
        name=name,
        vendor_id=vendor_id,
        material=tag_data.material_type,
        weight=tag_data.effective_weight,
        spool_weight=tag_data.empty_container_weight,
        color_hex=tag_data.primary_color_hex,
        settings_extruder_temp=extruder_temp,
        settings_bed_temp=bed_temp,
        external_id=external_id,
    )

    return await _create_spool_for_filament(db, db_filament.id, tag_data)


async def _create_spool_for_filament(db: AsyncSession, filament_id: int, tag_data: OpenPrintTagData) -> Spool:
    """Create a spool for an existing filament, with consumed weight from the tag."""
    used_weight = tag_data.consumed_weight or 0.0
    return await spool_db.create(
        db=db,
        filament_id=filament_id,
        used_weight=used_weight,
    )


async def _find_spool_by_filament_external_id(db: AsyncSession, external_id: str) -> Optional[Spool]:
    """Find the most recent non-archived spool whose filament has the given external_id."""
    stmt = (
        select(Spool)
        .join(Spool.filament)
        .options(selectinload(Spool.filament).selectinload(Filament.vendor))
        .where(Filament.external_id == external_id)
        .where(Spool.archived.is_(False))
        .order_by(Spool.registered.desc())
        .limit(1)
    )
    result = await db.execute(stmt)
    return result.unique().scalar_one_or_none()


async def _find_or_create_vendor(db: AsyncSession, name: str) -> int:
    """Find a vendor by name or create one."""
    vendors, _ = await vendor_db.find(db=db, name=name)
    if vendors:
        return vendors[0].id
    new_vendor = await vendor_db.create(db=db, name=name)
    return new_vendor.id

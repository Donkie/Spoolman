"""Import filaments from the external database into the local DB."""

from __future__ import annotations

import logging
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from spoolman import externaldb
from spoolman.api.v1.models import MultiColorDirection
from spoolman.database import models

logger = logging.getLogger(__name__)


def _normalize_hex(value: str | None) -> str | None:
    if not value:
        return None
    return value[1:] if value.startswith("#") else value


async def import_external_filaments(
    db: AsyncSession,
    *,
    only_if_empty: bool = True,
) -> int:
    """Import external filaments into the local database.

    Returns the number of imported filaments.
    """
    if only_if_empty:
        existing_count = await db.scalar(select(func.count(models.Filament.id)))
        if existing_count and existing_count > 0:
            logger.info("Skipping external DB import because filaments already exist (%d).", existing_count)
            return 0

    logger.info("Fetching external filaments for import.")
    filaments = await externaldb.fetch_external_filaments()

    existing_vendor_rows = await db.execute(select(models.Vendor))
    vendors_by_external_id = {
        vendor.external_id: vendor for vendor in existing_vendor_rows.scalars().all() if vendor.external_id
    }

    existing_filament_rows = await db.execute(
        select(models.Filament.external_id).where(models.Filament.external_id.is_not(None)),
    )
    existing_filament_ids = {row[0] for row in existing_filament_rows.all() if row[0]}

    now = datetime.utcnow().replace(microsecond=0)
    imported = 0

    for filament in filaments:
        if filament.id in existing_filament_ids:
            continue

        manufacturer = filament.manufacturer.strip()
        vendor_item = vendors_by_external_id.get(manufacturer)
        if vendor_item is None:
            vendor_item = models.Vendor(
                name=manufacturer,
                registered=now,
                comment=None,
                empty_spool_weight=None,
                external_id=manufacturer,
                extra=[],
            )
            db.add(vendor_item)
            await db.flush()
            vendors_by_external_id[manufacturer] = vendor_item

        color_hex = _normalize_hex(filament.color_hex)
        multi_color_hexes = None
        if filament.color_hexes:
            normalized = [_normalize_hex(value) for value in filament.color_hexes]
            multi_color_hexes = ",".join([value for value in normalized if value])

        multi_color_direction = None
        if filament.multi_color_direction is not None:
            multi_color_direction = MultiColorDirection(filament.multi_color_direction.value)

        spool_weight = filament.spool_weight
        if spool_weight is None and vendor_item.empty_spool_weight is not None:
            spool_weight = vendor_item.empty_spool_weight

        db_item = models.Filament(
            registered=now,
            name=filament.name,
            vendor=vendor_item,
            material=filament.material,
            price=None,
            density=filament.density,
            diameter=filament.diameter,
            weight=filament.weight,
            spool_weight=spool_weight,
            article_number=None,
            comment=None,
            settings_extruder_temp=filament.extruder_temp,
            settings_bed_temp=filament.bed_temp,
            color_hex=color_hex if filament.color_hex else None,
            multi_color_hexes=None if filament.color_hex else multi_color_hexes,
            multi_color_direction=multi_color_direction.value if multi_color_direction else None,
            external_id=filament.id,
            extra=[],
        )
        db.add(db_item)
        imported += 1

    await db.commit()
    logger.info("Imported %d external filaments.", imported)
    return imported

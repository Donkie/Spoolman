"""Helper functions for interacting with filament database objects."""

from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from spoolson.database import models, vendor


async def create_filament(
    *,
    db: AsyncSession,
    density: float,
    diameter: float,
    name: Optional[str] = None,
    vendor_id: Optional[int] = None,
    material: Optional[str] = None,
    price: Optional[float] = None,
    weight: Optional[float] = None,
    spool_weight: Optional[float] = None,
    article_number: Optional[str] = None,
    comment: Optional[str] = None,
) -> models.Filament:
    """Add a new filament to the database."""
    vendor_item: Optional[models.Vendor] = None
    if vendor_id is not None:
        vendor_item = await vendor.get_by_id(db, vendor_id)

    db_item = models.Filament(
        name=name,
        vendor=vendor_item,
        material=material,
        price=price,
        density=density,
        diameter=diameter,
        weight=weight,
        spool_weight=spool_weight,
        article_number=article_number,
        comment=comment,
    )
    db.add(db_item)
    await db.flush()
    return db_item

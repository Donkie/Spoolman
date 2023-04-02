"""Helper functions for interacting with spool database objects."""

from datetime import datetime
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from spoolson.database import filament, models
from spoolson.exceptions import ItemCreateError, ItemNotFoundError


async def create(
    *,
    db: AsyncSession,
    filament_id: int,
    weight: Optional[float] = None,
    first_used: Optional[datetime] = None,
    last_used: Optional[datetime] = None,
    location: Optional[str] = None,
    lot_nr: Optional[str] = None,
    comment: Optional[str] = None,
) -> models.Spool:
    """Add a new spool to the database. Leave weight empty to assume full spool."""
    filament_item = await filament.get_by_id(db, filament_id)
    if weight is None:
        if filament_item.weight is None:
            raise ItemCreateError("The weight for neither the spool nor its filament type is set.")
        weight = filament_item.weight

    db_item = models.Spool(
        filament=filament_item,
        weight=weight,
        first_used=first_used,
        last_used=last_used,
        location=location,
        lot_nr=lot_nr,
        comment=comment,
    )
    db.add(db_item)
    await db.flush()
    return db_item


async def get_by_id(db: AsyncSession, spool_id: int) -> models.Spool:
    """Get a spool object from the database by the unique ID."""
    spool = await db.get(models.Spool, spool_id)
    if spool is None:
        raise ItemNotFoundError(f"No spool with ID {spool_id} found.")
    return spool


async def update(
    *,
    db: AsyncSession,
    spool_id: int,
    data: dict,
) -> models.Spool:
    """Update the fields of a spool object."""
    spool = await get_by_id(db, spool_id)
    for k, v in data.items():
        if k == "filament_id":
            spool.filament = await filament.get_by_id(db, v)
        else:
            setattr(spool, k, v)
    await db.flush()
    return spool


async def delete(db: AsyncSession, spool_id: int) -> None:
    """Delete a spool object."""
    spool = await get_by_id(db, spool_id)
    await db.delete(spool)

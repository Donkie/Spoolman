"""Helper functions for interacting with spool database objects."""

from datetime import datetime
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import contains_eager, joinedload

from spoolman.database import filament, models
from spoolman.exceptions import ItemCreateError, ItemNotFoundError
from spoolman.math import weight_from_length


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


async def get_by_id(db: AsyncSession, spool_id: int, with_for_update: Optional[bool] = None) -> models.Spool:
    """Get a spool object from the database by the unique ID."""
    spool = await db.get(
        models.Spool,
        spool_id,
        with_for_update=with_for_update,  # type: ignore  # noqa: PGH003
        options=[joinedload("*")],  # Load all nested objects as well
    )
    if spool is None:
        raise ItemNotFoundError(f"No spool with ID {spool_id} found.")
    return spool


async def find(
    *,
    db: AsyncSession,
    filament_name: Optional[int] = None,
    filament_id: Optional[int] = None,
    filament_material: Optional[str] = None,
    vendor_name: Optional[str] = None,
    vendor_id: Optional[int] = None,
    location: Optional[str] = None,
    lot_nr: Optional[str] = None,
) -> list[models.Spool]:
    """Find a list of spool objects by search criteria."""
    stmt = (
        select(models.Spool)
        .join(models.Spool.filament)
        .join(models.Filament.vendor)
        .options(contains_eager(models.Spool.filament).contains_eager(models.Filament.vendor))
    )
    if filament_name is not None:
        stmt = stmt.where(models.Filament.name.ilike(f"%{filament_name}%"))
    if filament_id is not None:
        stmt = stmt.where(models.Spool.filament_id == filament_id)
    if filament_material is not None:
        stmt = stmt.where(models.Filament.material.ilike(f"%{filament_material}%"))
    if vendor_name is not None:
        stmt = stmt.where(models.Vendor.name.ilike(f"%{vendor_name}%"))
    if vendor_id is not None:
        stmt = stmt.where(models.Filament.vendor_id == vendor_id)
    if location is not None:
        stmt = stmt.where(models.Spool.location.ilike(f"%{location}%"))
    if lot_nr is not None:
        stmt = stmt.where(models.Spool.lot_nr.ilike(f"%{lot_nr}%"))

    rows = await db.execute(stmt)
    return list(rows.scalars().all())


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


# TODO: Make unit tests for race conditions on these
async def use_weight(db: AsyncSession, spool_id: int, weight: float) -> models.Spool:
    """Reduce the weight of a spool.

    Does nothing if the spool is empty.

    Args:
        db (AsyncSession): Database session
        spool_id (int): Spool ID
        weight (float): Weight loss in grams

    Returns:
        models.Spool: Updated spool object
    """
    spool = await get_by_id(db, spool_id, with_for_update=True)
    spool.weight -= min(spool.weight, weight)
    await db.flush()
    return spool


async def use_length(db: AsyncSession, spool_id: int, length: float) -> models.Spool:
    """Reduce the weight of a spool by using a length of filament.

    Does nothing if the spool is empty.

    Args:
        db (AsyncSession): Database session
        spool_id (int): Spool ID
        length (float): Length of filament to reduce by

    Returns:
        models.Spool: Updated spool object
    """
    spool = await get_by_id(db, spool_id, with_for_update=True)

    filament = spool.filament

    weight = weight_from_length(
        length=length,
        radius=filament.diameter / 2,
        density=filament.density,
    )
    spool.weight -= min(spool.weight, weight)
    await db.flush()
    return spool

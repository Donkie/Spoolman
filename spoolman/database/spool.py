"""Helper functions for interacting with spool database objects."""

from datetime import datetime
from typing import Optional

import sqlalchemy
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import contains_eager, joinedload

from spoolman.database import filament, models
from spoolman.exceptions import ItemCreateError, ItemNotFoundError
from spoolman.math import weight_from_length


async def create(
    *,
    db: AsyncSession,
    filament_id: int,
    remaining_weight: Optional[float] = None,
    used_weight: Optional[float] = None,
    first_used: Optional[datetime] = None,
    last_used: Optional[datetime] = None,
    location: Optional[str] = None,
    lot_nr: Optional[str] = None,
    comment: Optional[str] = None,
) -> models.Spool:
    """Add a new spool to the database. Leave weight empty to assume full spool."""
    filament_item = await filament.get_by_id(db, filament_id)
    if used_weight is None:
        if remaining_weight is not None:
            if filament_item.weight is None:
                raise ItemCreateError("remaining_weight can only be used if the filament type has a weight set.")
            used_weight = max(filament_item.weight - remaining_weight, 0)
        else:
            used_weight = 0

    db_item = models.Spool(
        filament=filament_item,
        used_weight=used_weight,
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
    spool = await db.get(
        models.Spool,
        spool_id,
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
        sqlalchemy.select(models.Spool)
        .join(models.Spool.filament, isouter=True)
        .join(models.Filament.vendor, isouter=True)
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
        elif k == "remaining_weight":
            if spool.filament.weight is None:
                raise ItemCreateError("remaining_weight can only be used if the filament type has a weight set.")
            spool.used_weight = max(spool.filament.weight - v, 0)
        else:
            setattr(spool, k, v)
    await db.flush()
    return spool


async def delete(db: AsyncSession, spool_id: int) -> None:
    """Delete a spool object."""
    spool = await get_by_id(db, spool_id)
    await db.delete(spool)


async def use_weight_safe(db: AsyncSession, spool_id: int, weight: float) -> None:
    """Consume filament from a spool by weight in a way that is safe against race conditions.

    Args:
        db (AsyncSession): Database session
        spool_id (int): Spool ID
        weight (float): Filament weight to consume, in grams
    """
    await db.execute(
        sqlalchemy.update(models.Spool)
        .where(models.Spool.id == spool_id)
        .values(used_weight=models.Spool.used_weight + weight),
    )


# TODO: Make unit tests for race conditions on these
async def use_weight(db: AsyncSession, spool_id: int, weight: float) -> models.Spool:
    """Consume filament from a spool by weight.

    Increases the used_weight attribute of the spool.
    Updates the first_used and last_used attributes where appropriate.

    Args:
        db (AsyncSession): Database session
        spool_id (int): Spool ID
        weight (float): Filament weight to consume, in grams

    Returns:
        models.Spool: Updated spool object
    """
    await use_weight_safe(db, spool_id, weight)

    spool = await get_by_id(db, spool_id)

    if spool.first_used is None:
        spool.first_used = datetime.utcnow()
    spool.last_used = datetime.utcnow()

    await db.flush()
    return spool


async def use_length(db: AsyncSession, spool_id: int, length: float) -> models.Spool:
    """Consume filament from a spool by length.

    Increases the used_weight attribute of the spool.
    Updates the first_used and last_used attributes where appropriate.

    Args:
        db (AsyncSession): Database session
        spool_id (int): Spool ID
        length (float): Length of filament to consume, in mm

    Returns:
        models.Spool: Updated spool object
    """
    # Get filament diameter and density
    result = await db.execute(
        sqlalchemy.select(models.Filament.diameter, models.Filament.density)
        .join(models.Spool, models.Spool.filament_id == models.Filament.id)
        .where(models.Spool.id == spool_id),
    )
    filament_info = result.one()

    # Calculate and use weight
    weight = weight_from_length(
        length=length,
        radius=filament_info[0] / 2,
        density=filament_info[1],
    )
    await use_weight_safe(db, spool_id, weight)

    # Get spool with new weight and update first_used and last_used
    spool = await get_by_id(db, spool_id)

    if spool.first_used is None:
        spool.first_used = datetime.utcnow()
    spool.last_used = datetime.utcnow()

    await db.flush()
    return spool

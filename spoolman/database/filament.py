"""Helper functions for interacting with filament database objects."""

from typing import Optional

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import contains_eager, joinedload

from spoolman.database import models, vendor
from spoolman.exceptions import ItemDeleteError, ItemNotFoundError


async def create(
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
    settings_extruder_temp: Optional[int] = None,
    settings_bed_temp: Optional[int] = None,
    color_hex: Optional[str] = None,
) -> models.Filament:
    """Add a new filament to the database."""
    vendor_item: Optional[models.Vendor] = None  # noqa: FA100
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
        settings_extruder_temp=settings_extruder_temp,
        settings_bed_temp=settings_bed_temp,
        color_hex=color_hex,
    )
    db.add(db_item)
    await db.flush()
    return db_item


async def get_by_id(db: AsyncSession, filament_id: int) -> models.Filament:
    """Get a filament object from the database by the unique ID."""
    filament = await db.get(
        models.Filament,
        filament_id,
        options=[joinedload("*")],  # Load all nested objects as well
    )
    if filament is None:
        raise ItemNotFoundError(f"No filament with ID {filament_id} found.")
    return filament


async def find(
    *,
    db: AsyncSession,
    vendor_name: Optional[str] = None,
    vendor_id: Optional[int] = None,
    name: Optional[str] = None,
    material: Optional[str] = None,
    article_number: Optional[str] = None,
) -> list[models.Filament]:
    """Find a list of filament objects by search criteria."""
    stmt = (
        select(models.Filament)
        .options(contains_eager(models.Filament.vendor))
        .join(models.Filament.vendor, isouter=True)
    )
    if vendor_name is not None:
        stmt = stmt.where(models.Vendor.name.ilike(f"%{vendor_name}%"))
    if vendor_id is not None:
        stmt = stmt.where(models.Filament.vendor_id == vendor_id)
    if name is not None:
        stmt = stmt.where(models.Filament.name.ilike(f"%{name}%"))
    if material is not None:
        stmt = stmt.where(models.Filament.material.ilike(f"%{material}%"))
    if article_number is not None:
        stmt = stmt.where(models.Filament.article_number.ilike(f"%{article_number}%"))

    rows = await db.execute(stmt)
    return list(rows.scalars().all())


async def update(
    *,
    db: AsyncSession,
    filament_id: int,
    data: dict,
) -> models.Filament:
    """Update the fields of a filament object."""
    filament = await get_by_id(db, filament_id)
    for k, v in data.items():
        if k == "vendor_id":
            if v is None:
                filament.vendor = None
            else:
                filament.vendor = await vendor.get_by_id(db, v)
        else:
            setattr(filament, k, v)
    await db.flush()
    return filament


async def delete(db: AsyncSession, filament_id: int) -> None:
    """Delete a filament object."""
    filament = await get_by_id(db, filament_id)
    await db.delete(filament)
    try:
        await db.flush()  # Flush immediately so any errors are propagated in this request.
    except IntegrityError as exc:
        await db.rollback()
        raise ItemDeleteError("Failed to delete filament.") from exc

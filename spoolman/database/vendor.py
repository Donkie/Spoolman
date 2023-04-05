"""Helper functions for interacting with vendor database objects."""

from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from spoolman.database import models
from spoolman.exceptions import ItemNotFoundError


async def create(
    *,
    db: AsyncSession,
    name: Optional[str] = None,
    comment: Optional[str] = None,
) -> models.Vendor:
    """Add a new vendor to the database."""
    db_item = models.Vendor(
        name=name,
        comment=comment,
    )
    db.add(db_item)
    await db.flush()
    return db_item


async def get_by_id(db: AsyncSession, vendor_id: int) -> models.Vendor:
    """Get a vendor object from the database by the unique ID."""
    vendor = await db.get(models.Vendor, vendor_id)
    if vendor is None:
        raise ItemNotFoundError(f"No vendor with ID {vendor_id} found.")
    return vendor


async def find(
    *,
    db: AsyncSession,
    name: Optional[str] = None,
) -> list[models.Vendor]:
    """Find a list of vendor objects by search criteria."""
    stmt = select(models.Vendor)
    if name is not None:
        stmt = stmt.where(models.Vendor.name.ilike(f"%{name}%"))

    rows = await db.execute(stmt)
    return list(rows.scalars().all())


async def update(
    *,
    db: AsyncSession,
    vendor_id: int,
    data: dict,
) -> models.Vendor:
    """Update the fields of a vendor object."""
    vendor = await get_by_id(db, vendor_id)
    for k, v in data.items():
        setattr(vendor, k, v)
    await db.flush()
    return vendor


async def delete(db: AsyncSession, vendor_id: int) -> None:
    """Delete a vendor object."""
    vendor = await get_by_id(db, vendor_id)
    await db.delete(vendor)

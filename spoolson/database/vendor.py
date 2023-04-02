"""Helper functions for interacting with vendor database objects."""

from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from spoolson.database import models
from spoolson.exceptions import ItemNotFoundError


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

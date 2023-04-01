"""Helper functions for interacting with vendor database objects."""

from sqlalchemy.ext.asyncio import AsyncSession

from spoolson.database import models
from spoolson.exceptions import ItemNotFoundError


async def get_by_id(db: AsyncSession, vendor_id: int) -> models.Vendor:
    """Get a vendor object from the database by the unique ID."""
    vendor = await db.get(models.Vendor, vendor_id)
    if vendor is None:
        raise ItemNotFoundError(f"No vendor with ID {vendor_id} found.")
    return vendor

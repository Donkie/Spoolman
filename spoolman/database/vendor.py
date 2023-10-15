"""Helper functions for interacting with vendor database objects."""

from datetime import datetime
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from spoolman.api.v1.models import EventType, Vendor, VendorEvent
from spoolman.database import models
from spoolman.database.utils import SortOrder, add_where_clause_str
from spoolman.exceptions import ItemNotFoundError
from spoolman.ws import websocket_manager


async def create(
    *,
    db: AsyncSession,
    name: Optional[str] = None,
    comment: Optional[str] = None,
) -> models.Vendor:
    """Add a new vendor to the database."""
    vendor = models.Vendor(
        name=name,
        registered=datetime.utcnow().replace(microsecond=0),
        comment=comment,
    )
    db.add(vendor)
    await db.commit()
    await vendor_changed(vendor, EventType.ADDED)
    return vendor


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
    sort_by: Optional[dict[str, SortOrder]] = None,
    limit: Optional[int] = None,
    offset: int = 0,
) -> tuple[list[models.Vendor], int]:
    """Find a list of vendor objects by search criteria.

    Returns a tuple containing the list of items and the total count of matching items.
    """
    stmt = select(models.Vendor)

    stmt = add_where_clause_str(stmt, models.Vendor.name, name)

    total_count = None

    if limit is not None:
        total_count_stmt = stmt.with_only_columns(func.count(), maintain_column_froms=True)
        total_count = (await db.execute(total_count_stmt)).scalar()

        stmt = stmt.offset(offset).limit(limit)

    if sort_by is not None:
        for fieldstr, order in sort_by.items():
            field = getattr(models.Vendor, fieldstr)
            if order == SortOrder.ASC:
                stmt = stmt.order_by(field.asc())
            elif order == SortOrder.DESC:
                stmt = stmt.order_by(field.desc())

    rows = await db.execute(stmt)
    result = list(rows.scalars().all())
    if total_count is None:
        total_count = len(result)

    return result, total_count


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
    await db.commit()
    await vendor_changed(vendor, EventType.UPDATED)
    return vendor


async def delete(db: AsyncSession, vendor_id: int) -> None:
    """Delete a vendor object."""
    vendor = await get_by_id(db, vendor_id)
    await db.delete(vendor)
    await vendor_changed(vendor, EventType.DELETED)


async def vendor_changed(vendor: models.Vendor, typ: EventType) -> None:
    """Notify websocket clients that a vendor has changed."""
    await websocket_manager.send(
        ("vendor", str(vendor.id)),
        VendorEvent(
            type=typ,
            date=datetime.utcnow(),
            payload=Vendor.from_db(vendor),
        ),
    )

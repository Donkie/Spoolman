"""Helper functions for interacting with vendor database objects."""

import logging
from datetime import datetime

import sqlalchemy
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from spoolman.api.v1.models import EventType, Vendor, VendorEvent
from spoolman.database import models
from spoolman.database.utils import SortOrder
from spoolman.exceptions import ItemNotFoundError
from spoolman.ws import websocket_manager

logger = logging.getLogger(__name__)


async def create(
    *,
    db: AsyncSession,
    name: str | None = None,
    comment: str | None = None,
    empty_spool_weight: float | None = None,
    external_id: str | None = None,
    extra: dict[str, str] | None = None,
) -> models.Vendor:
    """Add a new vendor to the database."""
    vendor = models.Vendor(
        name=name,
        registered=datetime.utcnow().replace(microsecond=0),
        comment=comment,
        empty_spool_weight=empty_spool_weight,
        external_id=external_id,
        extra=[models.VendorField(key=k, value=v) for k, v in (extra or {}).items()],
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
    name: str | None = None,
    external_id: str | None = None,
    extra_field_filters: dict[str, str] | None = None,
    sort_by: dict[str, SortOrder] | None = None,
    limit: int | None = None,
    offset: int = 0,
) -> tuple[list[models.Vendor], int]:
    """Find a list of vendor objects by search criteria.

    Returns a tuple containing the list of items and the total count of matching items.
    """
    # Import here to avoid circular imports
    from spoolman.database.utils import (
        add_where_clause_str,
        add_where_clause_str_opt,
        add_where_clause_extra_field,
        add_order_by_extra_field
    )
    
    stmt = select(models.Vendor)

    stmt = add_where_clause_str(stmt, models.Vendor.name, name)
    stmt = add_where_clause_str_opt(stmt, models.Vendor.external_id, external_id)

    total_count = None

    if limit is not None:
        total_count_stmt = stmt.with_only_columns(func.count(), maintain_column_froms=True)
        total_count = (await db.execute(total_count_stmt)).scalar()

        stmt = stmt.offset(offset).limit(limit)

    # Apply extra field filters if provided
    if extra_field_filters:
        # Get all extra fields for vendors
        from spoolman.extra_fields import EntityType, get_extra_fields
        
        extra_fields = await get_extra_fields(db, EntityType.vendor)
        extra_fields_dict = {field.key: field for field in extra_fields}
        
        for field_key, value in extra_field_filters.items():
            if field_key in extra_fields_dict:
                field = extra_fields_dict[field_key]
                stmt = add_where_clause_extra_field(
                    stmt,
                    models.Vendor,
                    EntityType.vendor,
                    field_key,
                    field.field_type,
                    value,
                    field.multi_choice if field.field_type == "choice" else None
                )

    if sort_by is not None:
        for fieldstr, order in sort_by.items():
            # Check if this is a custom field sort
            if fieldstr.startswith("extra."):
                field_key = fieldstr[6:]  # Remove "extra." prefix
                
                # Get the field definition
                from spoolman.extra_fields import EntityType, get_extra_fields
                
                extra_fields = await get_extra_fields(db, EntityType.vendor)
                extra_field = next((f for f in extra_fields if f.key == field_key), None)
                
                if extra_field:
                    stmt = add_order_by_extra_field(
                        stmt,
                        models.Vendor,
                        EntityType.vendor,
                        field_key,
                        extra_field.field_type,
                        order
                    )
            else:
                field = getattr(models.Vendor, fieldstr)
                if order == SortOrder.ASC:
                    stmt = stmt.order_by(field.asc())
                elif order == SortOrder.DESC:
                    stmt = stmt.order_by(field.desc())

    rows = await db.execute(
        stmt,
        execution_options={"populate_existing": True},
    )
    result = list(rows.unique().scalars().all())
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
        if k == "extra":
            vendor.extra = [models.VendorField(key=k, value=v) for k, v in v.items()]
        else:
            setattr(vendor, k, v)
    await db.commit()
    await vendor_changed(vendor, EventType.UPDATED)
    return vendor


async def delete(db: AsyncSession, vendor_id: int) -> None:
    """Delete a vendor object."""
    vendor = await get_by_id(db, vendor_id)
    await db.delete(vendor)
    await vendor_changed(vendor, EventType.DELETED)


async def clear_extra_field(db: AsyncSession, key: str) -> None:
    """Delete all extra fields with a specific key."""
    await db.execute(
        sqlalchemy.delete(models.VendorField).where(models.VendorField.key == key),
    )


async def vendor_changed(vendor: models.Vendor, typ: EventType) -> None:
    """Notify websocket clients that a vendor has changed."""
    try:
        await websocket_manager.send(
            ("vendor", str(vendor.id)),
            VendorEvent(
                type=typ,
                resource="vendor",
                date=datetime.utcnow(),
                payload=Vendor.from_db(vendor),
            ),
        )
    except Exception:
        # Important to have a catch-all here since we don't want to stop the call if this fails.
        logger.exception("Failed to send websocket message")

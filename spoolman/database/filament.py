"""Helper functions for interacting with filament database objects."""

import logging
from collections.abc import Sequence
from datetime import datetime
from typing import Optional, Union

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import contains_eager, joinedload

from spoolman.api.v1.models import EventType, Filament, FilamentEvent
from spoolman.database import models, vendor
from spoolman.database.utils import (
    SortOrder,
    add_where_clause_int_opt,
    add_where_clause_str,
    add_where_clause_str_opt,
    parse_nested_field,
)
from spoolman.exceptions import ItemDeleteError, ItemNotFoundError
from spoolman.ws import websocket_manager


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
    vendor_item: Optional[models.Vendor] = None
    if vendor_id is not None:
        vendor_item = await vendor.get_by_id(db, vendor_id)

    filament = models.Filament(
        name=name,
        registered=datetime.utcnow().replace(microsecond=0),
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
    db.add(filament)
    await db.commit()
    await filament_changed(filament, EventType.ADDED)
    return filament


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
    vendor_id: Optional[Union[int, Sequence[int]]] = None,
    name: Optional[str] = None,
    material: Optional[str] = None,
    article_number: Optional[str] = None,
    sort_by: Optional[dict[str, SortOrder]] = None,
    limit: Optional[int] = None,
    offset: int = 0,
) -> tuple[list[models.Filament], int]:
    """Find a list of filament objects by search criteria.

    Sort by a field by passing a dict with the field name as key and the sort order as value.
    The field name can contain nested fields, e.g. vendor.name.

    Returns a tuple containing the list of items and the total count of matching items.
    """
    stmt = (
        select(models.Filament)
        .options(contains_eager(models.Filament.vendor))
        .join(models.Filament.vendor, isouter=True)
    )

    stmt = add_where_clause_int_opt(stmt, models.Filament.vendor_id, vendor_id)
    stmt = add_where_clause_str(stmt, models.Vendor.name, vendor_name)
    stmt = add_where_clause_str_opt(stmt, models.Filament.name, name)
    stmt = add_where_clause_str_opt(stmt, models.Filament.material, material)
    stmt = add_where_clause_str_opt(stmt, models.Filament.article_number, article_number)

    total_count = None

    if limit is not None:
        total_count_stmt = stmt.with_only_columns(func.count(), maintain_column_froms=True)
        total_count = (await db.execute(total_count_stmt)).scalar()

        stmt = stmt.offset(offset).limit(limit)

    if sort_by is not None:
        for fieldstr, order in sort_by.items():
            field = parse_nested_field(models.Filament, fieldstr)
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
    await db.commit()
    await filament_changed(filament, EventType.UPDATED)
    return filament


async def delete(db: AsyncSession, filament_id: int) -> None:
    """Delete a filament object."""
    filament = await get_by_id(db, filament_id)
    await db.delete(filament)
    try:
        await db.commit()  # Flush immediately so any errors are propagated in this request.
        await filament_changed(filament, EventType.DELETED)
    except IntegrityError as exc:
        await db.rollback()
        raise ItemDeleteError("Failed to delete filament.") from exc


logger = logging.getLogger(__name__)


async def find_materials(
    *,
    db: AsyncSession,
) -> list[str]:
    """Find a list of filament materials by searching for distinct values in the filament table."""
    stmt = select(models.Filament.material).distinct()
    rows = await db.execute(stmt)
    return [row[0] for row in rows.all() if row[0] is not None]


async def find_article_numbers(
    *,
    db: AsyncSession,
) -> list[str]:
    """Find a list of filament article numbers by searching for distinct values in the filament table."""
    stmt = select(models.Filament.article_number).distinct()
    rows = await db.execute(stmt)
    return [row[0] for row in rows.all() if row[0] is not None]


async def filament_changed(filament: models.Filament, typ: EventType) -> None:
    """Notify websocket clients that a filament has changed."""
    await websocket_manager.send(
        ("filament", str(filament.id)),
        FilamentEvent(
            type=typ,
            resource="filament",
            date=datetime.utcnow(),
            payload=Filament.from_db(filament),
        ),
    )

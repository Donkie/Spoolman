"""Helper functions for interacting with spool database objects."""

from collections.abc import Sequence
from datetime import datetime, timezone
from typing import Optional, Union

import sqlalchemy
from sqlalchemy import case, func
from sqlalchemy.exc import NoResultFound
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import contains_eager, joinedload

from spoolman.api.v1.models import EventType, Spool, SpoolEvent
from spoolman.database import filament, models
from spoolman.database.utils import (
    SortOrder,
    add_where_clause_int,
    add_where_clause_int_opt,
    add_where_clause_str,
    add_where_clause_str_opt,
    parse_nested_field,
)
from spoolman.exceptions import ItemCreateError, ItemNotFoundError
from spoolman.math import weight_from_length
from spoolman.ws import websocket_manager


def utc_timezone_naive(dt: datetime) -> datetime:
    """Convert a datetime object to UTC and remove timezone info."""
    return dt.astimezone(tz=timezone.utc).replace(tzinfo=None)


async def create(
    *,
    db: AsyncSession,
    filament_id: int,
    remaining_weight: Optional[float] = None,
    initial_weight: Optional[float] = None,
    empty_weight: Optional[float] = None,
    used_weight: Optional[float] = None,
    first_used: Optional[datetime] = None,
    last_used: Optional[datetime] = None,
    price: Optional[float] = None,
    location: Optional[str] = None,
    lot_nr: Optional[str] = None,
    comment: Optional[str] = None,
    archived: bool = False,
    extra: Optional[dict[str, str]] = None,
) -> models.Spool:
    """Add a new spool to the database. Leave weight empty to assume full spool."""
    filament_item = await filament.get_by_id(db, filament_id)

    if empty_weight is None:
        empty_weight = filament_item.spool_weight if filament_item.spool_weight is not None else 0

    # Calculate initial_weight if not provided
    if initial_weight is None:
        initial_weight = (filament_item.weight if filament_item.weight is not None else 0) + empty_weight

    if used_weight is None:
        if remaining_weight is not None:
            if initial_weight is None or initial_weight == 0:
                raise ItemCreateError("remaining_weight can only be used if the initial_weight is defined.")
            used_weight = max(initial_weight - empty_weight - remaining_weight, 0)
        else:
            used_weight = 0

    # Convert datetime values to UTC and remove timezone info
    if first_used is not None:
        first_used = utc_timezone_naive(first_used)
    if last_used is not None:
        last_used = utc_timezone_naive(last_used)

    spool = models.Spool(
        filament=filament_item,
        registered=datetime.utcnow().replace(microsecond=0),
        initial_weight=initial_weight,
        empty_weight=empty_weight,
        used_weight=used_weight,
        price=price,
        first_used=first_used,
        last_used=last_used,
        location=location,
        lot_nr=lot_nr,
        comment=comment,
        archived=archived,
        extra=[models.SpoolField(key=k, value=v) for k, v in (extra or {}).items()],
    )
    db.add(spool)
    await db.commit()
    await spool_changed(spool, EventType.ADDED)
    return spool


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
    filament_name: Optional[str] = None,
    filament_id: Optional[Union[int, Sequence[int]]] = None,
    filament_material: Optional[str] = None,
    vendor_name: Optional[str] = None,
    vendor_id: Optional[Union[int, Sequence[int]]] = None,
    location: Optional[str] = None,
    lot_nr: Optional[str] = None,
    allow_archived: bool = False,
    sort_by: Optional[dict[str, SortOrder]] = None,
    limit: Optional[int] = None,
    offset: int = 0,
) -> tuple[list[models.Spool], int]:
    """Find a list of spool objects by search criteria.

    Sort by a field by passing a dict with the field name as key and the sort order as value.
    The field name can contain nested fields, e.g. filament.name.

    Returns a tuple containing the list of items and the total count of matching items.
    """
    stmt = (
        sqlalchemy.select(models.Spool)
        .join(models.Spool.filament, isouter=True)
        .join(models.Filament.vendor, isouter=True)
        .options(contains_eager(models.Spool.filament).contains_eager(models.Filament.vendor))
    )

    stmt = add_where_clause_int(stmt, models.Spool.filament_id, filament_id)
    stmt = add_where_clause_int_opt(stmt, models.Filament.vendor_id, vendor_id)
    stmt = add_where_clause_str(stmt, models.Vendor.name, vendor_name)
    stmt = add_where_clause_str_opt(stmt, models.Filament.name, filament_name)
    stmt = add_where_clause_str_opt(stmt, models.Filament.material, filament_material)
    stmt = add_where_clause_str_opt(stmt, models.Spool.location, location)
    stmt = add_where_clause_str_opt(stmt, models.Spool.lot_nr, lot_nr)

    if not allow_archived:
        # Since the archived field is nullable, and default is false, we need to check for both false or null
        stmt = stmt.where(
            sqlalchemy.or_(
                models.Spool.archived.is_(False),
                models.Spool.archived.is_(None),
            ),
        )

    total_count = None

    if limit is not None:
        total_count_stmt = stmt.with_only_columns(func.count(), maintain_column_froms=True)
        total_count = (await db.execute(total_count_stmt)).scalar()

        stmt = stmt.offset(offset).limit(limit)

    if sort_by is not None:
        for fieldstr, order in sort_by.items():
            sorts = []
            if fieldstr in {"remaining_weight", "remaining_length"}:
                sorts.append(models.Spool.initial_weight - models.Spool.empty_weight - models.Spool.used_weight)
            elif fieldstr == "filament.combined_name":
                sorts.append(models.Vendor.name)
                sorts.append(models.Filament.name)
            else:
                sorts.append(parse_nested_field(models.Spool, fieldstr))

            if order == SortOrder.ASC:
                stmt = stmt.order_by(*(f.asc() for f in sorts))
            elif order == SortOrder.DESC:
                stmt = stmt.order_by(*(f.desc() for f in sorts))

    rows = await db.execute(stmt)
    result = list(rows.unique().scalars().all())
    if total_count is None:
        total_count = len(result)

    return result, total_count


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
            # If there is no initial_weight, calculate it from the filament weight
            if spool.initial_weight is None and spool.empty_weight is None and spool.filament.weight is not None:
                spool_weight = spool.empty_weight if spool.empty_weight is not None else 0
                spool.initial_weight = spool.filament.weight + spool_weight
                spool.empty_weight = spool_weight

        elif k == "remaining_weight":
            if spool.initial_weight is None:
                raise ItemCreateError("remaining_weight can only be used if initial_weight is set.")
            spool.used_weight = max((spool.initial_weight - spool.empty_weight) - v, 0)
        elif isinstance(v, datetime):
            setattr(spool, k, utc_timezone_naive(v))
        elif k == "extra":
            spool.extra = [models.SpoolField(key=k, value=v) for k, v in v.items()]
        else:
            setattr(spool, k, v)
    await db.commit()
    await spool_changed(spool, EventType.UPDATED)
    return spool


async def delete(db: AsyncSession, spool_id: int) -> None:
    """Delete a spool object."""
    spool = await get_by_id(db, spool_id)
    await db.delete(spool)
    await spool_changed(spool, EventType.DELETED)


async def clear_extra_field(db: AsyncSession, key: str) -> None:
    """Delete all extra fields with a specific key."""
    await db.execute(
        sqlalchemy.delete(models.SpoolField).where(models.SpoolField.key == key),
    )


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
        .values(
            used_weight=case(
                (models.Spool.used_weight + weight >= 0.0, models.Spool.used_weight + weight),  # noqa: PLR2004
                else_=0.0,  # Set used_weight to 0 if the result would be negative
            ),
        ),
    )


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
        spool.first_used = datetime.utcnow().replace(microsecond=0)
    spool.last_used = datetime.utcnow().replace(microsecond=0)

    await db.commit()
    await spool_changed(spool, EventType.UPDATED)
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
    try:
        filament_info = result.one()
    except NoResultFound as exc:
        raise ItemNotFoundError("Filament not found for spool.") from exc

    # Calculate and use weight
    weight = weight_from_length(
        length=length,
        diameter=filament_info[0],
        density=filament_info[1],
    )
    await use_weight_safe(db, spool_id, weight)

    # Get spool with new weight and update first_used and last_used
    spool = await get_by_id(db, spool_id)

    if spool.first_used is None:
        spool.first_used = datetime.utcnow().replace(microsecond=0)
    spool.last_used = datetime.utcnow().replace(microsecond=0)

    await db.commit()
    await spool_changed(spool, EventType.UPDATED)
    return spool


async def find_locations(
    *,
    db: AsyncSession,
) -> list[str]:
    """Find a list of spool locations by searching for distinct values in the spool table."""
    stmt = sqlalchemy.select(models.Spool.location).distinct()
    rows = await db.execute(stmt)
    return [row[0] for row in rows.all() if row[0] is not None]


async def find_lot_numbers(
    *,
    db: AsyncSession,
) -> list[str]:
    """Find a list of spool lot numbers by searching for distinct values in the spool table."""
    stmt = sqlalchemy.select(models.Spool.lot_nr).distinct()
    rows = await db.execute(stmt)
    return [row[0] for row in rows.all() if row[0] is not None]


async def spool_changed(spool: models.Spool, typ: EventType) -> None:
    """Notify websocket clients that a spool has changed."""
    await websocket_manager.send(
        ("spool", str(spool.id)),
        SpoolEvent(
            type=typ,
            resource="spool",
            date=datetime.utcnow(),
            payload=Spool.from_db(spool),
        ),
    )

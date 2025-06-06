"""Helper functions for interacting with spool database objects."""

import logging
from collections.abc import Sequence
from datetime import datetime, timezone
from typing import Optional, Union

import sqlalchemy
from sqlalchemy import case, func
from sqlalchemy.exc import NoResultFound
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import contains_eager, joinedload
from sqlalchemy.sql.functions import coalesce

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
from spoolman.exceptions import ItemCreateError, ItemNotFoundError, SpoolMeasureError
from spoolman.math import weight_from_length
from spoolman.ws import websocket_manager

logger = logging.getLogger(__name__)


def utc_timezone_naive(dt: datetime) -> datetime:
    """Convert a datetime object to UTC and remove timezone info."""
    return dt.astimezone(tz=timezone.utc).replace(tzinfo=None)


async def create(
    *,
    db: AsyncSession,
    filament_id: int,
    remaining_weight: Optional[float] = None,
    initial_weight: Optional[float] = None,
    spool_weight: Optional[float] = None,
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

    # Set spool_weight to spool_weight if spool_weight is not null and spool_weight not provided
    if spool_weight is None and filament_item.spool_weight is not None:
        spool_weight = filament_item.spool_weight

    # Calculate initial_weight if not provided
    if initial_weight is None and filament_item.weight is not None:
        initial_weight = filament_item.weight

    if used_weight is None:
        if remaining_weight is not None:
            if initial_weight is None or initial_weight == 0:
                raise ItemCreateError(
                    "remaining_weight can only be used if the initial_weight is "
                    "defined or the filament has a weight set.",
                )
            used_weight = max(initial_weight - remaining_weight, 0)
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
        spool_weight=spool_weight,
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


async def find(  # noqa: C901, PLR0912
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
            if fieldstr == "remaining_weight":
                sorts.append(coalesce(models.Spool.initial_weight, models.Filament.weight) - models.Spool.used_weight)
            elif fieldstr == "remaining_length":
                # Simplified weight -> length formula. Absolute value is not correct but the proportionality is still
                # kept, which means the sort order is correct.
                sorts.append(
                    (coalesce(models.Spool.initial_weight, models.Filament.weight) - models.Spool.used_weight)
                    / models.Filament.density
                    / (models.Filament.diameter * models.Filament.diameter),
                )
            elif fieldstr == "used_length":
                sorts.append(
                    models.Spool.used_weight
                    / models.Filament.density
                    / (models.Filament.diameter * models.Filament.diameter),
                )
            elif fieldstr == "filament.combined_name":
                sorts.append(models.Vendor.name)
                sorts.append(models.Filament.name)
            elif fieldstr == "price":
                sorts.append(coalesce(models.Spool.price, models.Filament.price))
            else:
                sorts.append(parse_nested_field(models.Spool, fieldstr))

            if order == SortOrder.ASC:
                stmt = stmt.order_by(*(f.asc() for f in sorts))
            elif order == SortOrder.DESC:
                stmt = stmt.order_by(*(f.desc() for f in sorts))

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
    spool_id: int,
    data: dict,
) -> models.Spool:
    """Update the fields of a spool object."""
    spool = await get_by_id(db, spool_id)
    for k, v in data.items():
        if k == "filament_id":
            spool.filament = await filament.get_by_id(db, v)
            # If there is no initial_weight, calculate it from the filament weight
            if spool.initial_weight is None and spool.filament.weight is not None:
                spool.initial_weight = spool.filament.weight

        elif k == "remaining_weight":
            if spool.initial_weight is None:
                raise ItemCreateError("remaining_weight can only be used if initial_weight is set.")
            spool.used_weight = max(spool.initial_weight - v, 0)
        elif isinstance(v, datetime):
            setattr(spool, k, utc_timezone_naive(v))
        elif k == "extra":
            spool.extra = [f for f in spool.extra if f.key not in v]
            spool.extra.extend([models.SpoolField(key=k, value=v) for k, v in v.items()])
        else:
            setattr(spool, k, v)
    await db.commit()
    await spool_changed(spool, EventType.UPDATED)
    return spool


async def delete(db: AsyncSession, spool_id: int) -> None:
    """Delete a spool object."""
    spool = await get_by_id(db, spool_id)
    await spool_changed(spool, EventType.DELETED)
    await db.delete(spool)


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
                (models.Spool.used_weight + weight >= 0.0, models.Spool.used_weight + weight),
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


async def measure(db: AsyncSession, spool_id: int, weight: float) -> models.Spool:
    """Record usage based on current gross weight of spool.

    Increases the used_weight attribute of the spool.
    Updates the first_used and last_used attributes where appropriate.

    Args:
        db (AsyncSession): Database session
        spool_id (int): Spool ID
        weight (float): Length of filament to consume, in mm

    Returns:
        models.Spool: Updated spool object

    """
    spool_result = await db.execute(
        sqlalchemy.select(models.Spool.initial_weight, models.Spool.used_weight, models.Spool.spool_weight).where(
            models.Spool.id == spool_id,
        ),
    )

    try:
        spool_info = spool_result.one()
    except NoResultFound as exc:
        raise SpoolMeasureError("Spool not found.") from exc

    initial_weight = spool_info[0]
    spool_weight = spool_info[2]
    if initial_weight is None or initial_weight == 0 or spool_weight is None or spool_weight == 0:
        # Get filament weight and spool_weight
        result = await db.execute(
            sqlalchemy.select(models.Filament.weight, models.Filament.spool_weight)
            .join(models.Spool, models.Spool.filament_id == models.Filament.id)
            .where(models.Spool.id == spool_id),
        )
        try:
            filament_info = result.one()
        except NoResultFound as exc:
            raise ItemNotFoundError("Filament not found for spool.") from exc

        if spool_weight is None or spool_weight == 0:
            spool_weight = filament_info[1]

        if initial_weight is None or initial_weight == 0:
            initial_weight = filament_info[0] if filament_info[0] is not None else 0

    if initial_weight is None or initial_weight == 0:
        raise SpoolMeasureError("Initial weight is not set.")

    initial_gross_weight = initial_weight + spool_weight

    # if the measurement is greater than the initial weight, set the initial weight to the measurement
    if weight > initial_gross_weight:
        return await reset_initial_weight(db, spool_id, weight - spool_weight)

    # Calculate the current net weight
    current_use = initial_gross_weight - spool_info[1]

    # Calculate the weight used since last measure
    weight_to_use = current_use - weight

    # If the measured weight is less than the empty weight, use the rest of the spool
    if (initial_gross_weight - weight_to_use) < spool_weight:
        weight_to_use = current_use - spool_weight

    return await use_weight(db, spool_id, weight_to_use)


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
    try:
        await websocket_manager.send(
            ("spool", str(spool.id)),
            SpoolEvent(
                type=typ,
                resource="spool",
                date=datetime.utcnow(),
                payload=Spool.from_db(spool),
            ),
        )
    except Exception:
        # Important to have a catch-all here since we don't want to stop the call if this fails.
        logger.exception("Failed to send websocket message")


async def reset_initial_weight(db: AsyncSession, spool_id: int, weight: float) -> models.Spool:
    """Reset inital weight to new weight and used_weight to 0."""
    spool = await get_by_id(db, spool_id)

    spool.initial_weight = weight
    spool.used_weight = 0
    await db.commit()
    await spool_changed(spool, EventType.UPDATED)
    return spool


async def rename_location(
    *,
    db: AsyncSession,
    current_name: str,
    new_name: str,
) -> None:
    """Rename all spools with the current location name to the new name."""
    await db.execute(
        sqlalchemy.update(models.Spool).where(models.Spool.location == current_name).values(location=new_name),
    )

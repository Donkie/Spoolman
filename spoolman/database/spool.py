"""Helper functions for interacting with spool database objects."""

import logging
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime, timezone

import sqlalchemy
from sqlalchemy import case, func
from sqlalchemy.exc import NoResultFound
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import contains_eager, joinedload
from sqlalchemy.sql.functions import coalesce

from spoolman.api.v1.models import EventType, Spool, SpoolEvent
from spoolman.database import filament, models
from spoolman.database.extra_field_query import apply_extra_field_filters_and_sort
from spoolman.database.utils import (
    SortOrder,
    add_where_clause_int,
    add_where_clause_int_opt,
    add_where_clause_str,
    add_where_clause_str_opt,
    parse_nested_field,
)
from spoolman.exceptions import ItemCreateError, ItemNotFoundError, SpoolMeasureError
from spoolman.extra_field_registry import EntityType
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
    remaining_weight: float | None = None,
    initial_weight: float | None = None,
    spool_weight: float | None = None,
    used_weight: float | None = None,
    first_used: datetime | None = None,
    last_used: datetime | None = None,
    price: float | None = None,
    location: str | None = None,
    lot_nr: str | None = None,
    comment: str | None = None,
    archived: bool = False,
    extra: dict[str, str] | None = None,
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
    filament_name: str | None = None,
    filament_id: int | Sequence[int] | None = None,
    filament_material: str | None = None,
    vendor_name: str | None = None,
    vendor_id: int | Sequence[int] | None = None,
    location: str | None = None,
    lot_nr: str | None = None,
    allow_archived: bool = False,
    extra_field_filters: dict[str, str] | None = None,
    sort_by: dict[str, SortOrder] | None = None,
    limit: int | None = None,
    offset: int = 0,
) -> tuple[list[models.Spool], int]:
    """Find a list of spool objects by search criteria.

    Sort by a field by passing a dict with the field name as key and the sort order as value.
    The field name can contain nested fields, e.g. filament.name.

    Returns a tuple containing the list of items and the total count of matching items.
    """
    stmt = _apply_spool_filters(
        sqlalchemy.select(models.Spool),
        filament_name=filament_name,
        filament_id=filament_id,
        filament_material=filament_material,
        vendor_name=vendor_name,
        vendor_id=vendor_id,
        location=location,
        lot_nr=lot_nr,
        allow_archived=allow_archived,
    ).options(contains_eager(models.Spool.filament).contains_eager(models.Filament.vendor))

    total_count = None

    stmt = await apply_extra_field_filters_and_sort(
        db=db,
        stmt=stmt,
        base_obj=models.Spool,
        entity_type=EntityType.spool,
        extra_field_filters=extra_field_filters,
        sort_by=sort_by,
    )

    if sort_by is not None:
        for fieldstr, order in sort_by.items():
            # Check if this is a custom field sort
            if fieldstr.startswith("extra."):
                continue

            sorts = []
            if fieldstr == "remaining_weight":
                sorts.append(
                    coalesce(models.Spool.initial_weight, models.Filament.weight) - models.Spool.used_weight,
                )
            elif fieldstr == "remaining_length":
                # Simplified weight -> length formula. Absolute value is not correct but the proportionality
                # is still kept, which means the sort order is correct.
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

    if limit is not None:
        total_count_stmt = stmt.with_only_columns(func.count(), maintain_column_froms=True).order_by(None)
        total_count = (await db.execute(total_count_stmt)).scalar()
        stmt = stmt.offset(offset).limit(limit)

    rows = await db.execute(
        stmt,
        execution_options={"populate_existing": True},
    )
    result = list(rows.unique().scalars().all())
    if total_count is None:
        total_count = len(result)

    return result, total_count


GROUP_BY_COLUMNS = {
    "filament": models.Spool.filament_id,
    "vendor": models.Filament.vendor_id,
    "material": models.Filament.material,
    "location": models.Spool.location,
}


def _apply_spool_filters(
    stmt: sqlalchemy.Select,
    *,
    filament_name: str | None = None,
    filament_id: int | Sequence[int] | None = None,
    filament_material: str | None = None,
    vendor_name: str | None = None,
    vendor_id: int | Sequence[int] | None = None,
    location: str | None = None,
    lot_nr: str | None = None,
    allow_archived: bool = False,
) -> sqlalchemy.Select:
    """Apply the standard spool joins and where-clauses shared by find and find_groups."""
    stmt = stmt.join(models.Spool.filament, isouter=True).join(models.Filament.vendor, isouter=True)
    stmt = add_where_clause_int(stmt, models.Spool.filament_id, filament_id)
    stmt = add_where_clause_int_opt(stmt, models.Filament.vendor_id, vendor_id)
    stmt = add_where_clause_str(stmt, models.Vendor.name, vendor_name)
    stmt = add_where_clause_str_opt(stmt, models.Filament.name, filament_name)
    stmt = add_where_clause_str_opt(stmt, models.Filament.material, filament_material)
    stmt = add_where_clause_str_opt(stmt, models.Spool.location, location)
    stmt = add_where_clause_str_opt(stmt, models.Spool.lot_nr, lot_nr)
    if not allow_archived:
        # archived is nullable with a default of false, so match both false and null.
        stmt = stmt.where(
            sqlalchemy.or_(
                models.Spool.archived.is_(False),
                models.Spool.archived.is_(None),
            ),
        )
    return stmt


@dataclass
class SpoolGroupResult:
    """One aggregated spool group, with the grouped entity hydrated for its header."""

    key: object
    spool_count: int
    in_use_count: int
    total_remaining_weight: float
    last_used: datetime | None
    filament: models.Filament | None
    vendor: models.Vendor | None


async def find_groups(
    *,
    db: AsyncSession,
    group_by: str,
    filament_name: str | None = None,
    filament_id: int | Sequence[int] | None = None,
    filament_material: str | None = None,
    vendor_name: str | None = None,
    vendor_id: int | Sequence[int] | None = None,
    location: str | None = None,
    lot_nr: str | None = None,
    allow_archived: bool = False,
    extra_field_filters: dict[str, str] | None = None,
    sort_by: dict[str, SortOrder] | None = None,
    limit: int | None = None,
    offset: int = 0,
) -> tuple[list[SpoolGroupResult], int]:
    """Group matching spools by one axis and return per-group aggregates.

    Aggregation, group ordering and pagination happen in the database. Pagination is over
    groups, so a group is never split across pages and its aggregates are always complete.

    Returns a tuple of the requested page of groups and the total number of matching groups.
    """
    if group_by not in GROUP_BY_COLUMNS:
        raise ValueError(f"Invalid group_by field '{group_by}'. Must be one of {sorted(GROUP_BY_COLUMNS)}.")
    group_col = GROUP_BY_COLUMNS[group_by]
    title_col = {
        "filament": models.Filament.name,
        "vendor": models.Vendor.name,
        "material": models.Filament.material,
        "location": models.Spool.location,
    }[group_by]

    # Remaining weight is computed (see Spool.from_db); mirror that formula so the sum is correct.
    remaining_expr = coalesce(
        coalesce(models.Spool.initial_weight, models.Filament.weight) - models.Spool.used_weight,
        0,
    )
    spool_count = func.count().label("spool_count")
    in_use_count = func.sum(case((models.Spool.used_weight > 0, 1), else_=0)).label("in_use_count")
    total_remaining = func.sum(remaining_expr).label("total_remaining_weight")
    last_used = func.max(models.Spool.last_used).label("last_used")

    stmt = sqlalchemy.select(
        group_col.label("group_key"),
        spool_count,
        in_use_count,
        total_remaining,
        last_used,
    )
    stmt = _apply_spool_filters(
        stmt,
        filament_name=filament_name,
        filament_id=filament_id,
        filament_material=filament_material,
        vendor_name=vendor_name,
        vendor_id=vendor_id,
        location=location,
        lot_nr=lot_nr,
        allow_archived=allow_archived,
    )
    stmt = await apply_extra_field_filters_and_sort(
        db=db,
        stmt=stmt,
        base_obj=models.Spool,
        entity_type=EntityType.spool,
        extra_field_filters=extra_field_filters,
        sort_by=None,
    )
    stmt = stmt.group_by(group_col)

    # Total number of matching groups (before pagination).
    count_stmt = sqlalchemy.select(func.count()).select_from(stmt.order_by(None).subquery())
    total_count = (await db.execute(count_stmt)).scalar_one()

    # Group ordering. Every option is an aggregate (or the grouped column), so no non-grouped
    # bare column is referenced — portable across SQLite, PostgreSQL, MySQL and CockroachDB.
    order_exprs = {
        "group.spool_count": spool_count,
        "group.in_use_count": in_use_count,
        "group.total_remaining": total_remaining,
        "group.last_used": last_used,
        "group.title": func.min(title_col),
    }
    applied_sort = False
    if sort_by:
        for fieldstr, order in sort_by.items():
            expr = order_exprs.get(fieldstr)
            if expr is None:
                continue
            stmt = stmt.order_by(expr.asc() if order == SortOrder.ASC else expr.desc())
            applied_sort = True
    if not applied_sort:
        stmt = stmt.order_by(func.min(title_col).asc())

    if limit is not None:
        stmt = stmt.offset(offset).limit(limit)

    rows = (await db.execute(stmt)).all()

    # Hydrate the grouped entity for the header (filament/vendor); material/location need nothing.
    keys = [row.group_key for row in rows if row.group_key is not None]
    filament_map: dict[int, models.Filament] = {}
    vendor_map: dict[int, models.Vendor] = {}
    if group_by == "filament" and keys:
        fstmt = (
            sqlalchemy.select(models.Filament)
            .where(models.Filament.id.in_(keys))
            .options(joinedload(models.Filament.vendor))
        )
        filament_map = {f.id: f for f in (await db.execute(fstmt)).unique().scalars().all()}
    elif group_by == "vendor" and keys:
        vstmt = sqlalchemy.select(models.Vendor).where(models.Vendor.id.in_(keys))
        vendor_map = {v.id: v for v in (await db.execute(vstmt)).unique().scalars().all()}

    return [
        SpoolGroupResult(
            key=row.group_key,
            spool_count=int(row.spool_count or 0),
            in_use_count=int(row.in_use_count or 0),
            total_remaining_weight=float(row.total_remaining_weight or 0),
            last_used=row.last_used,
            filament=filament_map.get(row.group_key) if group_by == "filament" else None,
            vendor=vendor_map.get(row.group_key) if group_by == "vendor" else None,
        )
        for row in rows
    ], total_count


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
    await db.delete(spool)
    # Commit before notifying so the deletion is durable and visible to subsequent
    # requests; post-commit notification must be the last, infallible step.
    await db.commit()
    await spool_changed(spool, EventType.DELETED)


async def clear_extra_field(db: AsyncSession, key: str) -> None:
    """Delete all extra fields with a specific key."""
    await db.execute(
        sqlalchemy.delete(models.SpoolField).where(models.SpoolField.key == key),
    )
    await db.commit()


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
    await db.commit()

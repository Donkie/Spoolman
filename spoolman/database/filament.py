"""Helper functions for interacting with filament database objects."""

import logging
from collections.abc import Sequence
from datetime import datetime

import sqlalchemy
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import contains_eager, joinedload

from spoolman.api.v1.models import EventType, Filament, FilamentEvent, MultiColorDirection
from spoolman.database import models, vendor
from spoolman.database.utils import (
    SortOrder,
    add_where_clause_int_in,
    add_where_clause_int_opt,
    add_where_clause_str,
    add_where_clause_str_opt,
    parse_nested_field,
)
from spoolman.exceptions import ItemDeleteError, ItemNotFoundError
from spoolman.math import delta_e, hex_to_rgb, rgb_to_lab
from spoolman.ws import websocket_manager


async def create(
    *,
    db: AsyncSession,
    density: float,
    diameter: float,
    name: str | None = None,
    vendor_id: int | None = None,
    material: str | None = None,
    price: float | None = None,
    weight: float | None = None,
    spool_weight: float | None = None,
    article_number: str | None = None,
    comment: str | None = None,
    settings_extruder_temp: int | None = None,
    settings_bed_temp: int | None = None,
    color_hex: str | None = None,
    multi_color_hexes: str | None = None,
    multi_color_direction: MultiColorDirection | None = None,
    external_id: str | None = None,
    extra: dict[str, str] | None = None,
) -> models.Filament:
    """Add a new filament to the database."""
    vendor_item: models.Vendor | None = None
    if vendor_id is not None:
        vendor_item = await vendor.get_by_id(db, vendor_id)
        # default spool weight from vendor
        if spool_weight is None and vendor_item.empty_spool_weight is not None:
            spool_weight = vendor_item.empty_spool_weight

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
        multi_color_hexes=multi_color_hexes,
        multi_color_direction=multi_color_direction.value if multi_color_direction is not None else None,
        external_id=external_id,
        extra=[models.FilamentField(key=k, value=v) for k, v in (extra or {}).items()],
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
    ids: list[int] | None = None,
    vendor_name: str | None = None,
    vendor_id: int | Sequence[int] | None = None,
    name: str | None = None,
    material: str | None = None,
    article_number: str | None = None,
    external_id: str | None = None,
    sort_by: dict[str, SortOrder] | None = None,
    limit: int | None = None,
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

    stmt = add_where_clause_int_in(stmt, models.Filament.id, ids)
    stmt = add_where_clause_int_opt(stmt, models.Filament.vendor_id, vendor_id)
    stmt = add_where_clause_str(stmt, models.Vendor.name, vendor_name)
    stmt = add_where_clause_str_opt(stmt, models.Filament.name, name)
    stmt = add_where_clause_str_opt(stmt, models.Filament.material, material)
    stmt = add_where_clause_str_opt(stmt, models.Filament.article_number, article_number)
    stmt = add_where_clause_str_opt(stmt, models.Filament.external_id, external_id)

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
        elif k == "extra":
            filament.extra = [models.FilamentField(key=k, value=v) for k, v in v.items()]
        elif k == "multi_color_direction":
            filament.multi_color_direction = v.value if v is not None else None
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


async def clear_extra_field(db: AsyncSession, key: str) -> None:
    """Delete all extra fields with a specific key."""
    await db.execute(
        sqlalchemy.delete(models.FilamentField).where(models.FilamentField.key == key),
    )


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


async def find_by_color(
    *,
    db: AsyncSession,
    color_query_hex: str,
    similarity_threshold: float = 25,
) -> list[models.Filament]:
    """Find a list of filament objects by similarity to a color.

    This performs a server-side search, where all filaments are loaded into memory, making it not so efficient.
    The similarity threshold is a value between 0 and 100, where 0 means the colors must be identical and 100 means
    pretty much all colors are considered similar.
    """
    filaments, _ = await find(db=db)

    color_query_lab = rgb_to_lab(hex_to_rgb(color_query_hex))

    found_filaments: list[models.Filament] = []
    for filament in filaments:
        if filament.color_hex is not None:
            colors = [filament.color_hex]
        elif filament.multi_color_hexes is not None:
            colors = filament.multi_color_hexes.split(",")
        else:
            continue

        for color in colors:
            color_lab = rgb_to_lab(hex_to_rgb(color))
            if delta_e(color_query_lab, color_lab) <= similarity_threshold:
                found_filaments.append(filament)
                break

    return found_filaments


async def filament_changed(filament: models.Filament, typ: EventType) -> None:
    """Notify websocket clients that a filament has changed."""
    try:
        await websocket_manager.send(
            ("filament", str(filament.id)),
            FilamentEvent(
                type=typ,
                resource="filament",
                date=datetime.utcnow(),
                payload=Filament.from_db(filament),
            ),
        )
    except Exception:
        # Important to have a catch-all here since we don't want to stop the call if this fails.
        logger.exception("Failed to send websocket message")

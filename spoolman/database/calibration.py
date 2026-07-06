"""Helper functions for interacting with calibration database objects."""

import logging
from datetime import datetime, timezone

import sqlalchemy
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from spoolman.database import models
from spoolman.exceptions import ItemNotFoundError

logger = logging.getLogger(__name__)


def utc_timezone_naive(dt: datetime) -> datetime:
    """Convert a datetime object to UTC and remove timezone info."""
    return dt.astimezone(tz=timezone.utc).replace(tzinfo=None)


# ---------------------------------------------------------------------------
# CalibrationSession
# ---------------------------------------------------------------------------


async def create_session(
    *,
    db: AsyncSession,
    filament_id: int,
    status: str = "planned",
    printer_name: str | None = None,
    nozzle_diameter: float | None = None,
    notes: str | None = None,
    started_at: datetime | None = None,
) -> models.CalibrationSession:
    """Create a new calibration session attached to a filament."""
    from spoolman.database import filament as filament_db  # noqa: PLC0415  # avoid circular import at module level

    await filament_db.get_by_id(db, filament_id)  # raises ItemNotFoundError if filament missing

    db_item = models.CalibrationSession(
        registered=datetime.utcnow().replace(microsecond=0),
        filament_id=filament_id,
        status=status,
        printer_name=printer_name,
        nozzle_diameter=nozzle_diameter,
        notes=notes,
        started_at=utc_timezone_naive(started_at) if started_at is not None else None,
    )
    db.add(db_item)
    await db.commit()
    return await get_session(db, db_item.id)


async def get_session(db: AsyncSession, session_id: int) -> models.CalibrationSession:
    """Get a calibration session by ID, including its step results."""
    result = await db.execute(
        sqlalchemy.select(models.CalibrationSession)
        .where(models.CalibrationSession.id == session_id)
        .options(joinedload(models.CalibrationSession.steps))
    )
    item = result.unique().scalar_one_or_none()
    if item is None:
        raise ItemNotFoundError(f"No calibration session with ID {session_id} found.")
    return item


async def list_sessions(
    *,
    db: AsyncSession,
    filament_id: int | None = None,
    limit: int | None = None,
    offset: int = 0,
) -> tuple[list[models.CalibrationSession], int]:
    """List calibration sessions, optionally filtered by filament_id."""
    query = sqlalchemy.select(models.CalibrationSession)
    if filament_id is not None:
        query = query.where(models.CalibrationSession.filament_id == filament_id)

    count_query = sqlalchemy.select(sqlalchemy.func.count()).select_from(query.subquery())
    total_count = (await db.execute(count_query)).scalar_one()

    query = query.order_by(models.CalibrationSession.registered.desc())
    if offset:
        query = query.offset(offset)
    if limit is not None:
        query = query.limit(limit)

    # Eagerly load steps for each session
    query = query.options(joinedload(models.CalibrationSession.steps))
    result = await db.execute(query)
    items = list(result.unique().scalars().all())
    return items, total_count


async def update_session(
    db: AsyncSession,
    session_id: int,
    data: dict,
) -> models.CalibrationSession:
    """Update fields on a calibration session."""
    db_item = await get_session(db, session_id)
    for k, v in data.items():
        if isinstance(v, datetime):
            setattr(db_item, k, utc_timezone_naive(v))
        else:
            setattr(db_item, k, v)
    await db.commit()
    return await get_session(db, session_id)


async def delete_session(db: AsyncSession, session_id: int) -> None:
    """Delete a calibration session (cascades to step results)."""
    db_item = await get_session(db, session_id)
    await db.delete(db_item)


# ---------------------------------------------------------------------------
# CalibrationStepResult
# ---------------------------------------------------------------------------


async def create_step_result(
    *,
    db: AsyncSession,
    session_id: int,
    step_type: str,
    inputs: str | None = None,
    outputs: str | None = None,
    selected_values: str | None = None,
    notes: str | None = None,
    confidence: str | None = None,
    recorded_at: datetime | None = None,
) -> models.CalibrationStepResult:
    """Add a step result to an existing calibration session."""
    await get_session(db, session_id)  # raises ItemNotFoundError if session missing

    db_item = models.CalibrationStepResult(
        session_id=session_id,
        step_type=step_type,
        inputs=inputs,
        outputs=outputs,
        selected_values=selected_values,
        notes=notes,
        confidence=confidence,
        recorded_at=(
            utc_timezone_naive(recorded_at) if recorded_at is not None else datetime.utcnow().replace(microsecond=0)
        ),
    )
    db.add(db_item)
    await db.commit()
    return db_item


async def get_step_result(db: AsyncSession, step_id: int) -> models.CalibrationStepResult:
    """Get a calibration step result by ID."""
    item = await db.get(models.CalibrationStepResult, step_id)
    if item is None:
        raise ItemNotFoundError(f"No calibration step result with ID {step_id} found.")
    return item


async def update_step_result(
    db: AsyncSession,
    step_id: int,
    data: dict,
) -> models.CalibrationStepResult:
    """Update fields on a calibration step result."""
    db_item = await get_step_result(db, step_id)
    for k, v in data.items():
        if isinstance(v, datetime):
            setattr(db_item, k, utc_timezone_naive(v))
        else:
            setattr(db_item, k, v)
    await db.commit()
    return db_item


async def delete_step_result(db: AsyncSession, step_id: int) -> None:
    """Delete a calibration step result."""
    db_item = await get_step_result(db, step_id)
    await db.delete(db_item)

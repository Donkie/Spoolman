"""Helper functions for interacting with audit log database objects.

As with the other ``auth_`` modules, nothing here emits a websocket event. The audit log
is the most sensitive table in the schema -- it records who signed in, from where, and
what they changed -- and ``websocket_manager.send`` fans out to every subscriber
including anonymous readers. Do not add a notifier here.
"""

import datetime
import logging

from sqlalchemy import Select, delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from spoolman.database import models

logger = logging.getLogger(__name__)

# Caps on the free-form columns, so a hostile user agent or a long username cannot
# overflow the column and fail the insert -- which, on the login path, would turn an
# audit write into a failed sign-in.
TARGET_MAX = 128
USER_AGENT_MAX = 256
IP_MAX = 64
EVENT_MAX = 64


def _clip(value: str | None, limit: int) -> str | None:
    """Truncate a value to fit its column, treating the empty string as absent."""
    if not value:
        return None
    return value[:limit]


async def record(
    *,
    db: AsyncSession,
    event: str,
    actor_kind: str,
    actor_user_id: int | None = None,
    target: str | None = None,
    ip: str | None = None,
    user_agent: str | None = None,
    detail: str | None = None,
) -> models.AuthAuditLog:
    """Append an entry to the audit log.

    Args:
        db: The database session.
        event: What happened. See :class:`spoolman.auth.audit.AuditEvent`.
        actor_kind: How the actor was authenticated, or "anonymous" if not at all.
        actor_user_id: Which account acted, if the actor was a known user.
        target: What was acted on -- a username, a key name, a session count.
        ip: Where the request came from.
        user_agent: What the request identified itself as.
        detail: A JSON object with anything else worth keeping.

    Returns:
        models.AuthAuditLog: The stored entry.

    """
    entry = models.AuthAuditLog(
        date=datetime.datetime.utcnow().replace(microsecond=0),
        event=event[:EVENT_MAX],
        actor_user_id=actor_user_id,
        actor_kind=actor_kind,
        target=_clip(target, TARGET_MAX),
        ip=_clip(ip, IP_MAX),
        user_agent=_clip(user_agent, USER_AGENT_MAX),
        detail=detail,
    )
    db.add(entry)
    await db.commit()
    return entry


def _filtered(stmt: Select, *, event: str | None, actor_user_id: int | None) -> Select:
    """Apply the optional filters shared by the listing and its count."""
    if event:
        stmt = stmt.where(models.AuthAuditLog.event == event)
    if actor_user_id is not None:
        stmt = stmt.where(models.AuthAuditLog.actor_user_id == actor_user_id)
    return stmt


async def find(
    *,
    db: AsyncSession,
    limit: int | None = None,
    offset: int = 0,
    event: str | None = None,
    actor_user_id: int | None = None,
) -> tuple[list[models.AuthAuditLog], int]:
    """List audit entries, newest first.

    Args:
        db: The database session.
        limit: The maximum number to return.
        offset: How many to skip.
        event: Only return entries for this event.
        actor_user_id: Only return entries by this user.

    Returns:
        tuple: The entries, and the total number matching the filters.

    """
    stmt = _filtered(select(models.AuthAuditLog), event=event, actor_user_id=actor_user_id)
    # Ordered by id as well as date: the timestamp is stored to the second, so several
    # entries from one request would otherwise come back in an arbitrary order and
    # paginate inconsistently.
    stmt = stmt.order_by(models.AuthAuditLog.date.desc(), models.AuthAuditLog.id.desc())

    count_stmt = _filtered(
        select(func.count()).select_from(models.AuthAuditLog),
        event=event,
        actor_user_id=actor_user_id,
    )
    total = (await db.execute(count_stmt)).scalar_one()

    if offset:
        stmt = stmt.offset(offset)
    if limit is not None:
        stmt = stmt.limit(limit)
    rows = list((await db.execute(stmt)).scalars().all())
    return rows, total


async def prune_older_than(db: AsyncSession, cutoff: datetime.datetime) -> int:
    """Delete audit entries older than a point in time.

    Args:
        db: The database session.
        cutoff: Entries dated before this are removed.

    Returns:
        int: How many entries were removed.

    """
    result = await db.execute(delete(models.AuthAuditLog).where(models.AuthAuditLog.date < cutoff))
    await db.commit()
    return result.rowcount or 0


async def clear_actor(db: AsyncSession, user_id: int) -> int:
    """Detach a user's audit entries from their account.

    Called when the account is deleted. The entries themselves are kept -- an audit log
    that loses its record of what an account did the moment that account is removed is
    not an audit log -- but the foreign key has to stop pointing at a row that no longer
    exists. The username is already recorded in ``target`` on the entries where it
    matters, so the trail stays readable.

    Args:
        db: The database session.
        user_id: Whose entries to detach.

    Returns:
        int: How many entries were detached.

    """
    rows = (
        (await db.execute(select(models.AuthAuditLog).where(models.AuthAuditLog.actor_user_id == user_id)))
        .scalars()
        .all()
    )
    for row in rows:
        row.actor_user_id = None
    await db.commit()
    return len(rows)

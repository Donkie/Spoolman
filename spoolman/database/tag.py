"""Helper functions for interacting with tag database objects.

Kept out of `spool.py`, which is already the largest module in the tree, but following
its conventions exactly: `AsyncSession` first, exceptions from `spoolman.exceptions`,
and the websocket event emitted after the commit.

This module is the ONE place a UID gets normalized, on the way in and on every lookup.
Doing it in a Pydantic validator would read better but would only cover callers that
arrive over HTTP -- and the unique constraint is worthless if any other path (an
importer, a migration backfill, a future tag codec) can write a differently-shaped UID.

It is also the one place that decides what a tag points at. `models.Tag` can address
things that are not spools -- and things that are not rows at all, such as a location --
but only spool tags are written today, so `link` sets `target_type` and every read here
is explicit about wanting a spool rather than assuming the tag it found is one. The
database has no CHECK enforcing "exactly one target": no migration in this tree uses one
and MySQL below 8.0.16 silently ignores them, so a single enforced write path is worth
more than a constraint that is real on three databases out of four.
"""

import logging
from datetime import datetime

import sqlalchemy
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from spoolman.api.v1.models import EventType
from spoolman.database import models, spool
from spoolman.exceptions import ItemNotFoundError, TagConflictError
from spoolman.tags import TARGET_SPOOL, normalize_format, normalize_uid

logger = logging.getLogger(__name__)


async def _get_tag_by_uid(db: AsyncSession, uid: str) -> models.Tag | None:
    """Get the tag with this exact normalized UID, if any. Hits the unique index."""
    stmt = sqlalchemy.select(models.Tag).where(models.Tag.uid == uid)
    return (await db.execute(stmt)).scalar_one_or_none()


def _conflict(uid: str, existing: models.Tag) -> TagConflictError:
    """Describe a UID that is already spoken for.

    Only spool tags are written today, so the second branch is unreachable in practice --
    but the table is deliberately able to hold other kinds (see `models.Tag`), and a
    conflict that reported a spool id of `None` would be worse than one that says plainly
    what holds the tag. The id is included only when there genuinely is one, which is what
    lets a client offer "move it here" and fall back to reporting the message otherwise.
    """
    if existing.spool_id is not None:
        return TagConflictError(f"Tag {uid} is already linked to spool {existing.spool_id}.", existing.spool_id)
    target = existing.target_value if existing.target_value is not None else existing.filament_id
    return TagConflictError(f"Tag {uid} is already linked to {existing.target_type} {target}.")


async def link(
    *,
    db: AsyncSession,
    spool_id: int,
    uid: str,
    tag_format: str | None = None,
) -> models.Tag:
    """Link a physical tag to a spool.

    Re-linking a UID to the spool that already holds it is idempotent; if the request
    carries a format and the stored row has a different one, the stored one is refined,
    since a later scan generally knows more about the tag than the first one did.

    Args:
        db: Database session.
        spool_id: The spool to link the tag to.
        uid: The tag UID in any shape; normalized here.
        tag_format: Optional tag format name, e.g. "ntag".

    Returns:
        models.Tag: The linked tag.

    Raises:
        ItemNotFoundError: If no spool with that ID exists.
        TagConflictError: If the UID is already linked to a different spool.
        ValueError: If the UID or format is not valid.

    """
    uid = normalize_uid(uid)
    tag_format = normalize_format(tag_format)

    db_spool = await spool.get_by_id(db, spool_id)

    existing = await _get_tag_by_uid(db, uid)
    if existing is not None:
        if existing.spool_id != spool_id:
            raise _conflict(uid, existing)
        if tag_format is not None and existing.format != tag_format:
            existing.format = tag_format
            await db.commit()
            await spool.spool_changed(db_spool, EventType.UPDATED)
        return existing

    tag = models.Tag(
        uid=uid,
        target_type=TARGET_SPOOL,
        format=tag_format,
        added=datetime.utcnow().replace(microsecond=0),
    )
    db_spool.tags.append(tag)
    try:
        await db.commit()
    except IntegrityError:
        # Two clients linked the same UID at the same time and the unique index caught
        # the loser. The database, not the read above, is what makes "one tag, one spool"
        # true; report the winner the same way a sequential conflict is reported.
        await db.rollback()
        winner = await _get_tag_by_uid(db, uid)
        if winner is None:
            raise
        raise _conflict(uid, winner) from None

    await spool.spool_changed(db_spool, EventType.UPDATED)
    return tag


async def unlink(*, db: AsyncSession, spool_id: int, uid: str) -> None:
    """Unlink a tag from a spool.

    Args:
        db: Database session.
        spool_id: The spool the tag is linked to.
        uid: The tag UID in any shape; normalized here.

    Raises:
        ItemNotFoundError: If the spool does not exist, or does not hold that tag.
        ValueError: If the UID is not valid.

    """
    uid = normalize_uid(uid)

    db_spool = await spool.get_by_id(db, spool_id)
    for tag in db_spool.tags:
        if tag.uid == uid:
            # delete-orphan on the relationship turns this into the DELETE.
            db_spool.tags.remove(tag)
            break
    else:
        raise ItemNotFoundError(f"Spool {spool_id} has no tag with UID {uid}.")

    # Commit before notifying so the change is durable and visible to subsequent
    # requests; post-commit notification must be the last, infallible step.
    await db.commit()
    await spool.spool_changed(db_spool, EventType.UPDATED)


async def find_spool_by_uid(db: AsyncSession, uid: str) -> models.Spool | None:
    """Find the spool a tag UID is linked to, or None if the tag is unknown.

    Args:
        db: Database session.
        uid: The tag UID in any shape; normalized here.

    Returns:
        models.Spool | None: The spool holding that tag.

    Raises:
        ValueError: If the UID is not valid.

    """
    tag = await _get_tag_by_uid(db, normalize_uid(uid))
    # A known tag that points at something other than a spool is not a spool match, and
    # answering with one would be a lie. `spool_id` carries that on its own: it is null
    # for every other kind of target.
    if tag is None or tag.spool_id is None:
        return None
    return await spool.get_by_id(db, tag.spool_id)

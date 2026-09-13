"""Helper functions for interacting with tag database objects.

Kept out of `spool.py`, which is already the largest module in the tree, but following
its conventions exactly: `AsyncSession` first, exceptions from `spoolman.exceptions`,
and the websocket event emitted after the commit.

This module is the ONE place a UID gets normalized, on the way in and on every lookup.
Doing it in a Pydantic validator would read better but would only cover callers that
arrive over HTTP -- and the unique constraint is worthless if any other path (an
importer, a migration backfill, a future tag codec) can write a differently-shaped UID.

It is also the one place that decides what a tag points at. A tag identifies a spool or a
filament today, and `models.Tag` can address more than that -- including things that are
not rows at all, such as a location -- so `target_type` is set from the thing being linked
and every read here says which kind it found rather than assuming. The database has no
CHECK enforcing "exactly one target": no migration in this tree uses one and MySQL below
8.0.16 silently ignores them, so a single enforced write path is worth more than a
constraint that is real on three databases out of four.
"""

import logging
from datetime import datetime

import sqlalchemy
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from spoolman.api.v1.models import EventType
from spoolman.database import filament, models, spool
from spoolman.exceptions import ItemNotFoundError, TagConflictError
from spoolman.tags import TARGET_FILAMENT, TARGET_SPOOL, normalize_format, normalize_uid

logger = logging.getLogger(__name__)

# The row kinds a tag can be linked to. Both carry a `tags` collection and an `id`, which is
# all the shared link and unlink paths below need from them.
Target = models.Spool | models.Filament


async def _get_tag_by_uid(db: AsyncSession, uid: str) -> models.Tag | None:
    """Get the tag with this exact normalized UID, if any. Hits the unique index."""
    stmt = sqlalchemy.select(models.Tag).where(models.Tag.uid == uid)
    return (await db.execute(stmt)).scalar_one_or_none()


def _target_type(target: Target) -> str:
    return TARGET_SPOOL if isinstance(target, models.Spool) else TARGET_FILAMENT


def _holds(tag: models.Tag, target: Target) -> bool:
    """Whether `tag` is linked to exactly this target.

    Compared on the foreign key for the target's own kind, so spool 7 and filament 7 are never
    mistaken for each other: the other kind's column is null on the tag.
    """
    held = tag.spool_id if isinstance(target, models.Spool) else tag.filament_id
    return held == target.id


async def _changed(target: Target) -> None:
    """Emit the target's ordinary `updated` event; its tags are part of its payload."""
    if isinstance(target, models.Spool):
        await spool.spool_changed(target, EventType.UPDATED)
    else:
        await filament.filament_changed(target, EventType.UPDATED)


def _conflict(uid: str, existing: models.Tag) -> TagConflictError:
    """Describe a UID that is already spoken for.

    The holder's id is included when there is one, which is what lets a client offer "move it
    here". A kind addressed by value (a location) has no id, and the message says what holds
    the tag instead.
    """
    if existing.spool_id is not None:
        return TagConflictError(
            f"Tag {uid} is already linked to spool {existing.spool_id}.",
            spool_id=existing.spool_id,
        )
    if existing.filament_id is not None:
        return TagConflictError(
            f"Tag {uid} is already linked to filament {existing.filament_id}.",
            filament_id=existing.filament_id,
        )
    return TagConflictError(f"Tag {uid} is already linked to {existing.target_type} {existing.target_value}.")


async def _link(db: AsyncSession, target: Target, uid: str, tag_format: str | None) -> models.Tag:
    """Link an already-normalized UID to a loaded spool or filament. See `link_spool`."""
    existing = await _get_tag_by_uid(db, uid)
    if existing is not None:
        if not _holds(existing, target):
            raise _conflict(uid, existing)
        if tag_format is not None and existing.format != tag_format:
            existing.format = tag_format
            await db.commit()
            await _changed(target)
        return existing

    tag = models.Tag(
        uid=uid,
        target_type=_target_type(target),
        format=tag_format,
        added=datetime.utcnow().replace(microsecond=0),
    )
    target.tags.append(tag)
    try:
        await db.commit()
    except IntegrityError:
        # Two clients linked the same UID at the same time and the unique index caught
        # the loser. The database, not the read above, is what makes "one tag, one thing"
        # true; report the winner the same way a sequential conflict is reported.
        await db.rollback()
        winner = await _get_tag_by_uid(db, uid)
        if winner is None:
            raise
        raise _conflict(uid, winner) from None

    await _changed(target)
    return tag


async def _unlink(db: AsyncSession, target: Target, uid: str) -> None:
    """Unlink an already-normalized UID from a loaded spool or filament. See `unlink_spool`."""
    for tag in target.tags:
        if tag.uid == uid:
            # delete-orphan on the relationship turns this into the DELETE.
            target.tags.remove(tag)
            break
    else:
        raise ItemNotFoundError(f"{_target_type(target).capitalize()} {target.id} has no tag with UID {uid}.")

    # Commit before notifying so the change is durable and visible to subsequent
    # requests; post-commit notification must be the last, infallible step.
    await db.commit()
    await _changed(target)


async def link_spool(
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
        TagConflictError: If the UID is already linked to anything else, spool or filament.
        ValueError: If the UID or format is not valid.

    """
    uid = normalize_uid(uid)
    tag_format = normalize_format(tag_format)
    return await _link(db, await spool.get_by_id(db, spool_id), uid, tag_format)


async def link_filament(
    *,
    db: AsyncSession,
    filament_id: int,
    uid: str,
    tag_format: str | None = None,
) -> models.Tag:
    """Link a physical tag to a filament. Same rules as `link_spool`, across both kinds.

    Raises:
        ItemNotFoundError: If no filament with that ID exists.
        TagConflictError: If the UID is already linked to anything else, spool or filament.
        ValueError: If the UID or format is not valid.

    """
    uid = normalize_uid(uid)
    tag_format = normalize_format(tag_format)
    return await _link(db, await filament.get_by_id(db, filament_id), uid, tag_format)


async def unlink_spool(*, db: AsyncSession, spool_id: int, uid: str) -> None:
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
    await _unlink(db, await spool.get_by_id(db, spool_id), uid)


async def unlink_filament(*, db: AsyncSession, filament_id: int, uid: str) -> None:
    """Unlink a tag from a filament. Same rules as `unlink_spool`.

    Raises:
        ItemNotFoundError: If the filament does not exist, or does not hold that tag.
        ValueError: If the UID is not valid.

    """
    uid = normalize_uid(uid)
    await _unlink(db, await filament.get_by_id(db, filament_id), uid)


async def find_by_uid(db: AsyncSession, uid: str) -> Target | None:
    """Find the spool or filament a tag UID is linked to, or None if the tag is unknown.

    Args:
        db: Database session.
        uid: The tag UID in any shape; normalized here.

    Returns:
        models.Spool | models.Filament | None: Whatever holds that tag.

    Raises:
        ValueError: If the UID is not valid.

    """
    tag = await _get_tag_by_uid(db, normalize_uid(uid))
    if tag is None:
        return None
    if tag.spool_id is not None:
        return await spool.get_by_id(db, tag.spool_id)
    if tag.filament_id is not None:
        return await filament.get_by_id(db, tag.filament_id)
    # A kind addressed by value (a location) resolves to no row, and nothing reads those yet.
    return None

"""Helper functions for interacting with API key database objects.

As with :mod:`spoolman.database.auth_user`, nothing here emits a websocket event.
``websocket_manager.send`` fans out to every subscriber, so broadcasting key activity
would tell every connected client when and how often each machine credential is used,
and the creation event would carry the prefix that identifies it. Do not add a notifier
here.
"""

import logging
from datetime import datetime, timedelta

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from spoolman.auth import apikey
from spoolman.auth.hashing import hash_token, tokens_equal
from spoolman.auth.levels import Level
from spoolman.database import models
from spoolman.exceptions import ItemNotFoundError

logger = logging.getLogger(__name__)

# How stale last_used must be before a request bothers to update it.
#
# The same reasoning as auth_session.RENEW_THRESHOLD, and it matters more here: an API
# key is what a printer polls with, several times a minute, forever. Recording every one
# of those would turn a read-only request into a write on a database whose default is a
# single SQLite file behind one write lock. "Last used" to the nearest five minutes is
# all this field is ever read for.
TOUCH_THRESHOLD = timedelta(minutes=5)

# Longest a key may be issued for, in days. Not a security boundary -- an expiry is a
# convenience, and a key can always be revoked -- but an unbounded value would let a
# typo produce a date SQLite stores and other backends reject.
MAX_EXPIRY_DAYS = 3650


async def create(
    *,
    db: AsyncSession,
    user_id: int,
    name: str,
    level: Level,
    expires_days: int | None = None,
) -> tuple[models.AuthApiKey, str]:
    """Issue a new API key.

    Unlike passwords, the secret is generated here rather than passed in. There is
    nothing for a caller to supply -- a key is not chosen, it is minted -- and hashing
    it is a single SHA-256 rather than the tens of milliseconds a password costs, so
    none of the offloading that :mod:`spoolman.auth.hashing` exists for applies. This
    mirrors :func:`spoolman.database.auth_session.create`.

    Args:
        db: The database session.
        user_id: Who the key belongs to.
        name: A human label, so the owner can tell their keys apart.
        level: The level to issue at. The caller is responsible for refusing to issue
            above its own; the cap against the owner's current level is applied at
            every request instead, in :func:`spoolman.auth.apikey.effective_level`.
        expires_days: How long the key should live, or None for no expiry.

    Returns:
        tuple: The stored key and the complete plaintext key, which is the only time
        the secret exists in a readable form.

    """
    prefix, plaintext = apikey.generate()
    now = datetime.utcnow().replace(microsecond=0)
    expires = now + timedelta(days=expires_days) if expires_days else None
    key = models.AuthApiKey(
        user_id=user_id,
        name=name,
        level=str(level),
        prefix=prefix,
        key_hash=hash_token(plaintext),
        created=now,
        expires=expires,
        last_used=None,
        revoked=False,
    )
    db.add(key)
    await db.commit()
    return key, plaintext


async def resolve(db: AsyncSession, presented: str) -> models.AuthApiKey | None:
    """Look up a live key by the string a caller presented.

    Args:
        db: The database session.
        presented: The complete key from the request header.

    Returns:
        Optional[models.AuthApiKey]: The key, or None if it is unknown, revoked or
        expired.

    """
    prefix = apikey.prefix_of(presented)
    if prefix is None:
        return None

    stmt = select(models.AuthApiKey).where(models.AuthApiKey.prefix == prefix)
    key = (await db.execute(stmt)).scalar_one_or_none()
    if key is None:
        return None

    # Constant time even though both sides are hex digests of the same length: the
    # comparison is cheap and a timing oracle on the stored hash is not worth leaving
    # open for the sake of an early exit.
    if not tokens_equal(hash_token(presented), key.key_hash):
        return None
    if key.revoked:
        return None

    now = datetime.utcnow().replace(microsecond=0)
    if key.expires is not None and key.expires <= now:
        # Left in place rather than deleted, unlike an expired session. A key is
        # something a person made and named, and having it disappear from the list
        # instead of showing as expired reads as data loss.
        return None

    if key.last_used is None or now - key.last_used >= TOUCH_THRESHOLD:
        key.last_used = now
        await db.commit()

    return key


async def get_by_id(db: AsyncSession, key_id: int) -> models.AuthApiKey:
    """Get an API key by its unique ID.

    Args:
        db: The database session.
        key_id: The key ID.

    Raises:
        ItemNotFoundError: If no such key exists.

    Returns:
        models.AuthApiKey: The key.

    """
    key = await db.get(models.AuthApiKey, key_id)
    if key is None:
        raise ItemNotFoundError(f"No API key with ID {key_id} found.")
    return key


async def find_for_user(*, db: AsyncSession, user_id: int) -> list[models.AuthApiKey]:
    """List a user's keys, newest first.

    Revoked and expired keys are included. The owner needs to see that a key they
    revoked is in fact revoked, and a key that stopped working needs to be
    distinguishable from one that was never created.

    Args:
        db: The database session.
        user_id: Whose keys to list.

    Returns:
        list[models.AuthApiKey]: The keys.

    """
    stmt = (
        select(models.AuthApiKey)
        .where(models.AuthApiKey.user_id == user_id)
        .order_by(models.AuthApiKey.created.desc(), models.AuthApiKey.id.desc())
    )
    return list((await db.execute(stmt)).scalars().all())


async def count_for_user(db: AsyncSession, user_id: int) -> int:
    """Count the keys a user holds, revoked ones included.

    Args:
        db: The database session.
        user_id: Whose keys to count.

    Returns:
        int: The number of keys.

    """
    stmt = select(func.count()).select_from(models.AuthApiKey).where(models.AuthApiKey.user_id == user_id)
    return (await db.execute(stmt)).scalar_one()


async def revoke(*, db: AsyncSession, key: models.AuthApiKey) -> None:
    """Stop a key from authenticating, keeping the row.

    Args:
        db: The database session.
        key: The key to revoke.

    """
    key.revoked = True
    await db.commit()


async def delete_key(*, db: AsyncSession, key: models.AuthApiKey) -> None:
    """Remove a key entirely.

    Args:
        db: The database session.
        key: The key to delete.

    """
    await db.delete(key)
    await db.commit()


async def delete_all_for_user(db: AsyncSession, user_id: int) -> int:
    """Remove every key belonging to a user.

    Used when the user itself is deleted: the foreign key would otherwise leave rows
    pointing at an account that no longer exists.

    Args:
        db: The database session.
        user_id: Whose keys to remove.

    Returns:
        int: How many keys were removed.

    """
    result = await db.execute(delete(models.AuthApiKey).where(models.AuthApiKey.user_id == user_id))
    await db.commit()
    return result.rowcount or 0

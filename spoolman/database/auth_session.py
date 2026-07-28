"""Helper functions for interacting with login session database objects.

As with :mod:`spoolman.database.auth_user`, nothing here emits a websocket event -- the
subscriber pool is every connected client, and session activity is nobody else's
business.
"""

import logging
from datetime import datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from spoolman.auth.cookies import IDLE_LIFETIME, REMEMBER_LIFETIME
from spoolman.auth.hashing import hash_token, new_token
from spoolman.database import models

logger = logging.getLogger(__name__)

# How stale last_seen must be before a request bothers to slide the session forward.
#
# Without this, every authenticated request becomes a database write. On SQLite -- the
# default, a single file behind one write lock -- that serialises the whole application
# behind session bookkeeping and would undo the list-page latency work that the
# selectin loading in models.py exists for. A minute of imprecision against a twelve
# hour idle window is not worth a write per request.
RENEW_THRESHOLD = timedelta(minutes=1)

# Cap on how much of a user agent string is retained for the session list.
USER_AGENT_MAX = 256


def lifetime_for(*, remember: bool) -> timedelta:
    """Get how long a session should live from now.

    Args:
        remember: Whether the user asked to stay signed in.

    Returns:
        timedelta: The session lifetime.

    """
    return REMEMBER_LIFETIME if remember else IDLE_LIFETIME


async def create(
    *,
    db: AsyncSession,
    user_id: int,
    remember: bool,
    user_agent: str | None = None,
    ip: str | None = None,
) -> tuple[models.AuthSession, str]:
    """Start a new session.

    Args:
        db: The database session.
        user_id: Who the session belongs to.
        remember: Whether the session should outlive the browser session.
        user_agent: The client's user agent, for the session list.
        ip: The client's address, for the session list.

    Returns:
        tuple: The stored session and the plaintext token, which is the only time the
        token exists in a readable form.

    """
    token = new_token()
    now = datetime.utcnow().replace(microsecond=0)
    session = models.AuthSession(
        user_id=user_id,
        token_hash=hash_token(token),
        created=now,
        expires=now + lifetime_for(remember=remember),
        last_seen=now,
        remember=remember,
        user_agent=user_agent[:USER_AGENT_MAX] if user_agent else None,
        ip=ip or None,
    )
    db.add(session)
    await db.commit()
    return session, token


async def resolve(db: AsyncSession, token: str) -> models.AuthSession | None:
    """Look up a live session by its token, sliding its expiry forward.

    An expired session is deleted as it is encountered, which keeps the table tidy
    without needing a scheduled sweep.

    Args:
        db: The database session.
        token: The plaintext token from the cookie.

    Returns:
        Optional[models.AuthSession]: The session, or None if unknown or expired.

    """
    if not token:
        return None
    stmt = select(models.AuthSession).where(models.AuthSession.token_hash == hash_token(token))
    session = (await db.execute(stmt)).scalar_one_or_none()
    if session is None:
        return None

    now = datetime.utcnow().replace(microsecond=0)
    if session.expires <= now:
        await db.delete(session)
        await db.commit()
        return None

    if now - session.last_seen >= RENEW_THRESHOLD:
        session.last_seen = now
        session.expires = now + lifetime_for(remember=session.remember)
        await db.commit()

    return session


async def revoke(db: AsyncSession, session_id: int) -> None:
    """End one session.

    Args:
        db: The database session.
        session_id: Which session to end.

    """
    await db.execute(delete(models.AuthSession).where(models.AuthSession.id == session_id))
    await db.commit()


async def revoke_by_token(db: AsyncSession, token: str) -> None:
    """End the session identified by a token.

    Args:
        db: The database session.
        token: The plaintext token from the cookie.

    """
    if not token:
        return
    await db.execute(delete(models.AuthSession).where(models.AuthSession.token_hash == hash_token(token)))
    await db.commit()


async def revoke_all_for_user(db: AsyncSession, user_id: int) -> int:
    """End every session belonging to a user.

    Args:
        db: The database session.
        user_id: Whose sessions to end.

    Returns:
        int: How many sessions were ended.

    """
    result = await db.execute(delete(models.AuthSession).where(models.AuthSession.user_id == user_id))
    await db.commit()
    return result.rowcount or 0


async def find_for_user(*, db: AsyncSession, user_id: int) -> list[models.AuthSession]:
    """List a user's live sessions, most recently used first.

    Args:
        db: The database session.
        user_id: Whose sessions to list.

    Returns:
        list[models.AuthSession]: The sessions.

    """
    stmt = (
        select(models.AuthSession)
        .where(models.AuthSession.user_id == user_id)
        .order_by(models.AuthSession.last_seen.desc())
    )
    return list((await db.execute(stmt)).scalars().all())


async def prune_expired(db: AsyncSession) -> int:
    """Delete every session that has expired.

    Args:
        db: The database session.

    Returns:
        int: How many sessions were removed.

    """
    now = datetime.utcnow().replace(microsecond=0)
    result = await db.execute(delete(models.AuthSession).where(models.AuthSession.expires <= now))
    await db.commit()
    return result.rowcount or 0

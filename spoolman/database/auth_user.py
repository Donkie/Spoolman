"""Helper functions for interacting with user database objects.

Unlike the vendor, filament and spool modules, nothing here emits a websocket event.
``websocket_manager.send`` fans out to every subscriber, so broadcasting account changes
would hand every connected client the details of every other account. Account state is
read back over the authenticated REST endpoints instead. Do not add a notifier here.
"""

import logging
from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from spoolman.auth.levels import Level
from spoolman.database import models
from spoolman.exceptions import ItemNotFoundError

logger = logging.getLogger(__name__)

# Failed logins allowed before an account starts locking.
LOCKOUT_THRESHOLD = 5

# The first lockout, doubling for each subsequent failure.
LOCKOUT_BASE = timedelta(minutes=1)

# The longest an account is ever locked for. A lockout that grows without bound turns a
# password guess into a denial of service against the real owner.
LOCKOUT_MAX = timedelta(minutes=15)


def normalize_username(username: str) -> str:
    """Reduce a username to its stored form.

    Args:
        username: The username as typed.

    Returns:
        str: The trimmed, lowercased username.

    """
    return username.strip().lower()


async def create(
    *,
    db: AsyncSession,
    username: str,
    password_hash: str | None,
    level: Level,
    is_admin: bool = False,
    is_owner: bool = False,
    display_name: str | None = None,
    must_change_password: bool = False,
) -> models.AuthUser:
    """Add a new user to the database.

    Takes an already-derived hash rather than a plaintext password. Deriving one blocks
    for tens of milliseconds, and this module is called from async request handlers
    where that would stall the whole process; callers pick
    :func:`spoolman.auth.hashing.hash_password_async` or its synchronous twin according
    to where they run.

    Args:
        db: The database session.
        username: The username, stored lowercased.
        password_hash: The encoded password hash, or None for an account that cannot
            sign in with a password.
        level: The permission level to grant.
        is_admin: Whether the user administers other users.
        is_owner: Whether the user owns the instance.
        display_name: An optional friendly name.
        must_change_password: Whether to force a password change at next sign-in.

    Returns:
        models.AuthUser: The created user.

    """
    user = models.AuthUser(
        username=normalize_username(username),
        display_name=display_name,
        email=None,
        password_hash=password_hash,
        level=str(level),
        is_admin=is_admin,
        is_owner=is_owner,
        is_active=True,
        must_change_password=must_change_password,
        totp_secret=None,
        totp_enabled=False,
        oidc_issuer=None,
        oidc_subject=None,
        failed_logins=0,
        locked_until=None,
        registered=datetime.utcnow().replace(microsecond=0),
        last_login=None,
    )
    db.add(user)
    await db.commit()
    return user


async def get_by_id(db: AsyncSession, user_id: int) -> models.AuthUser:
    """Get a user from the database by the unique ID.

    Args:
        db: The database session.
        user_id: The user ID.

    Raises:
        ItemNotFoundError: If no such user exists.

    Returns:
        models.AuthUser: The user.

    """
    user = await db.get(models.AuthUser, user_id)
    if user is None:
        raise ItemNotFoundError(f"No user with ID {user_id} found.")
    return user


async def get_by_username(db: AsyncSession, username: str) -> models.AuthUser | None:
    """Get a user from the database by username.

    Returns None rather than raising, because the caller is usually the login path and a
    missing user there is an expected outcome, not an error.

    Args:
        db: The database session.
        username: The username, in any case.

    Returns:
        Optional[models.AuthUser]: The user, or None.

    """
    stmt = select(models.AuthUser).where(models.AuthUser.username == normalize_username(username))
    return (await db.execute(stmt)).scalar_one_or_none()


async def count(db: AsyncSession) -> int:
    """Count the user accounts that exist.

    Args:
        db: The database session.

    Returns:
        int: The number of accounts.

    """
    stmt = select(func.count()).select_from(models.AuthUser)
    return (await db.execute(stmt)).scalar_one()


async def find(
    *,
    db: AsyncSession,
    limit: int | None = None,
    offset: int = 0,
) -> tuple[list[models.AuthUser], int]:
    """List user accounts.

    Args:
        db: The database session.
        limit: The maximum number to return.
        offset: How many to skip.

    Returns:
        tuple: The users, and the total number that exist.

    """
    stmt = select(models.AuthUser).order_by(models.AuthUser.username)
    total = await count(db)
    if offset:
        stmt = stmt.offset(offset)
    if limit is not None:
        stmt = stmt.limit(limit)
    rows = list((await db.execute(stmt)).scalars().all())
    return rows, total


# Fields an administrator may change through :func:`update`. A whitelist rather than
# open setattr, so that a bug or a crafted request in the API layer cannot reach
# password_hash, is_owner, or the lockout counters.
UPDATABLE_FIELDS = frozenset({"level", "is_admin", "is_active", "display_name"})


async def update(*, db: AsyncSession, user: models.AuthUser, changes: dict[str, object]) -> models.AuthUser:
    """Apply administrative changes to an account.

    Args:
        db: The database session.
        user: The user to modify.
        changes: Field names and their new values.

    Raises:
        ValueError: If a field outside :data:`UPDATABLE_FIELDS` is named.

    Returns:
        models.AuthUser: The modified user.

    """
    unknown = set(changes) - UPDATABLE_FIELDS
    if unknown:
        raise ValueError(f"Cannot update field(s): {', '.join(sorted(unknown))}.")
    for field, value in changes.items():
        setattr(user, field, value)
    await db.commit()
    return user


async def delete_user(*, db: AsyncSession, user: models.AuthUser) -> None:
    """Remove an account.

    The caller is responsible for clearing what references it first -- sessions, API
    keys and audit entries all carry a foreign key to this row. Deliberately not done
    here: the audit log's rows are kept and merely detached, which is a policy decision
    that belongs with the caller rather than buried in a delete.

    Args:
        db: The database session.
        user: The user to remove.

    """
    await db.delete(user)
    await db.commit()


async def set_password(
    *,
    db: AsyncSession,
    user: models.AuthUser,
    password_hash: str,
    must_change: bool = False,
) -> None:
    """Replace a user's password.

    Args:
        db: The database session.
        user: The user to modify.
        password_hash: The encoded hash of the new password.
        must_change: Whether to force another change at next sign-in.

    """
    user.password_hash = password_hash
    user.must_change_password = must_change
    # A password change resets the lockout: the credential being guessed no longer
    # exists, so continuing to hold the account shut serves no purpose.
    user.failed_logins = 0
    user.locked_until = None
    await db.commit()


async def rehash_password(*, db: AsyncSession, user: models.AuthUser, password_hash: str) -> None:
    """Store a re-derived hash of the same password.

    Used by the login path when the cost parameters have been raised since the stored
    hash was produced. Deliberately leaves must_change_password, failed_logins and
    locked_until alone: nothing about the user's credential has changed.

    Args:
        db: The database session.
        user: The user to modify.
        password_hash: The newly encoded hash.

    """
    user.password_hash = password_hash
    await db.commit()


def lockout_for(failed_logins: int) -> timedelta | None:
    """Work out how long an account should be locked after a number of failures.

    Args:
        failed_logins: The running count of consecutive failures.

    Returns:
        Optional[timedelta]: How long to lock for, or None if below the threshold.

    """
    if failed_logins < LOCKOUT_THRESHOLD:
        return None
    doublings = failed_logins - LOCKOUT_THRESHOLD
    return min(LOCKOUT_BASE * (2**doublings), LOCKOUT_MAX)


async def record_login_failure(*, db: AsyncSession, user: models.AuthUser) -> None:
    """Note a failed sign-in, locking the account once failures pile up.

    Persisted rather than kept only in the in-memory window so that a lockout survives a
    restart.

    Args:
        db: The database session.
        user: The user who failed to sign in.

    """
    user.failed_logins += 1
    lockout = lockout_for(user.failed_logins)
    if lockout is not None:
        user.locked_until = datetime.utcnow().replace(microsecond=0) + lockout
    await db.commit()


async def record_login_success(*, db: AsyncSession, user: models.AuthUser) -> None:
    """Note a successful sign-in and clear any lockout.

    Args:
        db: The database session.
        user: The user who signed in.

    """
    user.failed_logins = 0
    user.locked_until = None
    user.last_login = datetime.utcnow().replace(microsecond=0)
    await db.commit()


def is_locked(user: models.AuthUser) -> bool:
    """Check whether an account is currently locked out.

    Args:
        user: The user to check.

    Returns:
        bool: True if sign-in should be refused.

    """
    if user.locked_until is None:
        return False
    return user.locked_until > datetime.utcnow()

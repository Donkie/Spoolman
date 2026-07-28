"""The audit trail.

What gets recorded is anything that changes who can do what, plus every sign-in attempt.
Ordinary data changes -- creating a spool, using filament -- are deliberately not
recorded here. Those are already visible in the data itself, and mixing them in would
bury the handful of security-relevant events under thousands of routine ones, which is
how audit logs stop being read.

Writing is best effort. :func:`record` never raises and never blocks the operation it is
describing: an instance whose audit table is somehow unwritable should still let people
sign in. The failure is logged instead, which is the one place an operator will see it.

Each write uses its own database session rather than the caller's. Login attempts have
already committed by the time they are audited, several call sites have no session in
hand at all, and a shared session would mean an audit write could roll back the
operation it was recording. The cost is one extra short transaction on paths that
already do several.
"""

import datetime
import json
import logging
from enum import StrEnum
from typing import Any, Final

from scheduler.asyncio.scheduler import Scheduler
from starlette.requests import Request
from starlette.websockets import WebSocket

from spoolman import env
from spoolman.auth.principal import Principal, PrincipalKind
from spoolman.auth.ratelimit import client_ip
from spoolman.database import auth_audit as auth_audit_db
from spoolman.settings import parse_setting

logger = logging.getLogger(__name__)

USER_AGENT_HEADER: Final = "user-agent"

RETENTION_SETTING: Final = "auth_audit_retention_days"

# Used when the retention setting cannot be read at all. Matches the setting's own
# default, so a database that is briefly unavailable does not silently switch the
# instance to keeping entries forever.
DEFAULT_RETENTION_DAYS: Final = 90


class AuditEvent(StrEnum):
    """Everything the audit log records.

    The values are stable identifiers, stored in the database and matched against by the
    listing endpoint's filter. Renaming one orphans the history that used the old name,
    so add rather than rename.
    """

    LOGIN_SUCCESS = "login.success"
    LOGIN_FAILURE = "login.failure"
    LOGIN_LOCKED = "login.locked"
    LOGOUT = "logout"
    INSTANCE_CLAIMED = "instance.claimed"

    # Event names, not credentials. Ruff's hardcoded-password heuristic only sees the
    # word "password" in the member name.
    PASSWORD_CHANGED = "password.changed"  # noqa: S105
    PASSWORD_RESET = "password.reset"  # noqa: S105

    USER_CREATED = "user.created"
    USER_UPDATED = "user.updated"
    USER_DELETED = "user.deleted"

    APIKEY_CREATED = "apikey.created"
    APIKEY_REVOKED = "apikey.revoked"
    APIKEY_DELETED = "apikey.deleted"

    SESSIONS_REVOKED = "sessions.revoked"


def _actor_kind(principal: Principal | None) -> str:
    """Describe how the actor was authenticated."""
    if principal is None:
        return str(PrincipalKind.ANONYMOUS)
    return str(principal.kind)


async def record(
    conn: Request | WebSocket | None,
    event: AuditEvent,
    *,
    principal: Principal | None = None,
    actor_user_id: int | None = None,
    target: str | None = None,
    detail: dict[str, Any] | None = None,
) -> None:
    """Record an event, if auditing applies.

    Does nothing when authentication is disabled. An instance that has never turned auth
    on has no accounts, no sessions and no keys, so there is nothing meaningful to
    attribute an event to, and writing rows to a table nothing reads would just grow the
    database of every existing user.

    Args:
        conn: The request or websocket the event happened on, for the address and user
            agent. May be None for events that did not arise from a request.
        event: What happened.
        principal: Who did it, if a principal had been resolved.
        actor_user_id: Who did it, when the user is known but no principal exists --
            a failed sign-in against a real account, for instance.
        target: What was acted on.
        detail: Anything else worth keeping. Stored as a JSON object.

    """
    if not env.is_auth_enabled():
        return

    try:
        # Imported here rather than at module scope: this module is reachable from the
        # command line tool, and get_db_session belongs to a module that assumes a
        # configured database.
        from spoolman.database.database import get_db_session  # noqa: PLC0415

        if actor_user_id is None and principal is not None:
            actor_user_id = principal.user_id

        generator = get_db_session()
        db = await anext(generator)
        try:
            await auth_audit_db.record(
                db=db,
                event=str(event),
                actor_kind=_actor_kind(principal),
                actor_user_id=actor_user_id,
                target=target,
                ip=client_ip(conn) if conn is not None else None,
                user_agent=conn.headers.get(USER_AGENT_HEADER) if conn is not None else None,
                detail=json.dumps(detail) if detail else None,
            )
        finally:
            await generator.aclose()
    except Exception:
        # Never propagates. See the module docstring.
        logger.exception("Failed to write audit log entry for %s.", event)


async def retention_days() -> int:
    """Read how long audit entries are kept.

    Returns:
        int: The retention window in days. Zero means keep everything.

    """
    from spoolman.database import setting as setting_db  # noqa: PLC0415
    from spoolman.database.database import get_db_session  # noqa: PLC0415
    from spoolman.exceptions import ItemNotFoundError  # noqa: PLC0415

    definition = parse_setting(RETENTION_SETTING)
    try:
        generator = get_db_session()
        db = await anext(generator)
        try:
            try:
                row = await setting_db.get(db, definition)
            except ItemNotFoundError:
                return int(json.loads(definition.default))
            return int(json.loads(row.value))
        finally:
            await generator.aclose()
    except Exception:
        logger.exception("Failed to read the %s setting, keeping the default.", RETENTION_SETTING)
        return DEFAULT_RETENTION_DAYS


async def _prune_task() -> None:
    """Apply the configured retention window to the audit log."""
    from spoolman.database.database import get_db_session  # noqa: PLC0415

    days = await retention_days()
    if days <= 0:
        return

    cutoff = datetime.datetime.utcnow().replace(microsecond=0) - datetime.timedelta(days=days)
    generator = get_db_session()
    db = await anext(generator)
    try:
        removed = await auth_audit_db.prune_older_than(db, cutoff)
    finally:
        await generator.aclose()

    if removed:
        logger.info("Pruned %d audit log entries older than %d days.", removed, days)


def schedule_tasks(scheduler: Scheduler) -> None:
    """Schedule the audit log retention sweep.

    Only scheduled when authentication is enabled, since nothing writes to the table
    otherwise and the job would be a nightly no-op on every existing instance.

    Args:
        scheduler: The scheduler to use.

    """
    if not env.is_auth_enabled():
        return
    logger.info("Scheduling automatic audit log pruning.")
    # Half an hour after the nightly backup rather than alongside it, so the two do not
    # contend for SQLite's single write lock.
    scheduler.daily(datetime.time(hour=0, minute=30, second=0), _prune_task)  # type: ignore[arg-type]

"""Permission gates for API routes.

HTTP routes are gated by adding ``dependencies=[Depends(require_level(Level.X))]`` to
the route decorator. Websocket routes cannot use that mechanism -- see
:func:`ws_authenticated` for why -- and are gated with a decorator instead.

Both mechanisms tag the callable they produce with :data:`AUTH_LEVEL_ATTR`, which is
what :mod:`spoolman.auth.coverage` reads to prove at import time that no route was left
ungated.
"""

import functools
import json
import logging
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from typing import Final, ParamSpec, TypeVar

from sqlalchemy.ext.asyncio import AsyncSession
from starlette.requests import Request
from starlette.websockets import WebSocket

from spoolman import env
from spoolman.auth import cookies
from spoolman.auth.levels import Level, parse_level
from spoolman.auth.principal import ANONYMOUS_READER, UNRESTRICTED, Principal, PrincipalKind
from spoolman.database import auth_session as auth_session_db
from spoolman.database import auth_user as auth_user_db
from spoolman.database import models
from spoolman.database.database import get_db_session
from spoolman.exceptions import AuthenticationRequiredError, ItemNotFoundError, PermissionDeniedError
from spoolman.settings import parse_setting

logger = logging.getLogger(__name__)

AUTH_LEVEL_ATTR: Final = "__spoolman_auth_level__"

# Websocket close codes. The codebase's convention is 4000 plus the HTTP status it
# stands in for, following the existing 4040 in spoolman/api/v1/setting.py.
WS_UNAUTHENTICATED: Final = 4401
WS_FORBIDDEN: Final = 4403

# Where a resolved principal is cached, so several gates on one request cost one lookup.
REQUEST_STATE_ATTR: Final = "spoolman_principal"

P = ParamSpec("P")
R = TypeVar("R")


ANONYMOUS_READ_SETTING: Final = "auth_anonymous_read"


@asynccontextmanager
async def _db_session() -> AsyncIterator[AsyncSession]:
    """Open a database session outside FastAPI's dependency system.

    ``get_db_session`` is an async generator. Driving it with ``async for`` and then
    breaking or returning leaves it suspended at its yield, so the ``finally`` that
    closes the session never runs on the event loop -- the garbage collector reaches it
    later and SQLAlchemy raises out of a context where it cannot await. Closing the
    generator explicitly keeps that deterministic.

    Note this skips the generator's own trailing commit, which is deliberate: callers
    here commit explicitly where they mean to write.

    Yields:
        AsyncSession: The database session.

    """
    generator = get_db_session()
    session = await anext(generator)
    try:
        yield session
    finally:
        await generator.aclose()


async def anonymous_read_enabled() -> bool:
    """Check the setting that grants unauthenticated read access.

    Fails closed. Any problem reaching the setting -- the database being unavailable,
    the row holding something that is not a boolean -- denies access rather than
    granting it, because the failure mode of guessing wrong here is serving the whole
    database to anonymous callers.
    """
    # Imported lazily: spoolman.database.setting pulls in the websocket manager, and at
    # module scope that would drag it into every import of this package, including the
    # command line tool.
    from spoolman.database import setting as setting_db  # noqa: PLC0415

    definition = parse_setting(ANONYMOUS_READ_SETTING)
    try:
        async with _db_session() as db:
            try:
                row = await setting_db.get(db, definition)
            except ItemNotFoundError:
                # Never set, so it holds its default of false.
                return False
            return json.loads(row.value) is True
    except Exception:
        logger.exception("Failed to read the %s setting, denying anonymous access.", ANONYMOUS_READ_SETTING)
        return False


def _principal_for_user(user: models.AuthUser, session_id: int) -> Principal:
    """Build a principal from a user row and the session that authenticated it."""
    return Principal(
        kind=PrincipalKind.USER,
        level=parse_level(user.level),
        user_id=user.id,
        username=user.username,
        is_admin=user.is_admin,
        is_owner=user.is_owner,
        session_id=session_id,
    )


async def resolve_principal(conn: Request | WebSocket) -> Principal | None:
    """Work out who is making a request.

    Resolution order is the session cookie, then anonymous read if the setting allows
    it. API keys and certificates join this list in later phases.

    This opens its own short-lived database session rather than depending on
    ``get_db_session``. A route-level dependency is solved before the handler's own
    parameters, so declaring one here would open a session on every request -- including
    /health and /info, which currently need no database at all and would start failing
    when the database is down.

    Args:
        conn: The request or websocket being authenticated.

    Returns:
        Optional[Principal]: The principal, or None if no credential was accepted.

    """
    cached = getattr(conn.state, REQUEST_STATE_ATTR, None) if hasattr(conn, "state") else None
    if cached is not None:
        return cached

    principal: Principal | None = None
    token = conn.cookies.get(cookies.SESSION_COOKIE, "")
    if token:
        async with _db_session() as db:
            session = await auth_session_db.resolve(db, token)
            if session is not None:
                user = await auth_user_db.get_by_id(db, session.user_id)
                if user.is_active:
                    principal = _principal_for_user(user, session.id)

    if principal is None and await anonymous_read_enabled():
        principal = ANONYMOUS_READER

    if principal is not None and hasattr(conn, "state"):
        setattr(conn.state, REQUEST_STATE_ATTR, principal)
    return principal


def require_level(
    level: Level,
    *,
    allow_anonymous: bool = True,
) -> Callable[[Request], Awaitable[Principal]]:
    """Build a dependency that admits requests at or above a permission level.

    Args:
        level: The level required.
        allow_anonymous: Whether the anonymous-read setting can satisfy this route.
            Turned off for endpoints that expose the database in bulk.

    Returns:
        Callable: A FastAPI dependency yielding the principal.

    """

    async def gate(request: Request) -> Principal:
        if not env.is_auth_enabled():
            return UNRESTRICTED

        principal = await resolve_principal(request)
        if principal is None:
            raise AuthenticationRequiredError("Authentication required.")
        if principal.kind is PrincipalKind.ANONYMOUS and not allow_anonymous:
            raise AuthenticationRequiredError("Authentication required.")
        if not principal.covers(level):
            raise PermissionDeniedError(f"This operation requires the '{level}' permission level.")
        if principal.kind is PrincipalKind.USER and not cookies.verify_csrf(request):
            # 403 rather than 401 on purpose: the credential is valid, so telling the
            # client it is unauthenticated would sign the user out over what is usually
            # a stale tab rather than an attack.
            raise PermissionDeniedError("CSRF token missing or invalid.")
        return principal

    setattr(gate, AUTH_LEVEL_ATTR, level)
    return gate


def require_user() -> Callable[[Request], Awaitable[Principal]]:
    """Build a dependency that requires a real signed-in user.

    Returns:
        Callable: A FastAPI dependency yielding the principal.

    """
    inner = require_level(Level.READ, allow_anonymous=False)

    async def gate(request: Request) -> Principal:
        principal = await inner(request)
        if principal.kind is PrincipalKind.ANONYMOUS:
            raise AuthenticationRequiredError("Authentication required.")
        return principal

    setattr(gate, AUTH_LEVEL_ATTR, Level.READ)
    return gate


def require_admin() -> Callable[[Request], Awaitable[Principal]]:
    """Build a dependency that requires administrator rights.

    Returns:
        Callable: A FastAPI dependency yielding the principal.

    """
    inner = require_level(Level.MANAGE, allow_anonymous=False)

    async def gate(request: Request) -> Principal:
        principal = await inner(request)
        if not env.is_auth_enabled():
            return principal
        if not principal.is_admin:
            raise PermissionDeniedError("This operation requires administrator rights.")
        return principal

    setattr(gate, AUTH_LEVEL_ATTR, Level.MANAGE)
    return gate


def ws_authenticated(level: Level) -> Callable[[Callable[P, Awaitable[R]]], Callable[P, Awaitable[R]]]:
    """Gate a websocket handler.

    The handshake is accepted *before* any rejection close, which looks wrong and is
    deliberate. uvicorn translates a close sent before the accept into an HTTP 403
    handshake rejection and discards the close code entirely, and Starlette routes
    WebSocketException raised from a dependency through that same path. Neither can
    deliver 4401 or 4403 to the client. Accepting first and then closing is the only
    way the browser observes the real code, which is what lets the client tell "you are
    signed out, stop retrying" apart from "the network blipped, back off and retry".

    A socket that is accepted and immediately closed never joins the websocket manager,
    so it costs nothing.

    Decorated handlers must not call ``websocket.accept()`` themselves.

    Args:
        level: The level required to subscribe.

    Returns:
        Callable: The decorator.

    """

    def decorate(func: Callable[P, Awaitable[R]]) -> Callable[P, Awaitable[R]]:
        @functools.wraps(func)
        async def wrapper(*args: P.args, **kwargs: P.kwargs) -> R | None:
            websocket = kwargs["websocket"]
            assert isinstance(websocket, WebSocket)  # noqa: S101
            await websocket.accept()

            if env.is_auth_enabled():
                principal = await resolve_principal(websocket)
                if principal is None:
                    await websocket.close(code=WS_UNAUTHENTICATED, reason="Authentication required.")
                    return None
                if not principal.covers(level):
                    await websocket.close(code=WS_FORBIDDEN, reason="Insufficient permission level.")
                    return None

            return await func(*args, **kwargs)

        setattr(wrapper, AUTH_LEVEL_ATTR, level)
        return wrapper  # type: ignore[return-value]

    return decorate

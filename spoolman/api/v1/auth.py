"""Sign-in, sign-out and account endpoints.

Every endpoint here returns a JSON body, never a bare 204. The client's fetch helpers
parse a body unconditionally, so an empty response would surface as a parse failure
rather than a success.

These routes are reachable without credentials by necessity -- they are how a credential
is obtained -- so each does its own checking rather than relying on a permission gate.
"""

# ruff: noqa: D103

import logging
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from spoolman import env
from spoolman.auth import cookies
from spoolman.auth.audit import AuditEvent, record
from spoolman.auth.dependencies import anonymous_read_enabled, require_user, resolve_principal
from spoolman.auth.hashing import (
    dummy_verify_async,
    hash_password_async,
    needs_rehash,
    new_token,
    verify_password_async,
)
from spoolman.auth.levels import Level
from spoolman.auth.principal import Principal, PrincipalKind
from spoolman.auth.ratelimit import client_ip, ip_window
from spoolman.database import auth_session as auth_session_db
from spoolman.database import auth_user as auth_user_db
from spoolman.database import models as db_models
from spoolman.database.database import get_db_session

from . import models

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/auth",
    tags=["auth"],
)

# One message for every failed sign-in. Distinguishing "no such user" from "wrong
# password" would let anyone enumerate accounts; the equal-time dummy verify below
# closes the same leak in the timing channel.
INVALID_CREDENTIALS = "Incorrect username or password."

BAD_REQUEST = 400
UNAUTHORIZED = 401
FORBIDDEN = 403
CONFLICT = 409
TOO_MANY_REQUESTS = 429
CREATED = 201

USER_AGENT_HEADER = "user-agent"


def _message(status_code: int, message: str, headers: dict[str, str] | None = None) -> JSONResponse:
    """Build an error response in the shape the rest of this API uses."""
    return JSONResponse(status_code=status_code, content={"message": message}, headers=headers)


def _session_info(principal: Principal | None, user: models.AuthUserInfo | None = None) -> models.AuthSessionInfo:
    """Describe the caller's standing."""
    if principal is None:
        return models.AuthSessionInfo(
            authenticated=False,
            anonymous=False,
            level=str(Level.READ),
            is_admin=False,
            is_owner=False,
        )
    return models.AuthSessionInfo(
        authenticated=principal.kind in {PrincipalKind.USER, PrincipalKind.DISABLED},
        anonymous=principal.kind is PrincipalKind.ANONYMOUS,
        level=str(principal.level),
        is_admin=principal.is_admin,
        is_owner=principal.is_owner,
        user=user,
    )


def _failure_reason(user: db_models.AuthUser | None) -> str:
    """Say why a sign-in failed before a password was even checked, for the audit log."""
    if user is None:
        return "no_such_user"
    if not user.is_active:
        return "account_disabled"
    return "no_password_set"


def _throttled(address: str) -> JSONResponse | None:
    """Check the per-address sign-in throttle, returning a 429 response if it has tripped.

    Checked before any password hashing, so a flood of attempts cannot be turned into
    CPU exhaustion against the single server process. Per-account throttling is separate
    and lives on the user row; see :func:`spoolman.database.auth_user.lockout_for`.
    """
    if not address:
        return None
    decision = ip_window.check(address)
    if decision.allowed:
        return None
    return _message(
        TOO_MANY_REQUESTS,
        "Too many sign-in attempts. Try again shortly.",
        {"Retry-After": str(decision.retry_after)},
    )


async def _start_session(
    *,
    db: AsyncSession,
    request: Request,
    user_id: int,
    remember: bool,
) -> tuple[str, str]:
    """Create a session row and return the tokens the cookies should carry."""
    _, token = await auth_session_db.create(
        db=db,
        user_id=user_id,
        remember=remember,
        user_agent=request.headers.get(USER_AGENT_HEADER),
        ip=client_ip(request) or None,
    )
    return token, new_token()


@router.get(
    "/config",
    name="Get authentication configuration",
    description=(
        "Report whether authentication is enabled and how to sign in. Always reachable "
        "without credentials, since a client needs this before it can present any."
    ),
    response_model=models.AuthConfig,
)
async def get_config(db: Annotated[AsyncSession, Depends(get_db_session)]) -> models.AuthConfig:
    if not env.is_auth_enabled():
        return models.AuthConfig(enabled=False, setup_required=False, anonymous_read=False)
    return models.AuthConfig(
        enabled=True,
        setup_required=await auth_user_db.count(db) == 0,
        anonymous_read=await anonymous_read_enabled(),
    )


@router.post(
    "/setup",
    name="Claim this instance",
    description=(
        "Create the owner account. Only possible while no account exists; the owner "
        "administers everyone else. The caller is signed in as the new owner."
    ),
    response_model=models.AuthSessionInfo,
    responses={403: {"model": models.Message}, 409: {"model": models.Message}},
    status_code=201,
)
async def setup(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    request: Request,
    body: models.SetupRequest,
) -> Response:
    if not env.is_auth_enabled():
        return _message(FORBIDDEN, "Authentication is not enabled on this instance.")
    if await auth_user_db.count(db) > 0:
        return _message(CONFLICT, "This instance has already been claimed.")

    password_hash = await hash_password_async(body.password)
    try:
        user = await auth_user_db.create(
            db=db,
            username=body.username,
            password_hash=password_hash,
            level=Level.MANAGE,
            is_admin=True,
            is_owner=True,
            display_name=body.display_name,
        )
    except IntegrityError:
        # Two callers raced for an unclaimed instance; the unique index on username
        # decided it. The loser is told the same thing as a late arrival.
        await db.rollback()
        return _message(CONFLICT, "This instance has already been claimed.")

    # Loud on purpose: whoever reached the instance first now owns it, and the operator
    # should be able to see from the log whether that was them.
    logger.warning(
        "Instance ownership claimed by %r from %s.",
        user.username,
        client_ip(request) or "an unknown address",
    )

    await record(request, AuditEvent.INSTANCE_CLAIMED, actor_user_id=user.id, target=user.username)

    token, csrf = await _start_session(db=db, request=request, user_id=user.id, remember=False)
    info = _session_info(
        Principal(
            kind=PrincipalKind.USER,
            level=Level.MANAGE,
            user_id=user.id,
            username=user.username,
            is_admin=True,
            is_owner=True,
        ),
        models.AuthUserInfo.from_db(user),
    )
    response = JSONResponse(status_code=CREATED, content=info.model_dump())
    cookies.set_session_cookies(response, request, token=token, csrf=csrf, remember=False)
    return response


@router.post(
    "/login",
    name="Sign in",
    description="Exchange a username and password for a session cookie.",
    response_model=models.AuthSessionInfo,
    responses={
        401: {"model": models.Message},
        403: {"model": models.Message},
        429: {"model": models.Message},
    },
)
async def login(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    request: Request,
    body: models.LoginRequest,
) -> Response:
    if not env.is_auth_enabled():
        return _message(FORBIDDEN, "Authentication is not enabled on this instance.")

    username = auth_user_db.normalize_username(body.username)
    address = client_ip(request)

    throttled = _throttled(address)
    if throttled is not None:
        return throttled

    user = await auth_user_db.get_by_username(db, username)

    if user is None or not user.is_active or user.password_hash is None:
        # Spend a verification's worth of time anyway, so that a missing, disabled or
        # password-less account is indistinguishable from a wrong password.
        await dummy_verify_async()
        if address:
            ip_window.hit(address)
        # The audit entry does distinguish these cases, unlike the response. Its readers
        # are administrators who already know which accounts exist, and "somebody is
        # trying to sign in to the account you disabled" is exactly what a log is for.
        await record(
            request,
            AuditEvent.LOGIN_FAILURE,
            actor_user_id=user.id if user is not None else None,
            target=username,
            detail={"reason": _failure_reason(user)},
        )
        return _message(UNAUTHORIZED, INVALID_CREDENTIALS)

    if auth_user_db.is_locked(user) and user.locked_until is not None:
        # Deliberately not spending a hash here: the answer is already decided, and
        # burning CPU on locked accounts is a self-inflicted denial of service.
        retry_after = max(int((user.locked_until - datetime.utcnow()).total_seconds()), 1)
        await record(
            request,
            AuditEvent.LOGIN_LOCKED,
            actor_user_id=user.id,
            target=username,
            detail={"retry_after": retry_after},
        )
        return _message(
            TOO_MANY_REQUESTS,
            "Too many sign-in attempts. Try again shortly.",
            {"Retry-After": str(retry_after)},
        )

    if not await verify_password_async(body.password, user.password_hash):
        await auth_user_db.record_login_failure(db=db, user=user)
        if address:
            ip_window.hit(address)
        await record(
            request,
            AuditEvent.LOGIN_FAILURE,
            actor_user_id=user.id,
            target=username,
            detail={"reason": "bad_password", "failed_logins": user.failed_logins},
        )
        return _message(UNAUTHORIZED, INVALID_CREDENTIALS)

    await auth_user_db.record_login_success(db=db, user=user)
    await record(request, AuditEvent.LOGIN_SUCCESS, actor_user_id=user.id, target=user.username)

    # Upgrade the stored hash if the cost parameters have been raised since it was made.
    if needs_rehash(user.password_hash):
        await auth_user_db.rehash_password(
            db=db,
            user=user,
            password_hash=await hash_password_async(body.password),
        )

    token, csrf = await _start_session(db=db, request=request, user_id=user.id, remember=body.remember)
    info = _session_info(
        Principal(
            kind=PrincipalKind.USER,
            level=Level(user.level),
            user_id=user.id,
            username=user.username,
            is_admin=user.is_admin,
            is_owner=user.is_owner,
        ),
        models.AuthUserInfo.from_db(user),
    )
    response = JSONResponse(content=info.model_dump())
    cookies.set_session_cookies(response, request, token=token, csrf=csrf, remember=body.remember)
    return response


@router.post(
    "/logout",
    name="Sign out",
    description="End the current session. Succeeds even if there was no session to end.",
    response_model=models.Message,
)
async def logout(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    request: Request,
) -> Response:
    # Idempotent, and reachable without a gate: signing out has to work even when the
    # session has already expired server-side, which is exactly when a client most wants
    # its cookies cleared.
    token = request.cookies.get(cookies.SESSION_COOKIE, "")
    if token:
        # Resolved before the revoke, while the token still identifies somebody. A
        # sign-out that cannot say who signed out is not worth recording.
        principal = await resolve_principal(request)
        await auth_session_db.revoke_by_token(db, token)
        if principal is not None and principal.user_id is not None:
            await record(request, AuditEvent.LOGOUT, principal=principal, target=principal.username)
    response = JSONResponse(content={"message": "Signed out."})
    cookies.clear_session_cookies(response, request)
    return response


@router.get(
    "/session",
    name="Get the current session",
    description=(
        "Describe the caller's current standing. Answers for signed-out callers too, "
        "so a client can distinguish having no session from being unable to reach the server."
    ),
    response_model=models.AuthSessionInfo,
)
async def get_session(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    request: Request,
) -> models.AuthSessionInfo:
    if not env.is_auth_enabled():
        return models.AuthSessionInfo(
            authenticated=True,
            anonymous=False,
            level=str(Level.MANAGE),
            is_admin=True,
            is_owner=True,
        )

    principal = await resolve_principal(request)
    user_info = None
    if principal is not None and principal.user_id is not None:
        user_info = models.AuthUserInfo.from_db(await auth_user_db.get_by_id(db, principal.user_id))
    return _session_info(principal, user_info)


@router.post(
    "/password",
    name="Change own password",
    description="Replace one's own password. Requires the current password.",
    response_model=models.Message,
    responses={400: {"model": models.Message}, 401: {"model": models.Message}},
)
async def change_password(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    request: Request,
    principal: Annotated[Principal, Depends(require_user())],
    body: models.PasswordChangeRequest,
) -> Response:
    if principal.user_id is None:
        return _message(UNAUTHORIZED, "Authentication required.")

    user = await auth_user_db.get_by_id(db, principal.user_id)
    if user.password_hash is None or not await verify_password_async(body.current_password, user.password_hash):
        await record(
            request,
            AuditEvent.LOGIN_FAILURE,
            principal=principal,
            target=user.username,
            detail={"reason": "bad_password", "during": "password_change"},
        )
        return _message(BAD_REQUEST, "The current password is incorrect.")

    await auth_user_db.set_password(
        db=db,
        user=user,
        password_hash=await hash_password_async(body.new_password),
    )
    # Other sessions are deliberately left alone. Someone changing their password
    # routinely does not expect their phone to be signed out; an administrator who
    # suspects a compromise has "sign out everywhere" for that, and a reset performed
    # for them revokes everything.
    await record(request, AuditEvent.PASSWORD_CHANGED, principal=principal, target=user.username)
    return JSONResponse(content={"message": "Password changed."})

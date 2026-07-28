"""User administration endpoints.

Everything here needs ``require_admin``, which in turn needs a signed-in session -- an
API key never carries administrative rights, so a leaked printer credential cannot be
used to create a second account and entrench itself.

Two accounts are protected from the operations below, and both protections exist to stop
an instance being administered into a state nobody can recover from without the command
line:

* The owner cannot be demoted, disabled or deleted by anyone, themselves included. It is
  the account that can always fix the others.
* An administrator cannot demote, disable or delete themselves. Someone else with the
  rights has to do it, which guarantees a second pair of hands still exists afterwards.

Neither protection is a security boundary. Both are recoverable with
``python -m spoolman.cli``, which is the escape hatch when there is no working account
left at all.
"""

# ruff: noqa: D103

import logging
import secrets
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.responses import Response

from spoolman.auth.audit import AuditEvent, record
from spoolman.auth.dependencies import require_admin
from spoolman.auth.hashing import hash_password_async
from spoolman.auth.levels import parse_level
from spoolman.auth.principal import Principal
from spoolman.database import auth_api_key as auth_api_key_db
from spoolman.database import auth_audit as auth_audit_db
from spoolman.database import auth_session as auth_session_db
from spoolman.database import auth_user as auth_user_db
from spoolman.database import models as db_models
from spoolman.database.database import get_db_session
from spoolman.exceptions import ItemNotFoundError

from . import models

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/auth/user",
    tags=["auth"],
)

BAD_REQUEST = 400
FORBIDDEN = 403
NOT_FOUND = 404
CONFLICT = 409
CREATED = 201

# Length of a generated password, in bytes of entropy before base64. 16 bytes is 128
# bits, which is far past anything the account lockout would ever let be guessed; the
# length is chosen to still be transcribable rather than for the strength.
GENERATED_PASSWORD_BYTES = 16


def _message(status_code: int, message: str) -> JSONResponse:
    """Build an error response in the shape the rest of this API uses."""
    return JSONResponse(status_code=status_code, content={"message": message})


def _generate_password() -> str:
    """Make up a password for an account whose creator did not supply one."""
    return secrets.token_urlsafe(GENERATED_PASSWORD_BYTES)


def _protected(principal: Principal, user: db_models.AuthUser) -> str | None:
    """Check whether an account is shielded from a destructive change.

    Args:
        principal: Who is asking.
        user: The account being changed.

    Returns:
        Optional[str]: A refusal message, or None if the change may proceed.

    """
    if user.is_owner:
        return "The instance owner cannot be demoted, disabled or deleted."
    if user.id == principal.user_id:
        return "You cannot demote, disable or delete your own account. Ask another administrator."
    return None


class _Refused(Exception):  # noqa: N818
    """A change the protections above will not allow.

    An exception rather than a returned value so that :func:`_collect_changes` can stay
    a straight-line description of the four fields instead of threading a refusal back
    through every branch. Caught immediately by the one handler that raises it, and
    never escapes this module.
    """

    def __init__(self, status_code: int, message: str) -> None:
        """Record the refusal."""
        super().__init__(message)
        self.status_code = status_code
        self.message = message


def _collect_changes(
    principal: Principal,
    user: db_models.AuthUser,
    body: models.AuthUserUpdateRequest,
) -> dict[str, object]:
    """Work out what an update actually changes, refusing protected changes.

    Fields that are omitted, or that already hold the requested value, produce no
    change. That matters for the protections: re-sending an unchanged account from a
    form must not be refused just because the form included the owner's own level.

    Args:
        principal: Who is asking.
        user: The account being changed.
        body: The requested changes.

    Raises:
        _Refused: If a requested change is not allowed.

    Returns:
        dict: The fields to change and their new values.

    """
    changes: dict[str, object] = {}

    def guard() -> None:
        refusal = _protected(principal, user)
        if refusal is not None:
            raise _Refused(FORBIDDEN, refusal)

    if body.level is not None and body.level != user.level:
        try:
            level = parse_level(body.level)
        except ValueError as exc:
            raise _Refused(BAD_REQUEST, str(exc)) from exc
        guard()
        changes["level"] = str(level)

    # Granting administrator rights is unrestricted; removing them is what the
    # protections are about, so they are only consulted when something is taken away.
    if body.is_admin is not None and body.is_admin != user.is_admin:
        if not body.is_admin:
            guard()
        changes["is_admin"] = body.is_admin

    if body.is_active is not None and body.is_active != user.is_active:
        if not body.is_active:
            guard()
        changes["is_active"] = body.is_active

    if body.display_name is not None and body.display_name != user.display_name:
        changes["display_name"] = body.display_name

    return changes


@router.get(
    "",
    name="List users",
    description="List the accounts on this instance. Administrators only.",
    response_model=list[models.AuthUserInfo],
)
async def find(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    _principal: Annotated[Principal, Depends(require_admin())],
    limit: Annotated[int | None, Query(description="Maximum number of accounts to return.")] = None,
    offset: Annotated[int, Query(description="How many accounts to skip.")] = 0,
) -> Response:
    users, total = await auth_user_db.find(db=db, limit=limit, offset=offset)
    return JSONResponse(
        content=jsonable_encoder(
            [models.AuthUserInfo.from_db(user) for user in users],
            exclude_none=True,
        ),
        headers={"x-total-count": str(total)},
    )


@router.post(
    "",
    name="Create a user",
    description=(
        "Create an account. If no password is supplied one is generated and returned "
        "once, which is the only time it exists in a readable form."
    ),
    response_model=models.AuthUserCreated,
    responses={400: {"model": models.Message}, 409: {"model": models.Message}},
    status_code=201,
)
async def create(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    request: Request,
    principal: Annotated[Principal, Depends(require_admin())],
    body: models.AuthUserCreateRequest,
) -> Response:
    try:
        level = parse_level(body.level)
    except ValueError as exc:
        return _message(BAD_REQUEST, str(exc))

    username = auth_user_db.normalize_username(body.username)
    if not username:
        return _message(BAD_REQUEST, "A username is required.")
    if await auth_user_db.get_by_username(db, username) is not None:
        return _message(CONFLICT, f"A user named '{username}' already exists.")

    generated = body.password is None
    password = body.password or _generate_password()

    try:
        user = await auth_user_db.create(
            db=db,
            username=username,
            password_hash=await hash_password_async(password),
            level=level,
            is_admin=body.is_admin,
            display_name=body.display_name,
            must_change_password=body.must_change_password,
        )
    except IntegrityError:
        # Two administrators created the same username at once; the unique index decided.
        await db.rollback()
        return _message(CONFLICT, f"A user named '{username}' already exists.")

    await record(
        request,
        AuditEvent.USER_CREATED,
        principal=principal,
        target=user.username,
        detail={"level": str(level), "is_admin": body.is_admin},
    )

    created = models.AuthUserCreated(
        user=models.AuthUserInfo.from_db(user),
        password=password if generated else None,
    )
    return JSONResponse(status_code=CREATED, content=jsonable_encoder(created, exclude_none=True))


@router.get(
    "/{user_id}",
    name="Get a user",
    description="Get one account. Administrators only.",
    response_model=models.AuthUserInfo,
    responses={404: {"model": models.Message}},
)
async def get(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    _principal: Annotated[Principal, Depends(require_admin())],
    user_id: int,
) -> Response:
    try:
        user = await auth_user_db.get_by_id(db, user_id)
    except ItemNotFoundError as exc:
        return _message(NOT_FOUND, str(exc))
    return JSONResponse(content=jsonable_encoder(models.AuthUserInfo.from_db(user), exclude_none=True))


@router.patch(
    "/{user_id}",
    name="Update a user",
    description=(
        "Change an account's level, administrator flag, active flag or display name. "
        "Omitted fields are left alone. Disabling an account also ends its sessions."
    ),
    response_model=models.AuthUserInfo,
    responses={400: {"model": models.Message}, 403: {"model": models.Message}, 404: {"model": models.Message}},
)
async def update(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    request: Request,
    principal: Annotated[Principal, Depends(require_admin())],
    user_id: int,
    body: models.AuthUserUpdateRequest,
) -> Response:
    try:
        user = await auth_user_db.get_by_id(db, user_id)
    except ItemNotFoundError as exc:
        return _message(NOT_FOUND, str(exc))

    try:
        changes = _collect_changes(principal, user, body)
    except _Refused as refusal:
        return _message(refusal.status_code, refusal.message)

    if not changes:
        return JSONResponse(content=jsonable_encoder(models.AuthUserInfo.from_db(user), exclude_none=True))

    await auth_user_db.update(db=db, user=user, changes=changes)

    if changes.get("is_active") is False:
        # A disabled account whose cookie still works is not disabled. resolve_principal
        # already refuses an inactive user, but ending the sessions makes the state on
        # disk agree with the state in the browser.
        await auth_session_db.revoke_all_for_user(db, user.id)

    await record(
        request,
        AuditEvent.USER_UPDATED,
        principal=principal,
        target=user.username,
        detail={key: value for key, value in changes.items() if key != "display_name"},
    )
    return JSONResponse(content=jsonable_encoder(models.AuthUserInfo.from_db(user), exclude_none=True))


@router.post(
    "/{user_id}/password",
    name="Reset a user's password",
    description=(
        "Set somebody else's password and end all their sessions. If no password is "
        "supplied one is generated and returned once. The current password is not "
        "required -- this is the path for a user who has forgotten theirs."
    ),
    response_model=models.AuthUserCreated,
    responses={404: {"model": models.Message}},
)
async def reset_password(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    request: Request,
    principal: Annotated[Principal, Depends(require_admin())],
    user_id: int,
    body: models.AuthPasswordResetRequest,
) -> Response:
    try:
        user = await auth_user_db.get_by_id(db, user_id)
    except ItemNotFoundError as exc:
        return _message(NOT_FOUND, str(exc))

    generated = body.password is None
    password = body.password or _generate_password()

    await auth_user_db.set_password(
        db=db,
        user=user,
        password_hash=await hash_password_async(password),
        must_change=body.must_change_password,
    )
    # Whoever knew the old password may be exactly who this reset is defending against,
    # and their cookie would otherwise outlive the credential it was obtained with.
    revoked = await auth_session_db.revoke_all_for_user(db, user.id)

    await record(
        request,
        AuditEvent.PASSWORD_RESET,
        principal=principal,
        target=user.username,
        detail={"sessions_revoked": revoked, "must_change_password": body.must_change_password},
    )

    result = models.AuthUserCreated(
        user=models.AuthUserInfo.from_db(user),
        password=password if generated else None,
    )
    return JSONResponse(content=jsonable_encoder(result, exclude_none=True))


@router.post(
    "/{user_id}/revoke-sessions",
    name="Sign a user out everywhere",
    description="End every login session belonging to an account, without changing their password.",
    response_model=models.Message,
    responses={404: {"model": models.Message}},
)
async def revoke_sessions(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    request: Request,
    principal: Annotated[Principal, Depends(require_admin())],
    user_id: int,
) -> Response:
    try:
        user = await auth_user_db.get_by_id(db, user_id)
    except ItemNotFoundError as exc:
        return _message(NOT_FOUND, str(exc))

    revoked = await auth_session_db.revoke_all_for_user(db, user.id)
    await record(
        request,
        AuditEvent.SESSIONS_REVOKED,
        principal=principal,
        target=user.username,
        detail={"sessions_revoked": revoked},
    )
    return JSONResponse(content={"message": f"Ended {revoked} session(s)."})


@router.delete(
    "/{user_id}",
    name="Delete a user",
    description=(
        "Remove an account, its sessions and its API keys. Its audit log entries are "
        "kept but stop pointing at the account."
    ),
    response_model=models.Message,
    responses={403: {"model": models.Message}, 404: {"model": models.Message}},
)
async def delete(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    request: Request,
    principal: Annotated[Principal, Depends(require_admin())],
    user_id: int,
) -> Response:
    try:
        user = await auth_user_db.get_by_id(db, user_id)
    except ItemNotFoundError as exc:
        return _message(NOT_FOUND, str(exc))

    refusal = _protected(principal, user)
    if refusal is not None:
        return _message(FORBIDDEN, refusal)

    username = user.username
    await auth_session_db.revoke_all_for_user(db, user.id)
    await auth_api_key_db.delete_all_for_user(db, user.id)
    await auth_audit_db.clear_actor(db, user.id)
    await auth_user_db.delete_user(db=db, user=user)

    await record(request, AuditEvent.USER_DELETED, principal=principal, target=username)
    return JSONResponse(content={"message": f"Deleted user '{username}'."})

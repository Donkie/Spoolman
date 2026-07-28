"""API key endpoints.

A key is a machine credential: something a printer, a script or a scrape job presents on
every request, with no way to sign in and no browser to redirect. It belongs to a user
and can never outrank them.

Every route here is gated by ``require_user``, so a key cannot manage keys -- not even
its own. See that gate's docstring for why.
"""

# ruff: noqa: D103

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.responses import Response

from spoolman.auth.audit import AuditEvent, record
from spoolman.auth.dependencies import require_user
from spoolman.auth.levels import covers, parse_level
from spoolman.auth.principal import Principal
from spoolman.database import auth_api_key as auth_api_key_db
from spoolman.database import auth_user as auth_user_db
from spoolman.database.database import get_db_session
from spoolman.exceptions import ItemNotFoundError

from . import models

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/auth/apikey",
    tags=["auth"],
)

BAD_REQUEST = 400
FORBIDDEN = 403
NOT_FOUND = 404
CREATED = 201

# Keys a single account may hold at once. Not a security boundary; a stop on the one
# unbounded write an ordinary user can perform through this API.
MAX_KEYS_PER_USER = 50


def _message(status_code: int, message: str) -> JSONResponse:
    """Build an error response in the shape the rest of this API uses."""
    return JSONResponse(status_code=status_code, content={"message": message})


@router.get(
    "",
    name="List own API keys",
    description=(
        "List the calling user's API keys. Secrets are never included: the complete key "
        "is returned only once, by the request that created it. Revoked and expired keys "
        "are listed too, so that a key which stopped working can be told apart from one "
        "that was never made."
    ),
    response_model=list[models.AuthApiKeyInfo],
)
async def find(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    principal: Annotated[Principal, Depends(require_user())],
) -> Response:
    if principal.user_id is None:
        # Only reachable with authentication disabled, where there is no account to own
        # a key. Answering with an empty list rather than an error keeps the account
        # page renderable on an unauthenticated instance.
        return JSONResponse(content=[], headers={"x-total-count": "0"})

    user = await auth_user_db.get_by_id(db, principal.user_id)
    keys = await auth_api_key_db.find_for_user(db=db, user_id=principal.user_id)
    return JSONResponse(
        content=jsonable_encoder(
            [models.AuthApiKeyInfo.from_db(key, user.level) for key in keys],
            exclude_none=True,
        ),
        headers={"x-total-count": str(len(keys))},
    )


@router.post(
    "",
    name="Create an API key",
    description=(
        "Issue a new API key. The complete key is in the response and is never "
        "retrievable again. Present it in an `X-API-Key` header, or as a bearer token."
    ),
    response_model=models.AuthApiKeyCreated,
    responses={400: {"model": models.Message}, 403: {"model": models.Message}},
    status_code=201,
)
async def create(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    request: Request,
    principal: Annotated[Principal, Depends(require_user())],
    body: models.ApiKeyCreateRequest,
) -> Response:
    if principal.user_id is None:
        return _message(FORBIDDEN, "API keys require an account, and authentication is not enabled.")

    try:
        level = parse_level(body.level)
    except ValueError as exc:
        return _message(BAD_REQUEST, str(exc))

    # Refused rather than silently capped. A key quietly issued weaker than asked for is
    # a support ticket six months later when a script starts failing; an error now is
    # read immediately.
    if not covers(principal.level, level):
        return _message(FORBIDDEN, f"You cannot issue a key at the '{level}' level, which is above your own.")

    if await auth_api_key_db.count_for_user(db, principal.user_id) >= MAX_KEYS_PER_USER:
        return _message(
            BAD_REQUEST,
            f"You already have {MAX_KEYS_PER_USER} API keys. Delete one before creating another.",
        )

    user = await auth_user_db.get_by_id(db, principal.user_id)
    key, plaintext = await auth_api_key_db.create(
        db=db,
        user_id=principal.user_id,
        name=body.name,
        level=level,
        expires_days=body.expires_days,
    )

    await record(
        request,
        AuditEvent.APIKEY_CREATED,
        principal=principal,
        target=key.name,
        detail={"prefix": key.prefix, "level": str(level), "expires_days": body.expires_days},
    )

    created = models.AuthApiKeyCreated(
        key=plaintext,
        info=models.AuthApiKeyInfo.from_db(key, user.level),
    )
    return JSONResponse(status_code=CREATED, content=jsonable_encoder(created, exclude_none=True))


@router.post(
    "/{key_id}/revoke",
    name="Revoke an API key",
    description=(
        "Stop a key from authenticating while keeping it listed. Prefer this to deleting "
        "when you want the record of the key to survive."
    ),
    response_model=models.AuthApiKeyInfo,
    responses={403: {"model": models.Message}, 404: {"model": models.Message}},
)
async def revoke(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    request: Request,
    principal: Annotated[Principal, Depends(require_user())],
    key_id: int,
) -> Response:
    try:
        key = await auth_api_key_db.get_by_id(db, key_id)
    except ItemNotFoundError as exc:
        return _message(NOT_FOUND, str(exc))

    if key.user_id != principal.user_id:
        # 404 rather than 403. Answering "forbidden" would confirm that a key with this
        # ID exists and belongs to somebody else, which is more than a caller who does
        # not own it needs to know.
        return _message(NOT_FOUND, f"No API key with ID {key_id} found.")

    await auth_api_key_db.revoke(db=db, key=key)
    await record(
        request,
        AuditEvent.APIKEY_REVOKED,
        principal=principal,
        target=key.name,
        detail={"prefix": key.prefix},
    )

    user = await auth_user_db.get_by_id(db, key.user_id)
    return JSONResponse(content=jsonable_encoder(models.AuthApiKeyInfo.from_db(key, user.level), exclude_none=True))


@router.delete(
    "/{key_id}",
    name="Delete an API key",
    description="Remove a key entirely. The key stops working immediately.",
    response_model=models.Message,
    responses={403: {"model": models.Message}, 404: {"model": models.Message}},
)
async def delete(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    request: Request,
    principal: Annotated[Principal, Depends(require_user())],
    key_id: int,
) -> Response:
    try:
        key = await auth_api_key_db.get_by_id(db, key_id)
    except ItemNotFoundError as exc:
        return _message(NOT_FOUND, str(exc))

    if key.user_id != principal.user_id:
        return _message(NOT_FOUND, f"No API key with ID {key_id} found.")

    name, prefix = key.name, key.prefix
    await auth_api_key_db.delete_key(db=db, key=key)
    await record(
        request,
        AuditEvent.APIKEY_DELETED,
        principal=principal,
        target=name,
        detail={"prefix": prefix},
    )
    return JSONResponse(content={"message": "API key deleted."})

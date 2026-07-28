"""Audit log endpoint.

Read-only, and administrators only. The log records addresses, user agents and which
accounts exist, so exposing it at the ``read`` level would hand an anonymous reader a
map of the instance's users and a record of every sign-in attempt against them.

There is deliberately no way to write an entry through the API, and no way to delete
one. Entries appear as a side effect of the operations that produce them, and leave only
when the retention window in :data:`spoolman.auth.audit.RETENTION_SETTING` passes over
them. A log that its subjects can edit is not evidence of anything.
"""

# ruff: noqa: D103

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.responses import Response

from spoolman.auth.audit import AuditEvent
from spoolman.auth.dependencies import require_admin
from spoolman.auth.principal import Principal
from spoolman.database import auth_audit as auth_audit_db
from spoolman.database import auth_user as auth_user_db
from spoolman.database.database import get_db_session
from spoolman.exceptions import ItemNotFoundError

from . import models

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/auth/audit",
    tags=["auth"],
)

# Cap on a single page. The table is the one in the schema that grows without an upper
# bound, so an unbounded list endpoint over it is an easy way to exhaust memory.
MAX_LIMIT = 500
DEFAULT_LIMIT = 100


@router.get(
    "",
    name="Read the audit log",
    description=(
        "List audit entries, newest first. Administrators only. Entries cannot be "
        "created or deleted through the API; they appear as a side effect of the "
        "operations they record and expire with the retention setting."
    ),
    response_model=list[models.AuthAuditEntry],
)
async def find(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    _principal: Annotated[Principal, Depends(require_admin())],
    limit: Annotated[int, Query(ge=1, le=MAX_LIMIT, description="Maximum number of entries to return.")] = (
        DEFAULT_LIMIT
    ),
    offset: Annotated[int, Query(ge=0, description="How many entries to skip.")] = 0,
    event: Annotated[str | None, Query(description="Only return entries for this event.")] = None,
    actor_user_id: Annotated[int | None, Query(description="Only return entries by this user.")] = None,
) -> Response:
    entries, total = await auth_audit_db.find(
        db=db,
        limit=limit,
        offset=offset,
        event=event,
        actor_user_id=actor_user_id,
    )

    # Resolve the usernames in one pass rather than per row. A page of a hundred entries
    # is typically a handful of distinct actors, and the alternative is a hundred
    # queries against a database that may be a single SQLite file.
    usernames: dict[int, str] = {}
    for actor_id in {entry.actor_user_id for entry in entries if entry.actor_user_id is not None}:
        try:
            usernames[actor_id] = (await auth_user_db.get_by_id(db, actor_id)).username
        except ItemNotFoundError:
            # The account was deleted between the log write and now. The entry stays,
            # unattributed, which is the point of keeping history past its subject.
            logger.debug("Audit entry references user %d, which no longer exists.", actor_id)

    return JSONResponse(
        content=jsonable_encoder(
            [
                models.AuthAuditEntry.from_db(
                    entry,
                    usernames.get(entry.actor_user_id) if entry.actor_user_id is not None else None,
                )
                for entry in entries
            ],
            exclude_none=True,
        ),
        headers={"x-total-count": str(total)},
    )


@router.get(
    "/events",
    name="List audit event types",
    description=(
        "List every event name this server can record, so a client can offer a filter "
        "without hardcoding the vocabulary."
    ),
    response_model=list[str],
)
async def events(
    _principal: Annotated[Principal, Depends(require_admin())],
) -> Response:
    return JSONResponse(content=[str(event) for event in AuditEvent])

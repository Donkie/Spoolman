"""Tag scan relay endpoints.

Spoolman never talks to reader hardware; the reader talks to Spoolman. The reader is almost
never on the Spoolman host -- Spoolman runs in Docker on a NAS while the tag gets tapped at the
printer -- so the contract between the two is one plain HTTP POST per tap, with no auth, no
handshake, no inbound port on the device and no library. Anything that can POST JSON qualifies,
which is why Node-RED, Home Assistant, a shell script and a microcontroller are all first-class
here without Spoolman shipping code for any of them.

What the relay adds on top of a lookup is decoupling *where the reader is* from *where the user
is looking*: the scan is broadcast to browsers that subscribed to that reader, so tapping a tag
at the printer can drive a page open on a desk across the house.
"""

import asyncio
import logging
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Request, WebSocket, WebSocketDisconnect
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from spoolman.api.v1.models import EventType, Message, Spool, TagReader, TagScan, TagScanEvent
from spoolman.database import tag as tag_db
from spoolman.database.database import get_db_session
from spoolman.scanrelay import READER_ID_PATTERN, derive_reader_id, scan_relay
from spoolman.tags import FORMAT_MAX_LENGTH, KNOWN_FORMATS, UID_MAX_LENGTH, normalize_uid
from spoolman.ws import scan_websocket_manager

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/tag",
    tags=["tag"],
)

# ruff: noqa: D103

# Tag contents are carried through untouched and never decoded, so the only thing worth
# constraining is size: an unbounded payload is an unbounded websocket broadcast to every
# subscriber, from an unauthenticated endpoint.
PAYLOAD_MAX_LENGTH = 8192


class TagScanParameters(BaseModel):
    uid: str = Field(
        min_length=1,
        max_length=UID_MAX_LENGTH * 2,  # room for separators; the normalized UID is what must fit
        description=(
            "The scanned tag's UID, in whatever shape the reader reports it. Any separator style, "
            "any case: the server normalizes it, which is why an ESPHome device sending 04-a2-b3 "
            "and a phone sending 04:A2:B3 identify the same tag."
        ),
        examples=["04-A2-B3-C4-D5-E6-F7"],
    )
    reader_id: str | None = Field(
        None,
        pattern=READER_ID_PATTERN,
        description=(
            "A stable, operator-chosen id for this reader, e.g. the device hostname. Browsers "
            "subscribe by it, so it is what binds a screen to a reader. If omitted, one is derived "
            "from the client's network address, which works but breaks on DHCP churn."
        ),
        examples=["printer-voron"],
    )
    name: str | None = Field(
        None,
        max_length=64,
        description="Human-readable name for the reader, shown when choosing one.",
        examples=["Voron spool holder"],
    )
    format: str | None = Field(
        None,
        max_length=FORMAT_MAX_LENGTH,
        description=(
            "What kind of tag this is, if the agent can tell. Informational; not validated against "
            f"a fixed list. Commonly one of: {', '.join(KNOWN_FORMATS)}."
        ),
        examples=["ntag"],
    )
    payload_b64: str | None = Field(
        None,
        max_length=PAYLOAD_MAX_LENGTH,
        description=(
            "The tag's raw contents, base64-encoded, if the agent read them. Accepted and carried "
            "into the broadcast untouched; Spoolman does not decode tag contents."
        ),
    )


@router.post(
    "/scan",
    name="Report a tag scan",
    description=(
        "Report that a reader has scanned a tag. Spoolman resolves the tag to a spool and returns "
        "the match, then broadcasts the scan on the tag scan websockets so a paired browser can "
        "react to it.\n\n"
        "The response is the whole integration for a device that only wants a lookup: "
        "`matched_spool_id` is always present, null when the tag is not linked to anything. A "
        "device may ignore the response entirely.\n\n"
        "Scans are ephemeral -- broadcast only, never stored. Repeated identical scans from the "
        "same reader within a few seconds are broadcast once, because readers re-detect a tag that "
        "is sitting still; the response is unaffected, so a de-duplicated scan never looks to the "
        "device like a failed lookup."
    ),
    responses={
        200: {"model": TagScan},
        400: {"model": Message},
        299: {"model": TagScanEvent, "description": "Websocket message"},
    },
)
async def scan(
    *,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    body: TagScanParameters,
) -> JSONResponse:
    reader_id = body.reader_id or derive_reader_id(request.client.host if request.client else None)

    try:
        # Normalized here so the response can echo the canonical form back -- an agent should be
        # able to see the shape its tag is stored under without reimplementing the rules.
        # database/tag.py normalizes again on the way to the query; doing so is idempotent, and
        # that layer is what makes the guarantee hold for callers that never come through here.
        uid = normalize_uid(body.uid)
    except ValueError as e:
        return JSONResponse(status_code=400, content=Message(message=str(e)).dict())

    db_spool = await tag_db.find_spool_by_uid(db, uid)

    scan_relay.register(reader_id, body.name)

    result = TagScan(
        uid=uid,
        reader_id=reader_id,
        name=body.name,
        format=body.format,
        payload_b64=body.payload_b64,
        matched_spool_id=db_spool.id if db_spool is not None else None,
        spool=Spool.from_db(db_spool) if db_spool is not None else None,
    )

    if scan_relay.should_broadcast(uid, reader_id):
        await _broadcast(result)

    content = jsonable_encoder(result, exclude_none=True)
    # exclude_none strips a null match, but "no match" is the answer to the device's question
    # and it has to be able to see it. Everything else may be omitted.
    content.setdefault("matched_spool_id", None)
    return JSONResponse(content=content)


async def _broadcast(result: TagScan) -> None:
    """Broadcast a scan to the reader's pool, and to anyone following every reader."""
    try:
        await scan_websocket_manager.send(
            (result.reader_id,),
            TagScanEvent(
                type=EventType.SCANNED,
                resource="tag_scan",
                date=datetime.utcnow(),
                payload=result,
            ),
        )
    except Exception:
        # Same reasoning as spool_changed: a websocket failure must never fail the request
        # that triggered it.
        logger.exception("Failed to send websocket message")


@router.get(
    "/reader",
    name="List recently seen tag readers",
    description=(
        "List the readers that have reported a scan recently, so a client can offer a "
        "'choose a reader' picker instead of asking someone to type an id.\n\n"
        "The registry is in-memory and never persisted: it is empty after a restart, and a "
        "reader reappears the moment it scans again."
    ),
    response_model_exclude_none=True,
)
async def readers() -> list[TagReader]:
    return [
        TagReader(reader_id=reader.reader_id, name=reader.name, last_seen=reader.last_seen)
        for reader in scan_relay.readers()
    ]


@router.websocket(
    "/scan",
    name="Listen to tag scans from any reader",
)
async def notify_any(
    websocket: WebSocket,
) -> None:
    await websocket.accept()
    scan_websocket_manager.connect((), websocket)
    try:
        while True:
            await asyncio.sleep(0.5)
            if await websocket.receive_text():
                await websocket.send_json({"status": "healthy"})
    except WebSocketDisconnect:
        scan_websocket_manager.disconnect((), websocket)


@router.websocket(
    "/scan/{reader_id}",
    name="Listen to tag scans from one reader",
)
async def notify(
    websocket: WebSocket,
    reader_id: str,
) -> None:
    await websocket.accept()
    scan_websocket_manager.connect((reader_id,), websocket)
    try:
        while True:
            await asyncio.sleep(0.5)
            if await websocket.receive_text():
                await websocket.send_json({"status": "healthy"})
    except WebSocketDisconnect:
        scan_websocket_manager.disconnect((reader_id,), websocket)

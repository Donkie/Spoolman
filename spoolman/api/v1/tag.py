"""Tag scan relay endpoints."""

import asyncio
import base64
import binascii
import logging
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Request, WebSocket, WebSocketDisconnect
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from spoolman import tag_decode
from spoolman.api.v1.models import EventType, Message, Spool, TagDecodedInfo, TagReader, TagScan, TagScanEvent
from spoolman.database import tag as tag_db
from spoolman.database.database import get_db_session
from spoolman.exceptions import ItemCreateError, TagConflictError
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
            "The scanned tag's UID, case insensitive. Separators can be included if desired but are not necessary."
        ),
        examples=["04-A2-B3-C4-D5-E6-F7", "04a2b3c4d5e6f7"],
    )
    reader_id: str | None = Field(
        None,
        pattern=READER_ID_PATTERN,
        description=(
            "A stable, operator-chosen id for this reader, e.g. the device hostname. Browsers "
            "subscribe by it, so it is what binds a screen to a reader. If omitted, one is derived "
            "from the client's network address."
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
            "into the broadcast untouched. If `format` names a format Spoolman knows how to read, "
            "it is also decoded server-side and returned in `decoded`."
        ),
    )
    create: bool = Field(
        default=False,
        description=(
            "If the tag is not linked to anything and its contents decode successfully, create a "
            "spool from the decoded contents and link this tag to it. Off by default -- a plain scan "
            "never creates anything. Never overwrites or relinks an already-matched tag."
        ),
        examples=[False],
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
        "device like a failed lookup. A scan that resolves to a different spool than the last one "
        "-- because the tag has just been linked, unlinked, or moved -- is never de-duplicated, so "
        "an agent that links a tag can re-report the scan and have the correction go out at once.\n\n"
        "If `format` and `payload_b64` are given and Spoolman knows how to read that format, the "
        "payload is also decoded and returned in `decoded` -- see its own description for what is, "
        "and is not, done with it automatically. Setting `create: true` additionally allows an "
        "unmatched tag to create and link a spool from that decoded data (see `create`'s "
        "description)."
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

    decoded = _decode_payload(body.format, body.payload_b64, uid)

    created = False
    if db_spool is None and body.create and decoded is not None:
        try:
            db_spool = await tag_db.create_spool_from_decoded_tag(
                db=db,
                uid=uid,
                tag_format=body.format,
                decoded=decoded,
            )
            created = True
        except TagConflictError:
            # Lost a race with a concurrent scan of the same tag; report the winner as an
            # ordinary match rather than surfacing a conflict for a create nobody asked to see.
            db_spool = await tag_db.find_spool_by_uid(db, uid)
        except ItemCreateError:
            logger.exception("Failed to auto-create a spool from decoded tag %s", uid)

    scan_relay.register(reader_id, body.name)

    result = TagScan(
        uid=uid,
        reader_id=reader_id,
        name=body.name,
        format=body.format,
        payload_b64=body.payload_b64,
        matched_spool_id=db_spool.id if db_spool is not None else None,
        spool=Spool.from_db(db_spool) if db_spool is not None else None,
        decoded=_decoded_response(decoded),
        created=created,
    )

    if scan_relay.should_broadcast(uid, reader_id, result.matched_spool_id):
        await _broadcast(result)

    content = jsonable_encoder(result, exclude_none=True)
    # exclude_none strips a null match, but "no match" is the answer to the device's question
    # and it has to be able to see it. Everything else may be omitted.
    content.setdefault("matched_spool_id", None)
    return JSONResponse(content=content)


def _decode_payload(tag_format: str | None, payload_b64: str | None, uid: str) -> tag_decode.DecodedTag | None:
    """Decode a scan's payload, if both a format and a payload were given.

    Soft-fails on everything: a missing field, invalid base64, an unknown format or an
    unparseable payload for a known one all return None. Decoding is enrichment of a scan,
    never a reason to fail one -- see the class docstring on TagDecodedInfo.
    """
    if tag_format is None or payload_b64 is None:
        return None
    try:
        raw = base64.b64decode(payload_b64, validate=True)
    except binascii.Error:
        return None
    return tag_decode.decode(tag_format, raw, uid_bytes=bytes.fromhex(uid))


def _decoded_response(decoded: tag_decode.DecodedTag | None) -> TagDecodedInfo | None:
    if decoded is None:
        return None
    return TagDecodedInfo(
        material_type=decoded.material_type,
        material_name=decoded.material_name,
        brand_name=decoded.brand_name,
        color_hex=decoded.color_hex,
        diameter_mm=decoded.diameter_mm,
        density_g_cm3=decoded.density_g_cm3,
        net_weight_g=decoded.net_weight_g,
        empty_container_weight_g=decoded.empty_container_weight_g,
        consumed_weight_g=decoded.consumed_weight_g,
        external_id=decoded.external_id,
    )


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

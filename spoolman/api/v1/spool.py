"""Spool related endpoints."""

import asyncio
import logging
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query, Request, Response, WebSocket, WebSocketDisconnect
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.datastructures import QueryParams

from spoolman.api.v1.models import (
    Filament,
    Message,
    Spool,
    SpoolEvent,
    SpoolGroup,
    SpoolTag,
    TagConflictMessage,
    Vendor,
    extra_fields_request_description,
)

# Aliased: `tag` is taken by the find endpoint's query parameter, whose name is API surface.
from spoolman.database import spool
from spoolman.database import tag as tag_db
from spoolman.database.database import get_db_session
from spoolman.database.utils import parse_sort
from spoolman.exceptions import ItemCreateError, SpoolMeasureError, TagConflictError
from spoolman.extra_fields import EntityType, get_extra_fields, validate_extra_field_dict
from spoolman.tags import FORMAT_MAX_LENGTH, KNOWN_FORMATS, UID_MAX_LENGTH
from spoolman.ws import websocket_manager

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/spool",
    tags=["spool"],
)

# ruff: noqa: D103


# Query-param prefixes for extra-field filters, longest first so the most specific one wins.
_EXTRA_FILTER_PREFIXES = (
    ("filament.vendor.extra.", "vendor"),
    ("filament.extra.", "filament"),
    ("extra.", "spool"),
)


def _parse_extra_field_filters(
    query_params: QueryParams,
) -> tuple[dict[str, str], dict[str, str], dict[str, str]]:
    """Split extra-field filter query params into (spool, filament, vendor) dicts keyed by field key."""
    buckets: dict[str, dict[str, str]] = {"spool": {}, "filament": {}, "vendor": {}}
    for key, value in query_params.items():
        for prefix, entity in _EXTRA_FILTER_PREFIXES:
            if key.startswith(prefix):
                buckets[entity][key[len(prefix) :]] = value
                break
    return buckets["spool"], buckets["filament"], buckets["vendor"]


def _date_query(field: str, title: str) -> Query:
    """Build the Query() for a datetime filter on `field`.

    Deliberately one parameter per field taking a range, rather than a pair of `_after`/`_before`
    parameters: this is the same value grammar the extra-field datetime filters have used since
    v0.26.0, so a built-in timestamp and a custom one are filtered identically, and a new
    filterable column costs one parameter instead of three.
    """
    return Query(
        title=title,
        description=(
            f"Filter by the spool's {field} timestamp. Give an inclusive range as "
            f"`<start>|<end>` (ISO 8601; either end may be omitted to leave it open), a bare "
            f"timestamp to match it exactly, or an empty string to match spools that have no "
            f"{field} timestamp at all. Separate multiple of these with a comma to OR them. A "
            "timestamp with no UTC offset is interpreted as UTC."
        ),
        examples=[
            "2024-05-01T00:00:00Z|",
            "|2024-05-01T00:00:00Z",
            "2024-05-01T00:00:00Z|2024-06-01T00:00:00Z",
            "",
        ],
    )


# The date filters, shared verbatim by the spool search and the group endpoints so the two accept
# exactly the same query.
FirstUsedFilter = Annotated[str | None, _date_query("first_used", "First Used")]
LastUsedFilter = Annotated[str | None, _date_query("last_used", "Last Used")]
RegisteredFilter = Annotated[str | None, _date_query("registered", "Registered")]


class SpoolParameters(BaseModel):
    first_used: datetime | None = Field(None, description="First logged occurence of spool usage.")
    last_used: datetime | None = Field(None, description="Last logged occurence of spool usage.")
    filament_id: int = Field(description="The ID of the filament type of this spool.")
    price: float | None = Field(
        None,
        ge=0,
        description="The price of this filament in the system configured currency.",
        examples=[20.0],
    )
    initial_weight: float | None = Field(
        None,
        ge=0,
        description="The initial weight of the filament on the spool, in grams. (net weight)",
        examples=[200],
    )
    spool_weight: float | None = Field(
        None,
        ge=0,
        description="The weight of an empty spool, in grams. (tare weight)",
        examples=[200],
    )
    remaining_weight: float | None = Field(
        None,
        ge=0,
        description=(
            "Remaining weight of filament on the spool. Can only be used if the filament type has a weight set."
        ),
        examples=[800],
    )
    used_weight: float | None = Field(
        None,
        ge=0,
        description="Used weight of filament on the spool.",
        examples=[200],
    )
    location: str | None = Field(
        None,
        max_length=64,
        description="Where this spool can be found.",
        examples=["Shelf A"],
    )
    lot_nr: str | None = Field(
        None,
        max_length=64,
        description="Vendor manufacturing lot/batch number of the spool.",
        examples=["52342"],
    )
    comment: str | None = Field(
        None,
        max_length=1024,
        description="Free text comment about this specific spool.",
        examples=[""],
    )
    archived: bool = Field(default=False, description="Whether this spool is archived and should not be used anymore.")
    extra: dict[str, str | None] | None = Field(
        None,
        description=extra_fields_request_description("spool"),
    )


class SpoolUpdateParameters(SpoolParameters):
    filament_id: int | None = Field(None, description="The ID of the filament type of this spool.")

    @field_validator("filament_id")
    @classmethod
    def prevent_none(cls: type["SpoolUpdateParameters"], v: int | None) -> int | None:
        """Prevent filament_id from being None."""
        if v is None:
            raise ValueError("Value must not be None.")
        return v


class SpoolUseParameters(BaseModel):
    use_length: float | None = Field(None, description="Length of filament to reduce by, in mm.", examples=[2.2])
    use_weight: float | None = Field(None, description="Filament weight to reduce by, in g.", examples=[5.3])


class SpoolMeasureParameters(BaseModel):
    weight: float = Field(description="Current gross weight of the spool, in g.", examples=[200])


@router.get(
    "",
    name="Find spool",
    description=(
        "Get a list of spools that matches the search query. "
        "A websocket is served on the same path to listen for updates to any spool, or added or deleted spools. "
        "See the HTTP Response code 299 for the content of the websocket messages."
    ),
    response_model_exclude_none=True,
    responses={
        200: {"model": list[Spool]},
        299: {"model": SpoolEvent, "description": "Websocket message"},
    },
)
async def find(
    *,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    filament_name_old: Annotated[
        str | None,
        Query(alias="filament_name", title="Filament Name", description="See filament.name.", deprecated=True),
    ] = None,
    filament_id_old: Annotated[
        str | None,
        Query(
            alias="filament_id",
            title="Filament ID",
            description="See filament.id.",
            deprecated=True,
            pattern=r"^-?\d+(,-?\d+)*$",
        ),
    ] = None,
    filament_material_old: Annotated[
        str | None,
        Query(
            alias="filament_material",
            title="Filament Material",
            description="See filament.material.",
            deprecated=True,
        ),
    ] = None,
    vendor_name_old: Annotated[
        str | None,
        Query(alias="vendor_name", title="Vendor Name", description="See filament.vendor.name.", deprecated=True),
    ] = None,
    vendor_id_old: Annotated[
        str | None,
        Query(
            alias="vendor_id",
            title="Vendor ID",
            description="See filament.vendor.id.",
            deprecated=True,
            pattern=r"^-?\d+(,-?\d+)*$",
        ),
    ] = None,
    filament_name: Annotated[
        str | None,
        Query(
            alias="filament.name",
            title="Filament Name",
            description=(
                "Partial case-insensitive search term for the filament name. Separate multiple terms with a comma. "
                "Specify an empty string to match spools with no filament name. "
                "Surround a term with quotes to search for the exact term."
            ),
        ),
    ] = None,
    filament_id: Annotated[
        str | None,
        Query(
            alias="filament.id",
            title="Filament ID",
            description="Match an exact filament ID. Separate multiple IDs with a comma.",
            examples=["1", "1,2"],
            pattern=r"^-?\d+(,-?\d+)*$",
        ),
    ] = None,
    filament_material: Annotated[
        str | None,
        Query(
            alias="filament.material",
            title="Filament Material",
            description=(
                "Partial case-insensitive search term for the filament material. Separate multiple terms with a comma. "
                "Specify an empty string to match spools with no filament material. "
                "Surround a term with quotes to search for the exact term."
            ),
        ),
    ] = None,
    filament_multi_color_direction: Annotated[
        str | None,
        Query(
            alias="filament.multi_color_direction",
            title="Filament Multi-Color Direction",
            description=(
                "Match spools by their filament's multi-color direction, e.g. coaxial or longitudinal. "
                "Separate multiple terms with a comma. Specify an empty string to match single-color filaments. "
                "Surround a term with quotes to search for the exact term."
            ),
            examples=['"coaxial"', '"longitudinal"'],
        ),
    ] = None,
    filament_vendor_name: Annotated[
        str | None,
        Query(
            alias="filament.vendor.name",
            title="Vendor Name",
            description=(
                "Partial case-insensitive search term for the filament vendor name. "
                "Separate multiple terms with a comma. "
                "Specify an empty string to match spools with no vendor name. "
                "Surround a term with quotes to search for the exact term."
            ),
        ),
    ] = None,
    filament_vendor_id: Annotated[
        str | None,
        Query(
            alias="filament.vendor.id",
            title="Vendor ID",
            description=(
                "Match an exact vendor ID. Separate multiple IDs with a comma. "
                "Set it to -1 to match spools with filaments with no vendor."
            ),
            examples=["1", "1,2"],
            pattern=r"^-?\d+(,-?\d+)*$",
        ),
    ] = None,
    location: Annotated[
        str | None,
        Query(
            title="Location",
            description=(
                "Partial case-insensitive search term for the spool location. Separate multiple terms with a comma. "
                "Specify an empty string to match spools with no location. "
                "Surround a term with quotes to search for the exact term."
            ),
        ),
    ] = None,
    lot_nr: Annotated[
        str | None,
        Query(
            title="Lot/Batch Number",
            description=(
                "Partial case-insensitive search term for the spool lot number. Separate multiple terms with a comma. "
                "Specify an empty string to match spools with no lot nr. "
                "Surround a term with quotes to search for the exact term."
            ),
        ),
    ] = None,
    tag: Annotated[
        str | None,
        Query(
            title="Tag UID",
            description=(
                "Match the spool that an NFC/RFID tag with this UID is linked to. Exact match on the "
                "normalized UID: separators are ignored and case does not matter, so 04:a2:b3:c4, "
                "04-A2-B3-C4 and 04a2b3c4 all find the same spool. A tag is linked to at most one "
                "spool, so this returns either one spool or none. Returns 400 if the UID is not "
                "hexadecimal."
            ),
            examples=["04A2B3C4D5E6F7", "04:a2:b3:c4:d5:e6:f7"],
        ),
    ] = None,
    allow_archived: Annotated[
        bool,
        Query(title="Allow Archived", description="Whether to include archived spools in the search results."),
    ] = False,
    first_used: FirstUsedFilter = None,
    last_used: LastUsedFilter = None,
    registered: RegisteredFilter = None,
    sort: Annotated[
        str | None,
        Query(
            title="Sort",
            description=(
                'Sort the results by the given field. Should be a comma-separate string with "field:direction" items.'
            ),
            examples=["filament.name:asc,filament.vendor.id:asc,location:desc"],
        ),
    ] = None,
    limit: Annotated[
        int | None,
        Query(title="Limit", description="Maximum number of items in the response."),
    ] = None,
    offset: Annotated[int, Query(title="Offset", description="Offset in the full result set if a limit is set.")] = 0,
) -> JSONResponse:
    try:
        sort_by = parse_sort(sort)
    except ValueError as e:
        return JSONResponse(status_code=400, content=Message(message=str(e)).dict())

    filament_id = filament_id if filament_id is not None else filament_id_old
    if filament_id is not None:
        filament_ids = [int(filament_id_item) for filament_id_item in filament_id.split(",")]
    else:
        filament_ids = None

    filament_vendor_id = filament_vendor_id if filament_vendor_id is not None else vendor_id_old
    if filament_vendor_id is not None:
        filament_vendor_ids = [int(vendor_id_item) for vendor_id_item in filament_vendor_id.split(",")]
    else:
        filament_vendor_ids = None

    # Extract custom field filters from query parameters. Spool extra fields use `extra.<key>`;
    # a filament's extra fields use `filament.extra.<key>` and its vendor's `filament.vendor.extra.<key>`.
    spool_extra, filament_extra, vendor_extra = _parse_extra_field_filters(request.query_params)

    try:
        db_items, total_count = await spool.find(
            db=db,
            filament_name=filament_name if filament_name is not None else filament_name_old,
            filament_id=filament_ids,
            filament_material=filament_material if filament_material is not None else filament_material_old,
            filament_multi_color_direction=filament_multi_color_direction,
            vendor_name=filament_vendor_name if filament_vendor_name is not None else vendor_name_old,
            vendor_id=filament_vendor_ids,
            location=location,
            lot_nr=lot_nr,
            tag=tag,
            allow_archived=allow_archived,
            first_used=first_used,
            last_used=last_used,
            registered=registered,
            extra_field_filters=spool_extra or None,
            filament_extra_field_filters=filament_extra or None,
            vendor_extra_field_filters=vendor_extra or None,
            sort_by=sort_by,
            limit=limit,
            offset=offset,
        )
    except ValueError as e:
        return JSONResponse(status_code=400, content=Message(message=str(e)).dict())

    # Set x-total-count header for pagination
    return JSONResponse(
        content=jsonable_encoder(
            (Spool.from_db(db_item) for db_item in db_items),
            exclude_none=True,
        ),
        headers={"x-total-count": str(total_count)},
    )


@router.websocket(
    "",
    name="Listen to spool changes",
)
async def notify_any(
    websocket: WebSocket,
) -> None:
    await websocket.accept()
    websocket_manager.connect(("spool",), websocket)
    try:
        while True:
            await asyncio.sleep(0.5)
            if await websocket.receive_text():
                await websocket.send_json({"status": "healthy"})
    except WebSocketDisconnect:
        websocket_manager.disconnect(("spool",), websocket)


@router.get(
    "/group",
    name="Find spool groups",
    description=(
        "Group spools that match the search query by one axis (filament, vendor, material, "
        "location, or a spool extra field) and return per-group aggregates: spool count, "
        "in-use count, total remaining weight and most recent usage. Pagination is over groups, so "
        "a group is never split and its aggregates are always complete. Uses the same filters as "
        "the spool search endpoint. The total number of matching groups is returned in the "
        "x-total-count header."
    ),
    response_model_exclude_none=True,
    responses={
        200: {"model": list[SpoolGroup]},
        400: {"model": Message},
    },
)
async def find_groups(
    *,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    group_by: Annotated[
        str,
        Query(
            title="Group By",
            description=(
                "The field to group spools by: filament, vendor, material, location, or extra.<key> "
                "for one of the spool's custom fields (text and single-choice fields only)."
            ),
            examples=["location", "extra.shelf"],
        ),
    ],
    filament_name: Annotated[
        str | None,
        Query(
            alias="filament.name",
            title="Filament Name",
            description="Partial case-insensitive search term for the filament name. See the spool search endpoint.",
        ),
    ] = None,
    filament_id: Annotated[
        str | None,
        Query(
            alias="filament.id",
            title="Filament ID",
            description="Match an exact filament ID. Separate multiple IDs with a comma.",
            pattern=r"^-?\d+(,-?\d+)*$",
        ),
    ] = None,
    filament_material: Annotated[
        str | None,
        Query(
            alias="filament.material",
            title="Filament Material",
            description="Partial case-insensitive search term for the filament material.",
        ),
    ] = None,
    filament_multi_color_direction: Annotated[
        str | None,
        Query(
            alias="filament.multi_color_direction",
            title="Filament Multi-Color Direction",
            description=(
                "Match by the filament's multi-color direction, e.g. coaxial or longitudinal. "
                "Specify an empty string to match single-color filaments."
            ),
            examples=['"coaxial"', '"longitudinal"'],
        ),
    ] = None,
    filament_vendor_name: Annotated[
        str | None,
        Query(
            alias="filament.vendor.name",
            title="Vendor Name",
            description="Partial case-insensitive search term for the filament vendor name.",
        ),
    ] = None,
    filament_vendor_id: Annotated[
        str | None,
        Query(
            alias="filament.vendor.id",
            title="Vendor ID",
            description=(
                "Match an exact vendor ID. Separate multiple IDs with a comma. "
                "Set it to -1 to match spools with filaments with no vendor."
            ),
            pattern=r"^-?\d+(,-?\d+)*$",
        ),
    ] = None,
    location: Annotated[
        str | None,
        Query(title="Location", description="Partial case-insensitive search term for the spool location."),
    ] = None,
    lot_nr: Annotated[
        str | None,
        Query(title="Lot/Batch Number", description="Partial case-insensitive search term for the spool lot number."),
    ] = None,
    allow_archived: Annotated[
        bool,
        Query(title="Allow Archived", description="Whether to include archived spools in the aggregates."),
    ] = False,
    first_used: FirstUsedFilter = None,
    last_used: LastUsedFilter = None,
    registered: RegisteredFilter = None,
    sort: Annotated[
        str | None,
        Query(
            title="Sort",
            description=(
                'Sort the groups by the given field. Comma-separated "field:direction" items. '
                "Available fields: group.title, group.total_remaining, group.last_used, "
                "group.spool_count, group.in_use_count."
            ),
            examples=["group.last_used:desc"],
        ),
    ] = None,
    limit: Annotated[
        int | None,
        Query(title="Limit", description="Maximum number of groups in the response."),
    ] = None,
    offset: Annotated[
        int,
        Query(title="Offset", description="Offset in the full group result set if a limit is set."),
    ] = 0,
) -> JSONResponse:
    try:
        sort_by = parse_sort(sort)
    except ValueError as e:
        return JSONResponse(status_code=400, content=Message(message=str(e)).dict())

    filament_ids = [int(item) for item in filament_id.split(",")] if filament_id is not None else None
    vendor_ids = [int(item) for item in filament_vendor_id.split(",")] if filament_vendor_id is not None else None

    spool_extra, filament_extra, vendor_extra = _parse_extra_field_filters(request.query_params)

    try:
        groups, total_count = await spool.find_groups(
            db=db,
            group_by=group_by,
            filament_name=filament_name,
            filament_id=filament_ids,
            filament_material=filament_material,
            filament_multi_color_direction=filament_multi_color_direction,
            vendor_name=filament_vendor_name,
            vendor_id=vendor_ids,
            location=location,
            lot_nr=lot_nr,
            allow_archived=allow_archived,
            first_used=first_used,
            last_used=last_used,
            registered=registered,
            extra_field_filters=spool_extra or None,
            filament_extra_field_filters=filament_extra or None,
            vendor_extra_field_filters=vendor_extra or None,
            sort_by=sort_by,
            limit=limit,
            offset=offset,
        )
    except ValueError as e:
        return JSONResponse(status_code=400, content=Message(message=str(e)).dict())

    content = [
        SpoolGroup(
            group_by=group_by,
            key=None if group.key is None else str(group.key),
            spool_count=group.spool_count,
            in_use_count=group.in_use_count,
            total_remaining_weight=group.total_remaining_weight,
            last_used=group.last_used,
            filament=Filament.from_db(group.filament) if group.filament is not None else None,
            vendor=Vendor.from_db(group.vendor) if group.vendor is not None else None,
        )
        for group in groups
    ]
    return JSONResponse(
        content=jsonable_encoder(content, exclude_none=True),
        headers={"x-total-count": str(total_count)},
    )


class RenameFieldValueParameters(BaseModel):
    value: str = Field(min_length=1, description="The value to replace.", examples=["Shelf A"])
    new_value: str = Field(min_length=1, description="The value to replace it with.", examples=["Shelf B"])


class RenameFieldValueResult(BaseModel):
    spools_updated: int = Field(description="How many spools held the old value.", examples=[6])


@router.patch(
    "/field/{field}",
    name="Rename a spool field value",
    description=(
        "Replace one value of one spool field wherever it occurs. The general form of the "
        "location rename endpoint: it lets a client rename, in a single request, a value shared "
        "by any number of spools -- including ones it has not loaded. Archived spools are "
        "included, so no spool is left holding the old value. Renaming onto a value that is "
        "already in use merges the two. No websocket event is emitted per spool; other clients "
        "see the change on their next load."
    ),
    response_model_exclude_none=True,
    responses={200: {"model": RenameFieldValueResult}, 400: {"model": Message}},
)
async def rename_field_value(
    *,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    field: Annotated[
        str,
        Path(
            title="Field",
            description=(
                "The spool field to rename a value of: location, or extra.<key> for one of the "
                "spool's custom text or single-choice fields. Fields belonging to the filament "
                "or its vendor (material, vendor) cannot be renamed here."
            ),
            examples=["location", "extra.shelf"],
        ),
    ],
    body: RenameFieldValueParameters,
) -> JSONResponse:
    logger.info('Renaming spool %s "%s" to "%s"', field, body.value, body.new_value)
    try:
        updated = await spool.rename_field_value(
            db=db,
            field=field,
            value=body.value,
            new_value=body.new_value,
        )
    except ValueError as e:
        return JSONResponse(status_code=400, content=Message(message=str(e)).dict())
    return JSONResponse(content=jsonable_encoder(RenameFieldValueResult(spools_updated=updated)))


@router.get(
    "/{spool_id}",
    name="Get spool",
    description=(
        "Get a specific spool. A websocket is served on the same path to listen for changes to the spool. "
        "See the HTTP Response code 299 for the content of the websocket messages."
    ),
    response_model_exclude_none=True,
    responses={404: {"model": Message}, 299: {"model": SpoolEvent, "description": "Websocket message"}},
)
async def get(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    spool_id: int,
) -> Spool:
    db_item = await spool.get_by_id(db, spool_id)
    return Spool.from_db(db_item)


@router.websocket(
    "/{spool_id}",
    name="Listen to spool changes",
)
async def notify(
    websocket: WebSocket,
    spool_id: int,
) -> None:
    await websocket.accept()
    websocket_manager.connect(("spool", str(spool_id)), websocket)
    try:
        while True:
            await asyncio.sleep(0.5)
            if await websocket.receive_text():
                await websocket.send_json({"status": "healthy"})
    except WebSocketDisconnect:
        websocket_manager.disconnect(("spool", str(spool_id)), websocket)


@router.post(
    "",
    name="Add spool",
    description=(
        "Add a new spool to the database. "
        "Only specify either remaining_weight or used_weight. "
        "If no weight is set, the spool will be assumed to be full."
    ),
    response_model_exclude_none=True,
    response_model=Spool,
    responses={
        400: {"model": Message},
    },
)
async def create(  # noqa: ANN201
    db: Annotated[AsyncSession, Depends(get_db_session)],
    body: SpoolParameters,
):
    if body.remaining_weight is not None and body.used_weight is not None:
        return JSONResponse(
            status_code=400,
            content={"message": "Only specify either remaining_weight or used_weight."},
        )

    if body.extra:
        all_fields = await get_extra_fields(db, EntityType.spool)
        try:
            validate_extra_field_dict(all_fields, body.extra)
        except ValueError as e:
            return JSONResponse(status_code=400, content=Message(message=str(e)).dict())

    try:
        db_item = await spool.create(
            db=db,
            filament_id=body.filament_id,
            price=body.price,
            initial_weight=body.initial_weight,
            spool_weight=body.spool_weight,
            remaining_weight=body.remaining_weight,
            used_weight=body.used_weight,
            first_used=body.first_used,
            last_used=body.last_used,
            location=body.location,
            lot_nr=body.lot_nr,
            comment=body.comment,
            archived=body.archived,
            extra=body.extra,
        )
        return Spool.from_db(db_item)
    except ItemCreateError:
        logger.exception("Failed to create spool.")
        return JSONResponse(
            status_code=400,
            content={"message": "Failed to create spool, see server logs for more information."},
        )


@router.patch(
    "/{spool_id}",
    name="Update spool",
    description=(
        "Update any attribute of a spool. "
        "Only fields specified in the request will be affected. "
        "remaining_weight and used_weight can't be set at the same time. "
        "If extra is set, all existing extra fields will be removed and replaced with the new ones."
    ),
    response_model_exclude_none=True,
    response_model=Spool,
    responses={
        400: {"model": Message},
        404: {"model": Message},
    },
)
async def update(  # noqa: ANN201
    db: Annotated[AsyncSession, Depends(get_db_session)],
    spool_id: int,
    body: SpoolUpdateParameters,
):
    patch_data = body.model_dump(exclude_unset=True)

    if body.remaining_weight is not None and body.used_weight is not None:
        return JSONResponse(
            status_code=400,
            content={"message": "Only specify either remaining_weight or used_weight."},
        )

    if body.extra:
        all_fields = await get_extra_fields(db, EntityType.spool)
        try:
            validate_extra_field_dict(all_fields, body.extra)
        except ValueError as e:
            return JSONResponse(status_code=400, content=Message(message=str(e)).dict())

    try:
        db_item = await spool.update(
            db=db,
            spool_id=spool_id,
            data=patch_data,
        )
    except ItemCreateError:
        logger.exception("Failed to update spool.")
        return JSONResponse(
            status_code=400,
            content={"message": "Failed to update spool, see server logs for more information."},
        )

    return Spool.from_db(db_item)


@router.delete(
    "/{spool_id}",
    name="Delete spool",
    description="Delete a spool.",
    responses={404: {"model": Message}},
)
async def delete(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    spool_id: int,
) -> Message:
    await spool.delete(db, spool_id)
    return Message(message="Success!")


class SpoolTagParameters(BaseModel):
    uid: str = Field(
        min_length=1,
        max_length=UID_MAX_LENGTH * 2,  # room for separators; the normalized UID is what must fit
        description=(
            "The tag's hardware UID, in whatever shape the reader reports it. Separators (:, -, _, "
            "spaces) are stripped and the result is uppercased before storing, so every spelling of "
            "one physical tag resolves to the same tag."
        ),
        examples=["04:a2:b3:c4:d5:e6:f7", "04A2B3C4D5E6F7"],
    )
    format: str | None = Field(
        None,
        max_length=FORMAT_MAX_LENGTH,
        description=(
            "What kind of tag this is. Informational; not validated against a fixed list, because new "
            f"tag types appear faster than releases do. Commonly one of: {', '.join(KNOWN_FORMATS)}."
        ),
        examples=["ntag"],
    )


@router.post(
    "/{spool_id}/tag",
    name="Link a tag to a spool",
    description=(
        "Link a physical NFC/RFID tag to this spool, so that the tag's UID identifies it. "
        "A tag belongs to exactly one spool; linking a UID that another spool already holds "
        "returns 409 with that spool's id, so a client can offer to move it instead. "
        "Re-linking a tag to the spool that already holds it succeeds and changes nothing, "
        "except that a format sent now refines one recorded earlier."
    ),
    status_code=201,
    response_model_exclude_none=True,
    response_model=SpoolTag,
    responses={
        400: {"model": Message},
        404: {"model": Message},
        409: {"model": TagConflictMessage},
    },
)
async def link_tag(  # noqa: ANN201
    db: Annotated[AsyncSession, Depends(get_db_session)],
    spool_id: int,
    body: SpoolTagParameters,
):
    try:
        db_item = await tag_db.link(db=db, spool_id=spool_id, uid=body.uid, tag_format=body.format)
    except ValueError as e:
        return JSONResponse(status_code=400, content=Message(message=str(e)).dict())
    except TagConflictError as e:
        return JSONResponse(
            status_code=409,
            content=TagConflictMessage(message=str(e), spool_id=e.spool_id).dict(),
        )
    return SpoolTag.from_db(db_item)


@router.delete(
    "/{spool_id}/tag/{uid}",
    name="Unlink a tag from a spool",
    description=(
        "Unlink a physical NFC/RFID tag from this spool. The UID is matched the same way it is "
        "stored: separators are ignored and case does not matter. Deleting a spool unlinks its "
        "tags on its own, so this is only for taking one tag off a spool that keeps existing."
    ),
    status_code=204,
    responses={400: {"model": Message}, 404: {"model": Message}},
)
async def unlink_tag(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    spool_id: int,
    uid: Annotated[
        str,
        Path(
            title="Tag UID",
            description="The tag's UID, in any shape. Normalized before matching.",
            examples=["04A2B3C4D5E6F7"],
        ),
    ],
) -> Response:
    try:
        await tag_db.unlink(db=db, spool_id=spool_id, uid=uid)
    except ValueError as e:
        return JSONResponse(status_code=400, content=Message(message=str(e)).dict())
    return Response(status_code=204)


@router.put(
    "/{spool_id}/use",
    name="Use spool filament",
    description=(
        "Use some length or weight of filament from the spool. Specify either a length or a weight, not both."
    ),
    response_model_exclude_none=True,
    response_model=Spool,
    responses={
        400: {"model": Message},
        404: {"model": Message},
    },
)
async def use(  # noqa: ANN201
    db: Annotated[AsyncSession, Depends(get_db_session)],
    spool_id: int,
    body: SpoolUseParameters,
):
    if body.use_weight is not None and body.use_length is not None:
        return JSONResponse(
            status_code=400,
            content={"message": "Only specify either use_weight or use_length."},
        )

    if body.use_weight is not None:
        db_item = await spool.use_weight(db, spool_id, body.use_weight)
        return Spool.from_db(db_item)

    if body.use_length is not None:
        db_item = await spool.use_length(db, spool_id, body.use_length)
        return Spool.from_db(db_item)

    return JSONResponse(
        status_code=400,
        content={"message": "Either use_weight or use_length must be specified."},
    )


@router.put(
    "/{spool_id}/measure",
    name="Use spool filament based on the current weight measurement",
    description=("Use some weight of filament from the spool. Specify the current gross weight of the spool."),
    response_model_exclude_none=True,
    response_model=Spool,
    responses={
        400: {"model": Message},
        404: {"model": Message},
    },
)
async def measure(  # noqa: ANN201
    db: Annotated[AsyncSession, Depends(get_db_session)],
    spool_id: int,
    body: SpoolMeasureParameters,
):
    try:
        db_item = await spool.measure(db, spool_id, body.weight)
        return Spool.from_db(db_item)
    except SpoolMeasureError as e:
        logger.exception("Failed to update spool measurement.")
        return JSONResponse(
            status_code=400,
            content={"message": e.args[0]},
        )

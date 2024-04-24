"""Spool related endpoints."""

import asyncio
import logging
from datetime import datetime
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from pydantic.error_wrappers import ErrorWrapper
from sqlalchemy.ext.asyncio import AsyncSession

from spoolman.api.v1.models import Message, Spool, SpoolEvent
from spoolman.database import spool
from spoolman.database.database import get_db_session
from spoolman.database.utils import SortOrder
from spoolman.exceptions import ItemCreateError, SpoolMeasureError
from spoolman.extra_fields import EntityType, get_extra_fields, validate_extra_field_dict
from spoolman.ws import websocket_manager

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/spool",
    tags=["spool"],
)

# ruff: noqa: D103,B008


class SpoolParameters(BaseModel):
    first_used: Optional[datetime] = Field(description="First logged occurence of spool usage.")
    last_used: Optional[datetime] = Field(description="Last logged occurence of spool usage.")
    filament_id: int = Field(description="The ID of the filament type of this spool.")
    price: Optional[float] = Field(
        ge=0,
        description="The price of this filament in the system configured currency.",
        example=20.0,
    )
    initial_weight: Optional[float] = Field(
        ge=0,
        description="The initial weight of the filament on the spool, in grams. (net weight)",
        example=200,
    )
    spool_weight: Optional[float] = Field(
        ge=0,
        description="The weight of an empty spool, in grams. (tare weight)",
        example=200,
    )
    remaining_weight: Optional[float] = Field(
        ge=0,
        description=(
            "Remaining weight of filament on the spool. Can only be used if the filament type has a weight set."
        ),
        example=800,
    )
    used_weight: Optional[float] = Field(ge=0, description="Used weight of filament on the spool.", example=200)
    location: Optional[str] = Field(max_length=64, description="Where this spool can be found.", example="Shelf A")
    lot_nr: Optional[str] = Field(
        max_length=64,
        description="Vendor manufacturing lot/batch number of the spool.",
        example="52342",
    )
    comment: Optional[str] = Field(
        max_length=1024,
        description="Free text comment about this specific spool.",
        example="",
    )
    archived: bool = Field(default=False, description="Whether this spool is archived and should not be used anymore.")
    extra: Optional[dict[str, str]] = Field(
        None,
        description="Extra fields for this spool.",
    )


class SpoolUpdateParameters(SpoolParameters):
    filament_id: Optional[int] = Field(description="The ID of the filament type of this spool.")


class SpoolUseParameters(BaseModel):
    use_length: Optional[float] = Field(description="Length of filament to reduce by, in mm.", example=2.2)
    use_weight: Optional[float] = Field(description="Filament weight to reduce by, in g.", example=5.3)


class SpoolMeasureParameters(BaseModel):
    weight: float = Field(description="Current gross weight of the spool, in g.", example=200)


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
        404: {"model": Message},
        299: {"model": SpoolEvent, "description": "Websocket message"},
    },
)
async def find(
    *,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    filament_name_old: Optional[str] = Query(
        alias="filament_name",
        default=None,
        title="Filament Name",
        description="See filament.name.",
        deprecated=True,
    ),
    filament_id_old: Optional[str] = Query(
        alias="filament_id",
        default=None,
        title="Filament ID",
        description="See filament.id.",
        deprecated=True,
    ),
    filament_material_old: Optional[str] = Query(
        alias="filament_material",
        default=None,
        title="Filament Material",
        description="See filament.material.",
        deprecated=True,
    ),
    vendor_name_old: Optional[str] = Query(
        alias="vendor_name",
        default=None,
        title="Vendor Name",
        description="See filament.vendor.name.",
        deprecated=True,
    ),
    vendor_id_old: Optional[str] = Query(
        alias="vendor_id",
        default=None,
        title="Vendor ID",
        description="See filament.vendor.id.",
        deprecated=True,
    ),
    filament_name: Optional[str] = Query(
        alias="filament.name",
        default=None,
        title="Filament Name",
        description=(
            "Partial case-insensitive search term for the filament name. Separate multiple terms with a comma."
            " Specify an empty string to match spools with no filament name."
        ),
    ),
    filament_id: Optional[str] = Query(
        alias="filament.id",
        default=None,
        title="Filament ID",
        description="Match an exact filament ID. Separate multiple IDs with a comma.",
        examples=["1", "1,2"],
    ),
    filament_material: Optional[str] = Query(
        alias="filament.material",
        default=None,
        title="Filament Material",
        description=(
            "Partial case-insensitive search term for the filament material. Separate multiple terms with a comma. "
            "Specify an empty string to match spools with no filament material."
        ),
    ),
    filament_vendor_name: Optional[str] = Query(
        alias="filament.vendor.name",
        default=None,
        title="Vendor Name",
        description=(
            "Partial case-insensitive search term for the filament vendor name. Separate multiple terms with a comma. "
            "Specify an empty string to match spools with no vendor name."
        ),
    ),
    filament_vendor_id: Optional[str] = Query(
        alias="filament.vendor.id",
        default=None,
        title="Vendor ID",
        description=(
            "Match an exact vendor ID. Separate multiple IDs with a comma. "
            "Set it to -1 to match spools with filaments with no vendor."
        ),
        examples=["1", "1,2"],
    ),
    location: Optional[str] = Query(
        default=None,
        title="Location",
        description=(
            "Partial case-insensitive search term for the spool location. Separate multiple terms with a comma. "
            "Specify an empty string to match spools with no location."
        ),
    ),
    lot_nr: Optional[str] = Query(
        default=None,
        title="Lot/Batch Number",
        description=(
            "Partial case-insensitive search term for the spool lot number. Separate multiple terms with a comma. "
            "Specify an empty string to match spools with no lot nr."
        ),
    ),
    allow_archived: bool = Query(
        default=False,
        title="Allow Archived",
        description="Whether to include archived spools in the search results.",
    ),
    sort: Optional[str] = Query(
        default=None,
        title="Sort",
        description=(
            'Sort the results by the given field. Should be a comma-separate string with "field:direction" items.'
        ),
        example="filament.name:asc,filament.vendor.id:asc,location:desc",
    ),
    limit: Optional[int] = Query(
        default=None,
        title="Limit",
        description="Maximum number of items in the response.",
    ),
    offset: int = Query(
        default=0,
        title="Offset",
        description="Offset in the full result set if a limit is set.",
    ),
) -> JSONResponse:
    sort_by: dict[str, SortOrder] = {}
    if sort is not None:
        for sort_item in sort.split(","):
            field, direction = sort_item.split(":")
            sort_by[field] = SortOrder[direction.upper()]

    filament_id = filament_id if filament_id is not None else filament_id_old
    if filament_id is not None:
        try:
            filament_ids = [int(filament_id_item) for filament_id_item in filament_id.split(",")]
        except ValueError as e:
            raise RequestValidationError(
                [ErrorWrapper(ValueError("Invalid filament_id"), ("query", "filament_id"))],
            ) from e
    else:
        filament_ids = None

    filament_vendor_id = filament_vendor_id if filament_vendor_id is not None else vendor_id_old
    if filament_vendor_id is not None:
        try:
            filament_vendor_ids = [int(vendor_id_item) for vendor_id_item in filament_vendor_id.split(",")]
        except ValueError as e:
            raise RequestValidationError([ErrorWrapper(ValueError("Invalid vendor_id"), ("query", "vendor_id"))]) from e
    else:
        filament_vendor_ids = None

    db_items, total_count = await spool.find(
        db=db,
        filament_name=filament_name if filament_name is not None else filament_name_old,
        filament_id=filament_ids,
        filament_material=filament_material if filament_material is not None else filament_material_old,
        vendor_name=filament_vendor_name if filament_vendor_name is not None else vendor_name_old,
        vendor_id=filament_vendor_ids,
        location=location,
        lot_nr=lot_nr,
        allow_archived=allow_archived,
        sort_by=sort_by,
        limit=limit,
        offset=offset,
    )

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
    patch_data = body.dict(exclude_unset=True)

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

    if "filament_id" in patch_data and body.filament_id is None:
        raise RequestValidationError(
            [ErrorWrapper(ValueError("filament_id cannot be unset"), ("query", "filament_id"))],
        )

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

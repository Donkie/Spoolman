"""Filament related endpoints."""

import asyncio
import logging
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, validator
from pydantic.error_wrappers import ErrorWrapper
from sqlalchemy.ext.asyncio import AsyncSession

from spoolman.api.v1.models import Filament, FilamentEvent, Message
from spoolman.database import filament
from spoolman.database.database import get_db_session
from spoolman.database.utils import SortOrder
from spoolman.exceptions import ItemDeleteError
from spoolman.ws import websocket_manager

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/filament",
    tags=["filament"],
)

# ruff: noqa: D103, B008


class FilamentParameters(BaseModel):
    name: Optional[str] = Field(
        max_length=64,
        description=(
            "Filament name, to distinguish this filament type among others from the same vendor."
            "Should contain its color for example."
        ),
        example="PolyTerra™ Charcoal Black",
    )
    vendor_id: Optional[int] = Field(description="The ID of the vendor of this filament type.")
    material: Optional[str] = Field(
        max_length=64,
        description="The material of this filament, e.g. PLA.",
        example="PLA",
    )
    price: Optional[float] = Field(
        ge=0,
        description="The price of this filament in the system configured currency.",
        example=20.0,
    )
    density: float = Field(gt=0, description="The density of this filament in g/cm3.", example=1.24)
    diameter: float = Field(gt=0, description="The diameter of this filament in mm.", example=1.75)
    weight: Optional[float] = Field(
        gt=0,
        description="The weight of the filament in a full spool, in grams. (net weight)",
        example=1000,
    )
    spool_weight: Optional[float] = Field(gt=0, description="The empty spool weight, in grams.", example=140)
    article_number: Optional[str] = Field(
        max_length=64,
        description="Vendor article number, e.g. EAN, QR code, etc.",
        example="PM70820",
    )
    comment: Optional[str] = Field(
        max_length=1024,
        description="Free text comment about this filament type.",
        example="",
    )
    settings_extruder_temp: Optional[int] = Field(
        ge=0,
        description="Overridden extruder temperature, in °C.",
        example=210,
    )
    settings_bed_temp: Optional[int] = Field(
        ge=0,
        description="Overridden bed temperature, in °C.",
        example=60,
    )
    color_hex: Optional[str] = Field(
        description="Hexadecimal color code of the filament, e.g. FF0000 for red. Supports alpha channel at the end.",
        example="FF0000",
    )

    @validator("color_hex")
    @classmethod
    def color_hex_validator(cls, v: Optional[str]) -> Optional[str]:  # noqa: ANN102
        """Validate the color_hex field."""
        if not v:
            return None
        if v.startswith("#"):
            v = v[1:]
        v = v.upper()

        for c in v:
            if c not in "0123456789ABCDEF":
                raise ValueError("Invalid character in color code.")

        if len(v) not in (6, 8):
            raise ValueError("Color code must be 6 or 8 characters long.")

        return v


class FilamentUpdateParameters(FilamentParameters):
    density: Optional[float] = Field(gt=0, description="The density of this filament in g/cm3.", example=1.24)
    diameter: Optional[float] = Field(gt=0, description="The diameter of this filament in mm.", example=1.75)


@router.get(
    "",
    name="Find filaments",
    description=(
        "Get a list of filaments that matches the search query. "
        "A websocket is served on the same path to listen for updates to any filament, or added or deleted filaments. "
        "See the HTTP Response code 299 for the content of the websocket messages."
    ),
    response_model_exclude_none=True,
    responses={
        200: {"model": list[Filament]},
        404: {"model": Message},
        299: {"model": FilamentEvent, "description": "Websocket message"},
    },
)
async def find(
    *,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    vendor_name_old: Optional[str] = Query(
        alias="vendor_name",
        default=None,
        title="Vendor Name",
        description="See vendor.name.",
        deprecated=True,
    ),
    vendor_id_old: Optional[str] = Query(
        alias="vendor_id",
        default=None,
        title="Vendor ID",
        description="See vendor.id.",
        deprecated=True,
    ),
    vendor_name: Optional[str] = Query(
        alias="vendor.name",
        default=None,
        title="Vendor Name",
        description=(
            "Partial case-insensitive search term for the filament vendor name. "
            "Separate multiple terms with a comma. Specify an empty string to match filaments with no vendor name."
        ),
    ),
    vendor_id: Optional[str] = Query(
        alias="vendor.id",
        default=None,
        title="Vendor ID",
        description=(
            "Match an exact vendor ID. Separate multiple IDs with a comma. "
            "Specify -1 to match filaments with no vendor."
        ),
        examples=["1", "1,2"],
    ),
    name: Optional[str] = Query(
        default=None,
        title="Filament Name",
        description=(
            "Partial case-insensitive search term for the filament name. Separate multiple terms with a comma. "
            "Specify an empty string to match filaments with no name."
        ),
    ),
    material: Optional[str] = Query(
        default=None,
        title="Filament Material",
        description=(
            "Partial case-insensitive search term for the filament material. Separate multiple terms with a comma. "
            "Specify an empty string to match filaments with no material."
        ),
    ),
    article_number: Optional[str] = Query(
        default=None,
        title="Filament Article Number",
        description=(
            "Partial case-insensitive search term for the filament article number. "
            "Separate multiple terms with a comma. "
            "Specify an empty string to match filaments with no article number."
        ),
    ),
    sort: Optional[str] = Query(
        default=None,
        title="Sort",
        description=(
            'Sort the results by the given field. Should be a comma-separate string with "field:direction" items.'
        ),
        example="vendor.name:asc,spool_weight:desc",
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

    vendor_id = vendor_id if vendor_id is not None else vendor_id_old
    if vendor_id is not None:
        try:
            vendor_ids = [int(vendor_id_item) for vendor_id_item in vendor_id.split(",")]
        except ValueError as e:
            raise RequestValidationError([ErrorWrapper(ValueError("Invalid vendor_id"), ("query", "vendor_id"))]) from e
    else:
        vendor_ids = None

    db_items, total_count = await filament.find(
        db=db,
        vendor_name=vendor_name if vendor_name is not None else vendor_name_old,
        vendor_id=vendor_ids,
        name=name,
        material=material,
        article_number=article_number,
        sort_by=sort_by,
        limit=limit,
        offset=offset,
    )

    # Set x-total-count header for pagination
    return JSONResponse(
        content=jsonable_encoder(
            (Filament.from_db(db_item) for db_item in db_items),
            exclude_none=True,
        ),
        headers={"x-total-count": str(total_count)},
    )


@router.websocket(
    "",
    name="Listen to filament changes",
)
async def notify_any(
    websocket: WebSocket,
) -> None:
    await websocket.accept()
    websocket_manager.connect(("filament",), websocket)
    try:
        while True:
            await asyncio.sleep(0.5)
            if await websocket.receive_text():
                await websocket.send_json({"status": "healthy"})
    except WebSocketDisconnect:
        websocket_manager.disconnect(("filament",), websocket)


@router.get(
    "/{filament_id}",
    name="Get filament",
    description=(
        "Get a specific filament. A websocket is served on the same path to listen for changes to the filament. "
        "See the HTTP Response code 299 for the content of the websocket messages."
    ),
    response_model_exclude_none=True,
    responses={404: {"model": Message}, 299: {"model": FilamentEvent, "description": "Websocket message"}},
)
async def get(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    filament_id: int,
) -> Filament:
    db_item = await filament.get_by_id(db, filament_id)
    return Filament.from_db(db_item)


@router.websocket(
    "/{filament_id}",
    name="Listen to filament changes",
)
async def notify(
    websocket: WebSocket,
    filament_id: int,
) -> None:
    await websocket.accept()
    websocket_manager.connect(("filament", str(filament_id)), websocket)
    try:
        while True:
            await asyncio.sleep(0.5)
            if await websocket.receive_text():
                await websocket.send_json({"status": "healthy"})
    except WebSocketDisconnect:
        websocket_manager.disconnect(("filament", str(filament_id)), websocket)


@router.post(
    "",
    name="Add filament",
    description="Add a new filament to the database.",
    response_model_exclude_none=True,
)
async def create(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    body: FilamentParameters,
) -> Filament:
    db_item = await filament.create(
        db=db,
        density=body.density,
        diameter=body.diameter,
        name=body.name,
        vendor_id=body.vendor_id,
        material=body.material,
        price=body.price,
        weight=body.weight,
        spool_weight=body.spool_weight,
        article_number=body.article_number,
        comment=body.comment,
        settings_extruder_temp=body.settings_extruder_temp,
        settings_bed_temp=body.settings_bed_temp,
        color_hex=body.color_hex,
    )

    return Filament.from_db(db_item)


@router.patch(
    "/{filament_id}",
    name="Update filament",
    description="Update any attribute of a filament. Only fields specified in the request will be affected.",
    response_model_exclude_none=True,
    responses={404: {"model": Message}},
)
async def update(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    filament_id: int,
    body: FilamentUpdateParameters,
) -> Filament:
    patch_data = body.dict(exclude_unset=True)

    if "density" in patch_data and body.density is None:
        raise RequestValidationError([ErrorWrapper(ValueError("density cannot be unset"), ("query", "density"))])
    if "diameter" in patch_data and body.diameter is None:
        raise RequestValidationError([ErrorWrapper(ValueError("diameter cannot be unset"), ("query", "diameter"))])

    db_item = await filament.update(
        db=db,
        filament_id=filament_id,
        data=patch_data,
    )

    return Filament.from_db(db_item)


@router.delete(
    "/{filament_id}",
    name="Delete filament",
    description="Delete a filament.",
    response_model=Message,
    responses={
        403: {"model": Message},
        404: {"model": Message},
    },
)
async def delete(  # noqa: ANN201
    db: Annotated[AsyncSession, Depends(get_db_session)],
    filament_id: int,
):
    try:
        await filament.delete(db, filament_id)
    except ItemDeleteError:
        logger.exception("Failed to delete filament.")
        return JSONResponse(
            status_code=403,
            content={"message": "Failed to delete filament, see server logs for more information."},
        )
    return Message(message="Success!")

"""Vendor related endpoints."""

import asyncio
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from spoolman.api.v1.models import Message, Vendor, VendorEvent
from spoolman.database import vendor
from spoolman.database.database import get_db_session
from spoolman.database.utils import SortOrder
from spoolman.extra_fields import EntityType, get_extra_fields, validate_extra_field_dict
from spoolman.ws import websocket_manager

router = APIRouter(
    prefix="/vendor",
    tags=["vendor"],
)

# ruff: noqa: D103,B008


class VendorParameters(BaseModel):
    name: str = Field(max_length=64, description="Vendor name.", examples=["Polymaker"])
    comment: Optional[str] = Field(
        None,
        max_length=1024,
        description="Free text comment about this vendor.",
        examples=[""],
    )
    empty_spool_weight: Optional[float] = Field(
        None,
        ge=0,
        description="The weight of an empty spool, in grams.",
        examples=[200],
    )
    external_id: Optional[str] = Field(
        None,
        max_length=256,
        description=(
            "Set if this vendor comes from an external database. This contains the ID in the external database."
        ),
        examples=["eSun"],
    )
    extra: Optional[dict[str, str]] = Field(
        None,
        description="Extra fields for this vendor.",
    )


class VendorUpdateParameters(VendorParameters):
    name: Optional[str] = Field(None, max_length=64, description="Vendor name.", examples=["Polymaker"])

    @field_validator("name")
    @classmethod
    def prevent_none(cls: type["VendorUpdateParameters"], v: Optional[str]) -> Optional[str]:
        """Prevent name from being None."""
        if v is None:
            raise ValueError("Value must not be None.")
        return v


@router.get(
    "",
    name="Find vendor",
    description=(
        "Get a list of vendors that matches the search query. "
        "A websocket is served on the same path to listen for updates to any vendor, or added or deleted vendors. "
        "See the HTTP Response code 299 for the content of the websocket messages."
    ),
    response_model_exclude_none=True,
    responses={
        200: {"model": list[Vendor]},
        299: {"model": VendorEvent, "description": "Websocket message"},
    },
)
async def find(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    name: Annotated[
        Optional[str],
        Query(
            title="Vendor Name",
            description=(
                "Partial case-insensitive search term for the vendor name. Separate multiple terms with a comma. "
                "Surround a term with quotes to search for the exact term."
            ),
        ),
    ] = None,
    external_id: Annotated[
        Optional[str],
        Query(
            title="Vendor External ID",
            description=(
                "Exact match for the vendor external ID. "
                "Separate multiple IDs with a comma. "
                "Specify empty string to match filaments with no external ID. "
                "Surround a term with quotes to search for the exact term."
            ),
        ),
    ] = None,
    sort: Annotated[
        Optional[str],
        Query(
            title="Sort",
            description=(
                'Sort the results by the given field. Should be a comma-separate string with "field:direction" items.'
            ),
            example="name:asc,id:desc",
        ),
    ] = None,
    limit: Annotated[
        Optional[int],
        Query(title="Limit", description="Maximum number of items in the response."),
    ] = None,
    offset: Annotated[int, Query(title="Offset", description="Offset in the full result set if a limit is set.")] = 0,
) -> JSONResponse:
    sort_by: dict[str, SortOrder] = {}
    if sort is not None:
        for sort_item in sort.split(","):
            field, direction = sort_item.split(":")
            sort_by[field] = SortOrder[direction.upper()]

    db_items, total_count = await vendor.find(
        db=db,
        name=name,
        external_id=external_id,
        sort_by=sort_by,
        limit=limit,
        offset=offset,
    )
    # Set x-total-count header for pagination
    return JSONResponse(
        content=jsonable_encoder(
            (Vendor.from_db(db_item) for db_item in db_items),
            exclude_none=True,
        ),
        headers={"x-total-count": str(total_count)},
    )


@router.websocket(
    "",
    name="Listen to vendor changes",
)
async def notify_any(
    websocket: WebSocket,
) -> None:
    await websocket.accept()
    websocket_manager.connect(("vendor",), websocket)
    try:
        while True:
            await asyncio.sleep(0.5)
            if await websocket.receive_text():
                await websocket.send_json({"status": "healthy"})
    except WebSocketDisconnect:
        websocket_manager.disconnect(("vendor",), websocket)


@router.get(
    "/{vendor_id}",
    name="Get vendor",
    description=(
        "Get a specific vendor. A websocket is served on the same path to listen for changes to the vendor. "
        "See the HTTP Response code 299 for the content of the websocket messages."
    ),
    response_model_exclude_none=True,
    responses={404: {"model": Message}, 299: {"model": VendorEvent, "description": "Websocket message"}},
)
async def get(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    vendor_id: int,
) -> Vendor:
    db_item = await vendor.get_by_id(db, vendor_id)
    return Vendor.from_db(db_item)


@router.websocket(
    "/{vendor_id}",
    name="Listen to vendor changes",
)
async def notify(
    websocket: WebSocket,
    vendor_id: int,
) -> None:
    await websocket.accept()
    websocket_manager.connect(("vendor", str(vendor_id)), websocket)
    try:
        while True:
            await asyncio.sleep(0.5)
            if await websocket.receive_text():
                await websocket.send_json({"status": "healthy"})
    except WebSocketDisconnect:
        websocket_manager.disconnect(("vendor", str(vendor_id)), websocket)


@router.post(
    "",
    name="Add vendor",
    description="Add a new vendor to the database.",
    response_model_exclude_none=True,
    response_model=Vendor,
    responses={400: {"model": Message}},
)
async def create(  # noqa: ANN201
    db: Annotated[AsyncSession, Depends(get_db_session)],
    body: VendorParameters,
):
    if body.extra:
        all_fields = await get_extra_fields(db, EntityType.vendor)
        try:
            validate_extra_field_dict(all_fields, body.extra)
        except ValueError as e:
            return JSONResponse(status_code=400, content=Message(message=str(e)).model_dump())

    db_item = await vendor.create(
        db=db,
        name=body.name,
        comment=body.comment,
        empty_spool_weight=body.empty_spool_weight,
        external_id=body.external_id,
        extra=body.extra,
    )

    return Vendor.from_db(db_item)


@router.patch(
    "/{vendor_id}",
    name="Update vendor",
    description=(
        "Update any attribute of a vendor. Only fields specified in the request will be affected. "
        "If extra is set, all existing extra fields will be removed and replaced with the new ones."
    ),
    response_model_exclude_none=True,
    response_model=Vendor,
    responses={
        400: {"model": Message},
        404: {"model": Message},
    },
)
async def update(  # noqa: ANN201
    db: Annotated[AsyncSession, Depends(get_db_session)],
    vendor_id: int,
    body: VendorUpdateParameters,
):
    patch_data = body.model_dump(exclude_unset=True)

    if body.extra:
        all_fields = await get_extra_fields(db, EntityType.vendor)
        try:
            validate_extra_field_dict(all_fields, body.extra)
        except ValueError as e:
            return JSONResponse(status_code=400, content=Message(message=str(e)).dict())

    db_item = await vendor.update(
        db=db,
        vendor_id=vendor_id,
        data=patch_data,
    )

    return Vendor.from_db(db_item)


@router.delete(
    "/{vendor_id}",
    name="Delete vendor",
    description=(
        "Delete a vendor. The vendor attribute of any filaments who refer to the deleted vendor will be cleared."
    ),
    responses={404: {"model": Message}},
)
async def delete(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    vendor_id: int,
) -> Message:
    await vendor.delete(db, vendor_id)
    return Message(message="Success!")

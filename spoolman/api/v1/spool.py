"""Spool related endpoints."""

import logging
from datetime import datetime
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from pydantic.error_wrappers import ErrorWrapper
from sqlalchemy.ext.asyncio import AsyncSession

from spoolman.api.v1.models import Message, Spool
from spoolman.database import spool
from spoolman.database.database import get_db_session
from spoolman.database.utils import SortOrder
from spoolman.exceptions import ItemCreateError

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


class SpoolUpdateParameters(SpoolParameters):
    filament_id: Optional[int] = Field(description="The ID of the filament type of this spool.")


class SpoolUseParameters(BaseModel):
    use_length: Optional[float] = Field(description="Length of filament to reduce by, in mm.", example=2.2)
    use_weight: Optional[float] = Field(description="Filament weight to reduce by, in g.", example=5.3)


@router.get(
    "",
    name="Find spool",
    description="Get a list of spools that matches the search query.",
    response_model_exclude_none=True,
    response_model=list[Spool],
)
async def find(
    *,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    filament_name_old: Optional[str] = Query(
        alias="filament_name",
        default=None,
        title="Filament Name",
        description="Partial case-insensitive search term for the filament name.",
        deprecated=True,
    ),
    filament_id_old: Optional[int] = Query(
        alias="filament_id",
        default=None,
        title="Filament ID",
        description="Match an exact filament ID.",
        deprecated=True,
    ),
    filament_material_old: Optional[str] = Query(
        alias="filament_material",
        default=None,
        title="Filament Material",
        description="Partial case-insensitive search term for the filament material.",
        deprecated=True,
    ),
    vendor_name_old: Optional[str] = Query(
        alias="vendor_name",
        default=None,
        title="Vendor Name",
        description="Partial case-insensitive search term for the filament vendor name.",
        deprecated=True,
    ),
    vendor_id_old: Optional[int] = Query(
        alias="vendor_id",
        default=None,
        title="Vendor ID",
        description="Match an exact vendor ID.",
        deprecated=True,
    ),
    filament_name: Optional[str] = Query(
        alias="filament.name",
        default=None,
        title="Filament Name",
        description="Partial case-insensitive search term for the filament name.",
    ),
    filament_id: Optional[int] = Query(
        alias="filament.id",
        default=None,
        title="Filament ID",
        description="Match an exact filament ID.",
    ),
    filament_material: Optional[str] = Query(
        alias="filament.material",
        default=None,
        title="Filament Material",
        description="Partial case-insensitive search term for the filament material.",
    ),
    vendor_name: Optional[str] = Query(
        alias="vendor.name",
        default=None,
        title="Vendor Name",
        description="Partial case-insensitive search term for the filament vendor name.",
    ),
    vendor_id: Optional[int] = Query(
        alias="vendor.id",
        default=None,
        title="Vendor ID",
        description="Match an exact vendor ID.",
    ),
    location: Optional[str] = Query(
        default=None,
        title="Location",
        description="Partial case-insensitive search term for the spool location.",
    ),
    lot_nr: Optional[str] = Query(
        default=None,
        title="Lot/Batch Number",
        description="Partial case-insensitive search term for the spool lot number.",
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
        example="filament.name:asc,vendor.id:asc,location:desc",
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

    db_items, total_count = await spool.find(
        db=db,
        filament_name=filament_name if filament_name is not None else filament_name_old,
        filament_id=filament_id if filament_id is not None else filament_id_old,
        filament_material=filament_material if filament_material is not None else filament_material_old,
        vendor_name=vendor_name if vendor_name is not None else vendor_name_old,
        vendor_id=vendor_id if vendor_id is not None else vendor_id_old,
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


@router.get(
    "/{spool_id}",
    name="Get spool",
    description="Get a specific spool.",
    response_model_exclude_none=True,
    responses={404: {"model": Message}},
)
async def get(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    spool_id: int,
) -> Spool:
    db_item = await spool.get_by_id(db, spool_id)
    return Spool.from_db(db_item)


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

    try:
        db_item = await spool.create(
            db=db,
            filament_id=body.filament_id,
            remaining_weight=body.remaining_weight,
            used_weight=body.used_weight,
            first_used=body.first_used,
            last_used=body.last_used,
            location=body.location,
            lot_nr=body.lot_nr,
            comment=body.comment,
            archived=body.archived,
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
        "remaining_weight and used_weight can't be set at the same time."
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

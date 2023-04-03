"""Spool related endpoints."""

from datetime import datetime
from typing import Annotated, Optional, Union

from fastapi import APIRouter, Depends
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from pydantic.error_wrappers import ErrorWrapper
from sqlalchemy.ext.asyncio import AsyncSession

from spoolman.api.v1.models import Message, Spool
from spoolman.database import spool
from spoolman.database.database import get_db_session
from spoolman.exceptions import ItemCreateError

router = APIRouter(
    prefix="/spool",
    tags=["spool"],
)

# ruff: noqa: D103


class SpoolParameters(BaseModel):
    first_used: Optional[datetime] = Field(description="First logged occurence of spool usage.")
    last_used: Optional[datetime] = Field(description="Last logged occurence of spool usage.")
    filament_id: int = Field(description="The ID of the filament type of this spool.")
    weight: Optional[float] = Field(
        ge=0,
        description=(
            "Remaining weight of filament on the spool. "
            "Leave empty to assume a full spool based on the weight parameters of the filament type."
        ),
        example=500,
    )
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


class SpoolUpdateParameters(SpoolParameters):
    filament_id: Optional[int] = Field(description="The ID of the filament type of this spool.")


class SpoolUseParameters(BaseModel):
    use_length: Optional[float] = Field(description="Length of filament to reduce by, in mm.", example=2.2)
    use_weight: Optional[float] = Field(description="Filament weight to reduce by, in g.", example=5.3)


@router.get(
    "/",
    name="Find spool",
    description="Get a list of spools that matches the search query.",
    response_model_exclude_none=True,
)
async def find(_filament: Union[int, None] = None) -> list[Spool]:
    return []


@router.get(
    "/{spool_id}",
    name="Get spool",
    description="Get a specific spool.",
    response_model_exclude_none=True,
)
async def get(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    spool_id: int,
) -> Spool:
    db_item = await spool.get_by_id(db, spool_id)
    return Spool.from_db(db_item)


@router.post(
    "/",
    name="Add spool",
    description="Add a new spool to the database.",
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
    try:
        db_item = await spool.create(
            db=db,
            filament_id=body.filament_id,
            weight=body.weight,
            first_used=body.first_used,
            last_used=body.last_used,
            location=body.location,
            lot_nr=body.lot_nr,
            comment=body.comment,
        )
        return Spool.from_db(db_item)
    except ItemCreateError as exc:
        return JSONResponse(
            status_code=400,
            content={"message": str(exc)},
        )


@router.patch(
    "/{spool_id}",
    name="Update spool",
    description="Update any attribute of a spool. Only fields specified in the request will be affected.",
    response_model_exclude_none=True,
)
async def update(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    spool_id: int,
    body: SpoolUpdateParameters,
) -> Spool:
    patch_data = body.dict(exclude_unset=True)

    if "filament_id" in patch_data and body.filament_id is None:
        raise RequestValidationError(
            [ErrorWrapper(ValueError("filament_id cannot be unset"), ("query", "filament_id"))],
        )

    db_item = await spool.update(
        db=db,
        spool_id=spool_id,
        data=patch_data,
    )

    return Spool.from_db(db_item)


@router.delete(
    "/{spool_id}",
    name="Delete spool",
    description="Delete a spool.",
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
        "Use some length or weight of filament from the spool."
        " Specify either a length or a weight, not both."
        " Will do nothing if the spool is empty (you have to keep track of that by yourself)."
    ),
    response_model_exclude_none=True,
    response_model=Spool,
    responses={
        400: {"model": Message},
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

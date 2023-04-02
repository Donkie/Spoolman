"""Spool related endpoints."""

from datetime import datetime
from typing import Annotated, Optional, Union

from fastapi import APIRouter, Depends
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from pydantic.error_wrappers import ErrorWrapper
from sqlalchemy.ext.asyncio import AsyncSession

from spoolson.api.v1.models import Message, Spool
from spoolson.database import spool
from spoolson.database.database import get_db_session
from spoolson.exceptions import ItemCreateError

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
    )
    location: Optional[str] = Field(max_length=64, description="Where this spool can be found.")
    lot_nr: Optional[str] = Field(max_length=64, description="Vendor manufacturing lot/batch number of the spool.")
    comment: Optional[str] = Field(max_length=1024, description="Free text comment about this specific spool.")


class SpoolUpdateParameters(SpoolParameters):
    filament_id: Optional[int] = Field(description="The ID of the filament type of this spool.")


class SpoolUseParameters(BaseModel):
    use_length: Optional[float] = Field(description="Length of filament to reduce by, in mm.")
    use_weight: Optional[float] = Field(description="Filament weight to reduce by, in g.")


@router.get("/")
async def find(_filament: Union[int, None] = None) -> list[Spool]:
    return []


@router.get("/{spool_id}")
async def get(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    spool_id: int,
) -> Spool:
    db_item = await spool.get_by_id(db, spool_id)
    return Spool.from_db(db_item)


@router.post(
    "/",
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


@router.patch("/{spool_id}")
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


@router.delete("/{spool_id}")
async def delete(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    spool_id: int,
) -> Message:
    await spool.delete(db, spool_id)
    return Message(message="Success!")


@router.put(
    "/{spool_id}/use",
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

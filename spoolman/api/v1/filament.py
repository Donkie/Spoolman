"""Filament related endpoints."""

import logging
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from pydantic.error_wrappers import ErrorWrapper
from sqlalchemy.ext.asyncio import AsyncSession

from spoolman.api.v1.models import Filament, Message
from spoolman.database import filament
from spoolman.database.database import get_db_session
from spoolman.exceptions import ItemDeleteError

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


class FilamentUpdateParameters(FilamentParameters):
    density: Optional[float] = Field(gt=0, description="The density of this filament in g/cm3.", example=1.24)
    diameter: Optional[float] = Field(gt=0, description="The diameter of this filament in mm.", example=1.75)


@router.get(
    "/",
    name="Find filaments",
    description="Get a list of filaments that matches the search query.",
    response_model_exclude_none=True,
)
async def find(
    *,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    vendor_name: Optional[str] = Query(
        default=None,
        title="Vendor Name",
        description="Partial case-insensitive search term for the filament vendor name.",
    ),
    vendor_id: Optional[int] = Query(
        default=None,
        title="Vendor ID",
        description="Match an exact vendor ID.",
    ),
    name: Optional[str] = Query(
        default=None,
        title="Filament Name",
        description="Partial case-insensitive search term for the filament name.",
    ),
    material: Optional[str] = Query(
        default=None,
        title="Filament Material",
        description="Partial case-insensitive search term for the filament material.",
    ),
    article_number: Optional[str] = Query(
        default=None,
        title="Filament Article Number",
        description="Partial case-insensitive search term for the filament article number.",
    ),
) -> list[Filament]:
    db_items = await filament.find(
        db=db,
        vendor_name=vendor_name,
        vendor_id=vendor_id,
        name=name,
        material=material,
        article_number=article_number,
    )
    return [Filament.from_db(db_item) for db_item in db_items]


@router.get(
    "/{filament_id}",
    name="Get filament",
    description="Get a specific filament.",
    response_model_exclude_none=True,
)
async def get(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    filament_id: int,
) -> Filament:
    db_item = await filament.get_by_id(db, filament_id)
    return Filament.from_db(db_item)


@router.post(
    "/",
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
    )

    return Filament.from_db(db_item)


@router.patch(
    "/{filament_id}",
    name="Update filament",
    description="Update any attribute of a filament. Only fields specified in the request will be affected.",
    response_model_exclude_none=True,
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

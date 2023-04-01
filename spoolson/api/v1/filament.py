"""Filament related endpoints."""

from typing import Annotated, Optional, Union

from fastapi import APIRouter, Depends
from fastapi.exceptions import RequestValidationError
from pydantic import BaseModel, Field
from pydantic.error_wrappers import ErrorWrapper
from sqlalchemy.ext.asyncio import AsyncSession

from spoolson.api.v1.models import Filament, Message
from spoolson.database import filament
from spoolson.database.database import get_db_session

router = APIRouter(
    prefix="/filament",
    tags=["filament"],
)

# ruff: noqa: D103


class FilamentParameters(BaseModel):
    name: Optional[str] = Field(
        max_length=64,
        description=(
            "Filament name, to distinguish this filament type among others from the same vendor."
            "Should contain its color for example."
        ),
    )
    vendor_id: Optional[int] = Field(description="The ID of the vendor of this filament type.")
    material: Optional[str] = Field(max_length=64, description="The material of this filament, e.g. PLA.")
    price: Optional[float] = Field(ge=0, description="The price of this filament in the system configured currency.")
    density: float = Field(gt=0, description="The density of this filament in g/cm3.")
    diameter: float = Field(gt=0, description="The diameter of this filament in mm.")
    weight: Optional[float] = Field(gt=0, description="The weight of the filament in a full spool.")
    spool_weight: Optional[float] = Field(gt=0, description="The empty spool weight.")
    article_number: Optional[str] = Field(max_length=64, description="Vendor article number, e.g. EAN, QR code, etc.")
    comment: Optional[str] = Field(max_length=1024, description="Free text comment about this filament type.")


class FilamentUpdateParameters(FilamentParameters):
    density: Optional[float] = Field(gt=0, description="The density of this filament in g/cm3.")
    diameter: Optional[float] = Field(gt=0, description="The diameter of this filament in mm.")


@router.get("/")
async def find(_vendor: Union[int, None] = None) -> list[Filament]:
    return []


@router.get("/{filament_id}")
async def get(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    filament_id: int,
) -> Filament:
    db_item = await filament.get_by_id(db, filament_id)
    return Filament.from_db(db_item)


@router.post("/")
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


@router.patch("/{filament_id}")
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


@router.delete("/{filament_id}")
async def delete(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    filament_id: int,
) -> Message:
    await filament.delete(db, filament_id)
    return Message(message="Success!")

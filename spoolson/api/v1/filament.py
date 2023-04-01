"""Filament related endpoints."""

from typing import Annotated, Optional, Union

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from spoolson.api.v1.models import Filament, Vendor
from spoolson.database.database import get_db_session
from spoolson.database.filament import create_filament

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


@router.get("/")
async def find(_vendor: Union[int, None] = None) -> list[Filament]:
    return []


@router.get("/{filament_id}")
async def get(_filament_id: int) -> Filament:
    return Filament(
        id=0,
        name=None,
        vendor=Vendor(
            id=0,
            name="asdf",
            comment=None,
        ),
        material=None,
        price=None,
        density=1,
        diameter=1,
        weight=None,
        spool_weight=None,
        article_number=None,
        comment=None,
    )


@router.post("/")
async def create(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    body: FilamentParameters,
) -> Filament:
    db_item = await create_filament(
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


@router.put("/{filament_id}")
async def update() -> Filament:
    return Filament(
        id=0,
        name=None,
        vendor=Vendor(
            id=0,
            name="asdf",
            comment=None,
        ),
        material=None,
        price=None,
        density=1,
        diameter=1,
        weight=None,
        spool_weight=None,
        article_number=None,
        comment=None,
    )


@router.delete("/{filament_id}")
async def delete() -> None:
    pass

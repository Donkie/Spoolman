"""Vendor related endpoints."""

from typing import Annotated, Optional, Union

from fastapi import APIRouter, Depends
from fastapi.exceptions import RequestValidationError
from pydantic import BaseModel, Field
from pydantic.error_wrappers import ErrorWrapper
from sqlalchemy.ext.asyncio import AsyncSession

from spoolman.api.v1.models import Message, Vendor
from spoolman.database import vendor
from spoolman.database.database import get_db_session

router = APIRouter(
    prefix="/vendor",
    tags=["vendor"],
)

# ruff: noqa: D103


class VendorParameters(BaseModel):
    name: str = Field(max_length=64, description="Vendor name.")
    comment: Optional[str] = Field(max_length=1024, description="Free text comment about this vendor.")


class VendorUpdateParameters(VendorParameters):
    name: Optional[str] = Field(max_length=64, description="Vendor name.")
    comment: Optional[str] = Field(max_length=1024, description="Free text comment about this vendor.")


@router.get("/")
async def find(_name: Union[int, None] = None) -> list[Vendor]:
    return []


@router.get("/{vendor_id}")
async def get(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    vendor_id: int,
) -> Vendor:
    db_item = await vendor.get_by_id(db, vendor_id)
    return Vendor.from_db(db_item)


@router.post("/")
async def create(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    body: VendorParameters,
) -> Vendor:
    db_item = await vendor.create(
        db=db,
        name=body.name,
        comment=body.comment,
    )

    return Vendor.from_db(db_item)


@router.patch("/{vendor_id}")
async def update(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    vendor_id: int,
    body: VendorUpdateParameters,
) -> Vendor:
    patch_data = body.dict(exclude_unset=True)

    if "name" in patch_data and body.name is None:
        raise RequestValidationError([ErrorWrapper(ValueError("name cannot be unset"), ("query", "name"))])

    db_item = await vendor.update(
        db=db,
        vendor_id=vendor_id,
        data=patch_data,
    )

    return Vendor.from_db(db_item)


@router.delete("/{vendor_id}")
async def delete(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    vendor_id: int,
) -> Message:
    await vendor.delete(db, vendor_id)
    return Message(message="Success!")

"""Vendor related endpoints."""

from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query
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

# ruff: noqa: D103,B008


class VendorParameters(BaseModel):
    name: str = Field(max_length=64, description="Vendor name.", example="Polymaker")
    comment: Optional[str] = Field(
        max_length=1024,
        description="Free text comment about this vendor.",
        example="",
    )


class VendorUpdateParameters(VendorParameters):
    name: Optional[str] = Field(max_length=64, description="Vendor name.", example="Polymaker")
    comment: Optional[str] = Field(
        max_length=1024,
        description="Free text comment about this vendor.",
        example="",
    )


@router.get(
    "",
    name="Find vendor",
    description="Get a list of vendors that matches the search query.",
    response_model_exclude_none=True,
)
async def find(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    name: Optional[str] = Query(
        default=None,
        title="Vendor Name",
        description="Partial case-insensitive search term for the vendor name.",
    ),
) -> list[Vendor]:
    db_items = await vendor.find(
        db=db,
        name=name,
    )
    return [Vendor.from_db(db_item) for db_item in db_items]


@router.get(
    "/{vendor_id}",
    name="Get vendor",
    description="Get a specific vendor.",
    response_model_exclude_none=True,
    responses={404: {"model": Message}},
)
async def get(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    vendor_id: int,
) -> Vendor:
    db_item = await vendor.get_by_id(db, vendor_id)
    return Vendor.from_db(db_item)


@router.post(
    "",
    name="Add vendor",
    description="Add a new vendor to the database.",
    response_model_exclude_none=True,
)
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


@router.patch(
    "/{vendor_id}",
    name="Update vendor",
    description="Update any attribute of a vendor. Only fields specified in the request will be affected.",
    response_model_exclude_none=True,
    responses={404: {"model": Message}},
)
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

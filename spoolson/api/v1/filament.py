"""Filament related endpoints."""

from typing import Union
from fastapi import APIRouter

from spoolson.api.v1.models import Filament, Vendor

router = APIRouter(
    prefix="/filament",
    tags=["filament"],
)

# ruff: noqa: D103


@router.get("/")
async def find(vendor: Union[int, None] = None) -> list[Filament]:
    return []


@router.get("/{filament_id}")
async def get(filament_id: int) -> Filament:
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
async def create() -> Filament:
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
async def delete():
    pass

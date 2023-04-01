"""Router setup for the v1 version of the API."""

from fastapi import APIRouter

from . import filament, spool, vendor

router = APIRouter(
    prefix="/v1",
    tags=["v1"],
)
router.include_router(filament.router)
router.include_router(spool.router)
router.include_router(vendor.router)

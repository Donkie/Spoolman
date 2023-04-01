"""Router setup for the v1 version of the API."""

from fastapi import APIRouter, FastAPI

from . import filament, spool, vendor

app = FastAPI(
    title="Spoolson REST API v1",
    version="1.0.0",
    root_path_in_servers=False,
)

router = APIRouter(
    prefix="/api/v1",
)

router.include_router(filament.router)
router.include_router(spool.router)
router.include_router(vendor.router)

app.include_router(router)

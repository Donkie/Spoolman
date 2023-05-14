"""Router setup for the v1 version of the API."""

# ruff: noqa: D103

import logging

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from starlette.requests import Request
from starlette.responses import Response

from spoolman.exceptions import ItemNotFoundError

from . import filament, models, spool, vendor

logger = logging.getLogger(__name__)

app = FastAPI(
    title="Spoolman REST API v1",
    version="1.0.0",
    root_path_in_servers=False,
    responses={404: {"model": models.Message}},
)


@app.exception_handler(ItemNotFoundError)
async def itemnotfounderror_exception_handler(_request: Request, exc: ItemNotFoundError) -> Response:
    logger.debug(exc, exc_info=True)
    return JSONResponse(
        status_code=404,
        content={"message": "Item not found."},
    )


app.include_router(filament.router)
app.include_router(spool.router)
app.include_router(vendor.router)

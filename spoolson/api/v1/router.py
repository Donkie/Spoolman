"""Router setup for the v1 version of the API."""

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from starlette.requests import Request
from starlette.responses import Response

from spoolson.exceptions import ItemNotFoundError

from . import filament, models, spool, vendor

# ruff: noqa: D103

app = FastAPI(
    title="Spoolson REST API v1",
    version="1.0.0",
    root_path_in_servers=False,
    responses={404: {"model": models.Message}},
)


@app.exception_handler(ItemNotFoundError)
async def itemnotfounderror_exception_handler(_request: Request, exc: ItemNotFoundError) -> Response:
    return JSONResponse(
        status_code=404,
        content={"message": str(exc)},
    )


app.include_router(filament.router)
app.include_router(spool.router)
app.include_router(vendor.router)

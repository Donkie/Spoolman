"""External database API."""

import json
import logging
from typing import Annotated

from fastapi import APIRouter, Query, Response
from fastapi.responses import FileResponse, JSONResponse

from spoolman.env import is_tigertag_enabled
from spoolman.externaldb import (
    ExternalFilament,
    ExternalMaterial,
    get_filaments_file,
    get_materials_file,
    search_filaments,
)

router = APIRouter(
    prefix="/external",
    tags=["external"],
)


logger = logging.getLogger(__name__)


@router.get(
    "/filament",
    name="Get all external filaments",
    response_model_exclude_none=True,
    response_model=list[ExternalFilament],
)
async def filaments() -> FileResponse | JSONResponse:
    """Get all external filaments.

    When the optional TigerTag add-on is enabled, its synced catalog is merged in
    alongside the default SpoolmanDB catalog. Import stays lazy so a deployment that
    never enables the add-on never loads its module.
    """
    if not is_tigertag_enabled():
        return FileResponse(path=get_filaments_file(), media_type="application/json")

    from spoolman.tigertagdb import get_tigertag_filaments_file  # noqa: PLC0415

    combined = json.loads(get_filaments_file().read_bytes())
    tigertag_path = get_tigertag_filaments_file()
    if tigertag_path.exists():
        combined.extend(json.loads(tigertag_path.read_bytes()))
    return JSONResponse(content=combined)


@router.get(
    "/filament/search",
    name="Search external filaments",
    response_model_exclude_none=True,
)
async def search_external_filaments(
    response: Response,
    query: Annotated[
        str,
        Query(
            description="Search query, matched word-by-word against manufacturer, name and material.",
            examples=["polymaker pla"],
        ),
    ],
    limit: Annotated[
        int,
        Query(ge=1, le=100, description="Maximum number of results to return."),
    ] = 20,
    offset: Annotated[
        int,
        Query(ge=0, description="Number of matches to skip, for paging through the results."),
    ] = 0,
) -> list[ExternalFilament]:
    """Search the external filament catalog.

    Filters server-side so clients don't have to download the entire catalog just to
    search it. The total number of matches is returned in the x-total-count header.
    """
    items, total = search_filaments(query, limit, offset)
    response.headers["x-total-count"] = str(total)
    return items


@router.get(
    "/material",
    name="Get all external materials",
    response_model_exclude_none=True,
    response_model=list[ExternalMaterial],
)
async def materials() -> FileResponse:
    """Get all external materials."""
    return FileResponse(path=get_materials_file(), media_type="application/json")

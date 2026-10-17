"""External database API."""

import logging
from typing import Annotated

from fastapi import APIRouter, Query, Response
from fastapi.responses import FileResponse

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
async def filaments() -> FileResponse:
    """Get all external filaments."""
    return FileResponse(path=get_filaments_file(), media_type="application/json")


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
            description=(
                "Search query, matched word-by-word against manufacturer, name and material. "
                "A complete filament ID is matched exactly. Weight (g or kg) and diameter (mm) "
                "terms are matched numerically."
            ),
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

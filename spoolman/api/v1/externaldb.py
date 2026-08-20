"""External database API."""

import json
import logging
from typing import Annotated

from fastapi import APIRouter, Query
from fastapi.responses import FileResponse, JSONResponse

from spoolman.env import is_tigertag_enabled
from spoolman.externaldb import (
    ExternalFilament,
    ExternalMaterial,
    get_filaments_file,
    get_materials_file,
    search_filaments,
)
from spoolman.tigertagdb import get_tigertag_filaments_file

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
async def filaments() -> JSONResponse:
    """Get all external filaments from all sources."""
    merged: list[dict] = []

    # Load SpoolmanDB filaments
    try:
        spoolmandb_path = get_filaments_file()
        if spoolmandb_path.exists():
            data = json.loads(spoolmandb_path.read_bytes())
            for entry in data:
                entry["source"] = "spoolmandb"
            merged.extend(data)
    except Exception:
        logger.exception("Failed to load SpoolmanDB filaments")

    # Load TigerTag filaments if enabled
    if is_tigertag_enabled():
        try:
            tigertag_path = get_tigertag_filaments_file()
            if tigertag_path.exists():
                data = json.loads(tigertag_path.read_bytes())
                for entry in data:
                    if "source" not in entry:
                        entry["source"] = "tigertag"
                merged.extend(data)
        except Exception:
            logger.exception("Failed to load TigerTag filaments")

    return JSONResponse(content=merged)


@router.get(
    "/filament/search",
    name="Search external filaments",
    response_model_exclude_none=True,
)
async def search_external_filaments(
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
) -> list[ExternalFilament]:
    """Search the external filament catalog.

    Filters server-side so clients don't have to download the entire catalog just to
    search it.
    """
    return search_filaments(query, limit)


@router.get(
    "/material",
    name="Get all external materials",
    response_model_exclude_none=True,
    response_model=list[ExternalMaterial],
)
async def materials() -> FileResponse:
    """Get all external materials."""
    return FileResponse(path=get_materials_file(), media_type="application/json")

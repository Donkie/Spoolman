"""Cross-entity search endpoint."""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from spoolman.api.v1.models import (
    Filament,
    SearchResultFilament,
    SearchResults,
    SearchResultSpool,
    SearchResultVendor,
    Spool,
    Vendor,
)
from spoolman.database import search
from spoolman.database.database import get_db_session

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/search",
    tags=["search"],
)

# ruff: noqa: D103


@router.get(
    "",
    name="Search",
    description=(
        "Search across spools, filaments and vendors in a single request. The query is split on "
        "whitespace into terms, and an entity matches only if every term is found case-insensitively "
        "in one of its text fields (or its text/choice extra fields, or - for filaments - its "
        "vendor's name); different terms may match different fields, so 'bambu petg-cf' finds the "
        "PETG-CF filaments made by Bambu Lab. A purely numeric query additionally matches a spool "
        "by its exact id. A query that "
        "is a hex code (e.g. '#ff0000') or a CSS color name (e.g. 'red') additionally runs a "
        "color-similarity search over filaments. Results are categorized by entity and each result "
        "reports which field matched."
    ),
    response_model_exclude_none=True,
)
async def search_endpoint(
    *,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    query: Annotated[
        str,
        Query(
            alias="q",
            title="Query",
            description="The search query.",
            min_length=1,
            examples=["red"],
        ),
    ],
    color_similarity_threshold: Annotated[
        float,
        Query(
            title="Color Similarity Threshold",
            description=(
                "The similarity threshold for color matching, when the query is a color. "
                "A value between 0.0-100.0, where 0 means match only exactly the same color."
            ),
            ge=0.0,
            le=100.0,
            examples=[20.0],
        ),
    ] = 20.0,
    limit: Annotated[
        int,
        Query(
            title="Limit",
            description="Maximum number of results per category (spools, filaments, vendors).",
            ge=1,
            le=100,
        ),
    ] = 20,
) -> SearchResults:
    result = await search.search(
        db=db,
        query=query,
        color_similarity_threshold=color_similarity_threshold,
        limit=limit,
    )
    return SearchResults(
        spools=[SearchResultSpool(spool=Spool.from_db(m.spool), match_field=m.match_field) for m in result.spools],
        filaments=[
            SearchResultFilament(filament=Filament.from_db(m.filament), match_field=m.match_field)
            for m in result.filaments
        ],
        vendors=[
            SearchResultVendor(vendor=Vendor.from_db(m.vendor), match_field=m.match_field) for m in result.vendors
        ],
        is_color_query=result.is_color_query,
    )

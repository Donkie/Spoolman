"""Vendor related endpoints."""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, Path
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from spoolman.api.v1.models import Message
from spoolman.database.database import get_db_session
from spoolman.exceptions import ItemNotFoundError
from spoolman.extra_fields import (
    EntityType,
    ExtraField,
    ExtraFieldParameters,
    add_or_update_extra_field,
    delete_extra_field,
    get_extra_fields,
)

router = APIRouter(
    prefix="/field",
    tags=["field"],
)

# ruff: noqa: D103

logger = logging.getLogger(__name__)


@router.get(
    "/{entity_type}",
    name="Get extra fields",
    description="Get all extra fields for a specific entity type.",
    response_model_exclude_none=True,
)
async def get(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    entity_type: Annotated[EntityType, Path(description="Entity type this field is for")],
) -> list[ExtraField]:
    return await get_extra_fields(db, entity_type)


@router.post(
    "/{entity_type}/{key}",
    name="Add or update extra field",
    description=(
        "Add or update an extra field for a specific entity type. "
        "Returns the full list of extra fields for the entity type."
    ),
    response_model_exclude_none=True,
    response_model=list[ExtraField],
    responses={400: {"model": Message}},
)
async def update(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    entity_type: Annotated[EntityType, Path(description="Entity type this field is for")],
    key: Annotated[str, Path(min_length=1, max_length=64, regex="^[a-z0-9_]+$")],
    body: ExtraFieldParameters,
) -> list[ExtraField] | JSONResponse:
    dict_body = body.model_dump()
    dict_body["key"] = key
    dict_body["entity_type"] = entity_type
    body_with_key = ExtraField.model_validate(dict_body)

    try:
        await add_or_update_extra_field(db, entity_type, body_with_key)
    except ValueError as e:
        return JSONResponse(status_code=400, content=Message(message=str(e)).dict())

    return await get_extra_fields(db, entity_type)


@router.delete(
    "/{entity_type}/{key}",
    name="Delete extra field",
    description=(
        "Delete an extra field for a specific entity type. Returns the full list of extra fields for the entity type."
    ),
    response_model_exclude_none=True,
    response_model=list[ExtraField],
    responses={404: {"model": Message}},
)
async def delete(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    entity_type: Annotated[EntityType, Path(description="Entity type this field is for")],
    key: Annotated[str, Path(min_length=1, max_length=64, regex="^[a-z0-9_]+$")],
) -> list[ExtraField] | JSONResponse:
    try:
        await delete_extra_field(db, entity_type, key)
    except ItemNotFoundError:
        return JSONResponse(
            status_code=404,
            content=Message(
                message=f"Extra field with key {key} does not exist for entity type {entity_type.name}",
            ).dict(),
        )

    return await get_extra_fields(db, entity_type)

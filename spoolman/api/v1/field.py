"""Vendor related endpoints."""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, Path
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from spoolman.api.v1.models import Message
from spoolman.database.database import get_db_session
from spoolman.derived_fields import (
    DerivedFieldDefinition,
    DerivedFieldParameters,
    DerivedFieldPreviewRequest,
    DerivedFieldPreviewResponse,
    add_or_update_derived_field,
    delete_derived_field,
    get_derived_fields,
    preview_derived_payload,
)
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
    "/derived/{entity_type}",
    name="Get derived fields",
    description="Get all user-defined derived fields for a specific entity type.",
    response_model_exclude_none=True,
)
async def get_derived(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    entity_type: Annotated[EntityType, Path(description="Entity type this derived field is for")],
) -> list[DerivedFieldDefinition]:
    return await get_derived_fields(db, entity_type)


@router.post(
    "/derived/{entity_type}/preview",
    name="Preview derived field",
    description="Validate and preview a derived field JSON Logic expression with sample values.",
    response_model_exclude_none=True,
    response_model=DerivedFieldPreviewResponse,
    responses={400: {"model": Message}},
)
async def preview_derived(
    entity_type: Annotated[EntityType, Path(description="Entity type this derived field is for")],
    body: DerivedFieldPreviewRequest,
) -> DerivedFieldPreviewResponse | JSONResponse:
    # The route stays entity-scoped for UI symmetry, but preview validation is intentionally pure:
    # it only checks expression syntax/helpers against sample values and does not read entity data.
    del entity_type
    try:
        return preview_derived_payload(
            expression_json=body.expression_json,
            sample_values=body.sample_values,
        )
    except ValueError as exc:
        return JSONResponse(status_code=400, content=Message(message=str(exc)).dict())


@router.post(
    "/derived/{entity_type}/{key}",
    name="Add or update derived field",
    description=(
        "Add or update a derived field for a specific entity type. "
        "Returns the full list of derived fields for the entity type."
    ),
    response_model_exclude_none=True,
    response_model=list[DerivedFieldDefinition],
    responses={400: {"model": Message}},
)
async def update_derived(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    entity_type: Annotated[EntityType, Path(description="Entity type this derived field is for")],
    key: Annotated[str, Path(min_length=1, max_length=64, pattern="^[a-z0-9_]+$")],
    body: DerivedFieldParameters,
) -> list[DerivedFieldDefinition] | JSONResponse:
    dict_body = body.model_dump()
    dict_body["key"] = key
    dict_body["entity_type"] = entity_type
    body_with_key = DerivedFieldDefinition.model_validate(dict_body)

    try:
        await add_or_update_derived_field(db, entity_type, body_with_key)
    except ValueError as exc:
        return JSONResponse(status_code=400, content=Message(message=str(exc)).dict())

    return await get_derived_fields(db, entity_type)


@router.delete(
    "/derived/{entity_type}/{key}",
    name="Delete derived field",
    description=(
        "Delete a derived field for a specific entity type. Returns the full list of derived fields for the entity type."
    ),
    response_model_exclude_none=True,
    response_model=list[DerivedFieldDefinition],
    responses={404: {"model": Message}},
)
async def delete_derived(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    entity_type: Annotated[EntityType, Path(description="Entity type this derived field is for")],
    key: Annotated[str, Path(min_length=1, max_length=64, pattern="^[a-z0-9_]+$")],
) -> list[DerivedFieldDefinition] | JSONResponse:
    try:
        await delete_derived_field(db, entity_type, key)
    except ItemNotFoundError:
        return JSONResponse(
            status_code=404,
            content=Message(
                message=f"Derived field with key {key} does not exist for entity type {entity_type.name}",
            ).dict(),
        )

    return await get_derived_fields(db, entity_type)


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
    key: Annotated[str, Path(min_length=1, max_length=64, pattern="^[a-z0-9_]+$")],
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
    key: Annotated[str, Path(min_length=1, max_length=64, pattern="^[a-z0-9_]+$")],
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

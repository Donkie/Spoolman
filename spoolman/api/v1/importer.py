"""Functions for importing data."""

import logging
from dataclasses import dataclass, field
from enum import Enum
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from spoolman.api.v1.models import Message, MultiColorDirection
from spoolman.database import filament, spool, vendor
from spoolman.database.database import get_db_session
from spoolman.exceptions import ItemCreateError
from spoolman.extra_fields import EntityType, ExtraField, get_extra_fields, validate_extra_field_dict
from spoolman.importer import (
    ImportEntity,
    ImportFormat,
    ImportRecord,
    RowError,
    parse_rows,
    read_rows,
)

logger = logging.getLogger(__name__)

# ruff: noqa: D103
router = APIRouter(
    prefix="/import",
    tags=["import"],
)

# The file is refused as a whole when anything in it is wrong, which is a statement about
# the content rather than the request, so it gets the same status as a failed validation.
STATUS_UNPROCESSABLE = 422


class OnConflict(Enum):
    """What to do with a vendor or filament that already exists here."""

    SKIP = "skip"
    """Reuse the existing object and leave it as it is."""
    UPDATE = "update"
    """Reuse the existing object and overwrite it with the values from the file."""


class ImportCounts(BaseModel):
    created: int = Field(default=0, description="How many objects were created.")
    matched: int = Field(default=0, description="How many already existed and were reused unchanged.")
    updated: int = Field(default=0, description="How many already existed and were updated from the file.")


class ImportProblem(BaseModel):
    row: int = Field(description="Row number, counting the first data row as 1.")
    column: str | None = Field(default=None, description="The column at fault, when it is one column.")
    message: str = Field(description="What is wrong with it.")


class ImportResult(BaseModel):
    dry_run: bool = Field(description="Whether this was a dry run, in which case nothing was written.")
    rows: int = Field(description="How many data rows the file had.")
    vendors: ImportCounts = Field(default_factory=ImportCounts)
    filaments: ImportCounts = Field(default_factory=ImportCounts)
    spools: ImportCounts = Field(default_factory=ImportCounts)
    ignored_columns: list[str] = Field(
        default_factory=list,
        description=(
            "Columns present in the file but not imported, either because they describe the database a "
            "row came from (id, registered) or because they are derived from other columns "
            "(remaining_length). Listed so that nothing is dropped without saying so."
        ),
    )
    problems: list[ImportProblem] = Field(
        default_factory=list,
        description="Why the file was refused. Empty on success.",
    )


@dataclass
class _State:
    """Per-import bookkeeping.

    The caches are what make the counts honest: ten spools of one new filament are one
    vendor and one filament, and without remembering what has already been resolved a dry
    run would report ten of each, since a dry run writes nothing for the next row to find.
    """

    on_conflict: OnConflict
    dry_run: bool
    result: ImportResult
    vendors: dict[str, int | None] = field(default_factory=dict)
    filaments: dict[tuple, int | None] = field(default_factory=dict)


def _problems(errors: list[RowError]) -> list[ImportProblem]:
    return [ImportProblem(row=e.row, column=e.column, message=e.message) for e in errors]


async def _validate_extras(
    db: AsyncSession,
    records: list[ImportRecord],
    entity: ImportEntity,
) -> list[RowError]:
    """Check every extra field in the file against the fields defined in this database.

    Importing is the one place where a whole file's worth of unknown keys can show up at
    once, so they are reported together rather than one refusal per row.
    """
    own_type = {
        ImportEntity.VENDOR: EntityType.vendor,
        ImportEntity.FILAMENT: EntityType.filament,
        ImportEntity.SPOOL: EntityType.spool,
    }[entity]

    parent_types = {
        "vendor": EntityType.vendor,
        "filament.vendor": EntityType.vendor,
        "filament": EntityType.filament,
    }

    needed = {own_type} | {parent_types[p] for p in parent_types if any(r.parent_extra.get(p) for r in records)}
    defined: dict[EntityType, list[ExtraField]] = {t: await get_extra_fields(db, t) for t in needed}

    errors: list[RowError] = []
    for record in records:
        checks: list[tuple[EntityType, str, dict[str, str]]] = [(own_type, "", record.extra)]
        for prefix, values in record.parent_extra.items():
            if values:
                checks.append((parent_types[prefix], f"{prefix}.", values))
        for entity_type, prefix, values in checks:
            if not values:
                continue
            try:
                validate_extra_field_dict(defined[entity_type], values)
            except ValueError as exc:
                errors.append(RowError(row=record.row, column=f"{prefix}extra.*", message=str(exc)))
    return errors


async def _resolve_vendor(db: AsyncSession, fields: dict, extra: dict[str, str], state: _State) -> int | None:
    """Find the vendor a row refers to, creating it when this database has no such name.

    Vendors are matched by name, not by id: an id belongs to the database the file came
    from, and the same vendor has a different one here.
    """
    name = fields.get("name")
    if not name:
        return None

    key = name.casefold()
    if key in state.vendors:
        return state.vendors[key]

    existing, _ = await vendor.find(db=db, name=name)
    match = next((v for v in existing if (v.name or "").casefold() == key), None)

    if match is not None:
        if state.on_conflict == OnConflict.UPDATE:
            state.result.vendors.updated += 1
            if not state.dry_run:
                data = dict(fields)
                if extra:
                    data["extra"] = extra
                await vendor.update(db=db, vendor_id=match.id, data=data)
        else:
            state.result.vendors.matched += 1
        state.vendors[key] = match.id
        return match.id

    state.result.vendors.created += 1
    vendor_id = None if state.dry_run else (await vendor.create(db=db, extra=extra or None, **fields)).id
    state.vendors[key] = vendor_id
    return vendor_id


async def _resolve_filament(
    db: AsyncSession,
    fields: dict,
    extra: dict[str, str],
    vendor_id: int | None,
    state: _State,
) -> int | None:
    """Find the filament a row refers to, creating it when this database has no match.

    Matched on what a person would call the same filament: vendor, name, material and
    diameter. Weight is deliberately left out, so a 250 g sample does not become a second
    entry in the catalogue.
    """
    name = fields.get("name")
    material = fields.get("material")
    diameter = fields.get("diameter")

    key = (vendor_id, (name or "").casefold(), (material or "").casefold(), diameter)
    if key in state.filaments:
        return state.filaments[key]

    payload = dict(fields)
    if "multi_color_direction" in payload:
        payload["multi_color_direction"] = MultiColorDirection(payload["multi_color_direction"])

    candidates, _ = await filament.find(db=db, vendor_id=vendor_id if vendor_id is not None else None, name=name)
    match = next(
        (
            f
            for f in candidates
            if (f.name or "").casefold() == (name or "").casefold()
            and (f.material or "").casefold() == (material or "").casefold()
            and f.diameter == diameter
            and (f.vendor.id if f.vendor else None) == vendor_id
        ),
        None,
    )

    if match is not None:
        if state.on_conflict == OnConflict.UPDATE:
            state.result.filaments.updated += 1
            if not state.dry_run:
                data = {**payload, "vendor_id": vendor_id}
                if extra:
                    data["extra"] = extra
                await filament.update(db=db, filament_id=match.id, data=data)
        else:
            state.result.filaments.matched += 1
        state.filaments[key] = match.id
        return match.id

    state.result.filaments.created += 1
    filament_id = (
        None
        if state.dry_run
        else (await filament.create(db=db, vendor_id=vendor_id, extra=extra or None, **payload)).id
    )
    state.filaments[key] = filament_id
    return filament_id


@router.post(
    "/vendors",
    name="Import vendors",
    description=(
        "Import vendors from a CSV or JSON file, in the shape the matching export endpoint produces. "
        "A vendor whose name already exists here is reused, never duplicated. "
        "Nothing is written unless the whole file is valid."
    ),
    response_model=ImportResult,
    responses={STATUS_UNPROCESSABLE: {"model": ImportResult}, 400: {"model": Message}},
    openapi_extra={
        "requestBody": {
            "required": True,
            "description": "The file contents, as written by the matching export endpoint.",
            "content": {
                "text/csv": {"schema": {"type": "string"}},
                "application/json": {"schema": {"type": "string"}},
                "application/octet-stream": {"schema": {"type": "string", "format": "binary"}},
            },
        },
    },
)
async def import_vendors(  # noqa: ANN201
    *,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    response: Response,
    fmt: ImportFormat,
    request: Request,
    on_conflict: Annotated[
        OnConflict,
        Query(description="What to do with a vendor that already exists here."),
    ] = OnConflict.SKIP,
    dry_run: Annotated[bool, Query(description="Report what would happen without writing anything.")] = False,
):
    body = await request.body()
    return await _run_import(db, response, body, fmt, ImportEntity.VENDOR, on_conflict, dry_run=dry_run)


@router.post(
    "/filaments",
    name="Import filaments",
    description=(
        "Import filaments from a CSV or JSON file, in the shape the matching export endpoint produces. "
        "Vendors named in the file are reused when they already exist here and created when they do not. "
        "Nothing is written unless the whole file is valid."
    ),
    response_model=ImportResult,
    responses={STATUS_UNPROCESSABLE: {"model": ImportResult}, 400: {"model": Message}},
    openapi_extra={
        "requestBody": {
            "required": True,
            "description": "The file contents, as written by the matching export endpoint.",
            "content": {
                "text/csv": {"schema": {"type": "string"}},
                "application/json": {"schema": {"type": "string"}},
                "application/octet-stream": {"schema": {"type": "string", "format": "binary"}},
            },
        },
    },
)
async def import_filaments(  # noqa: ANN201
    *,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    response: Response,
    fmt: ImportFormat,
    request: Request,
    on_conflict: Annotated[
        OnConflict,
        Query(description="What to do with a filament or vendor that already exists here."),
    ] = OnConflict.SKIP,
    dry_run: Annotated[bool, Query(description="Report what would happen without writing anything.")] = False,
):
    body = await request.body()
    return await _run_import(db, response, body, fmt, ImportEntity.FILAMENT, on_conflict, dry_run=dry_run)


@router.post(
    "/spools",
    name="Import spools",
    description=(
        "Import spools from a CSV or JSON file, in the shape the matching export endpoint produces. "
        "The filaments and vendors the spools refer to are reused when they already exist here and "
        "created when they do not. Spools themselves are always created: two spools of the same filament "
        "are two real objects, so on_conflict does not apply to them. "
        "Nothing is written unless the whole file is valid."
    ),
    response_model=ImportResult,
    responses={STATUS_UNPROCESSABLE: {"model": ImportResult}, 400: {"model": Message}},
    openapi_extra={
        "requestBody": {
            "required": True,
            "description": "The file contents, as written by the matching export endpoint.",
            "content": {
                "text/csv": {"schema": {"type": "string"}},
                "application/json": {"schema": {"type": "string"}},
                "application/octet-stream": {"schema": {"type": "string", "format": "binary"}},
            },
        },
    },
)
async def import_spools(  # noqa: ANN201
    *,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    response: Response,
    fmt: ImportFormat,
    request: Request,
    on_conflict: Annotated[
        OnConflict,
        Query(description="What to do with a filament or vendor that already exists here."),
    ] = OnConflict.SKIP,
    dry_run: Annotated[bool, Query(description="Report what would happen without writing anything.")] = False,
):
    body = await request.body()
    return await _run_import(db, response, body, fmt, ImportEntity.SPOOL, on_conflict, dry_run=dry_run)


async def _run_import(  # noqa: ANN202
    db: AsyncSession,
    response: Response,
    file: bytes,
    fmt: ImportFormat,
    entity: ImportEntity,
    on_conflict: OnConflict,
    *,
    dry_run: bool,
):
    """Parse the file, refuse it if anything is wrong with it, then write it."""
    try:
        rows = read_rows(file, fmt)
    except ValueError as exc:
        return JSONResponse(status_code=400, content={"message": str(exc)})

    parsed = parse_rows(rows, entity)
    parsed.errors.extend(await _validate_extras(db, parsed.records, entity))

    result = ImportResult(
        dry_run=dry_run,
        rows=len(rows),
        ignored_columns=parsed.ignored_columns,
        problems=_problems(parsed.errors),
    )

    # An import that half-applies leaves the user worse off than one that refuses outright,
    # so the file is checked as a whole before a single row is written.
    if parsed.errors:
        response.status_code = STATUS_UNPROCESSABLE
        return result

    state = _State(on_conflict=on_conflict, dry_run=dry_run, result=result)

    try:
        for record in parsed.records:
            vendor_prefix = "vendor" if entity == ImportEntity.FILAMENT else "filament.vendor"
            vendor_fields = record.fields if entity == ImportEntity.VENDOR else record.parents.get(vendor_prefix, {})
            vendor_extra = record.extra if entity == ImportEntity.VENDOR else record.parent_extra.get(vendor_prefix, {})
            vendor_id = await _resolve_vendor(db, vendor_fields, vendor_extra, state)

            if entity == ImportEntity.VENDOR:
                continue

            filament_fields = record.fields if entity == ImportEntity.FILAMENT else record.parents.get("filament", {})
            filament_extra = (
                record.extra if entity == ImportEntity.FILAMENT else record.parent_extra.get("filament", {})
            )
            filament_id = await _resolve_filament(db, filament_fields, filament_extra, vendor_id, state)

            if entity == ImportEntity.FILAMENT:
                continue

            result.spools.created += 1
            if not dry_run and filament_id is not None:
                await spool.create(db=db, filament_id=filament_id, extra=record.extra or None, **record.fields)
    except ItemCreateError:
        logger.exception("Failed to import %s.", entity.value)
        return JSONResponse(
            status_code=400,
            content={"message": f"Failed to import {entity.value}, see server logs for more information."},
        )

    return result

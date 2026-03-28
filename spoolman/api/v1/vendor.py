"""Vendor related endpoints."""

import asyncio
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from spoolman.api.v1.models import Message, Vendor, VendorEvent
from spoolman.database import vendor
from spoolman.database.database import get_db_session
from spoolman.database.utils import SortOrder
from spoolman.extra_fields import EntityType, get_extra_fields, validate_extra_field_dict
from spoolman.vendor_logos import (
    convert_web_logo_to_print_logo,
    import_logo_pack_zip,
    store_uploaded_logo_file,
    sync_logo_pack_from_github_if_needed,
)
from spoolman.ws import websocket_manager

router = APIRouter(
    prefix="/vendor",
    tags=["vendor"],
)

# Logo fields live in vendor.extra, but the logo workflow owns their schema instead of generic extra-field config.
RESERVED_VENDOR_EXTRA_KEYS = {"logo_url", "print_logo_url"}

# ruff: noqa: D103, FBT002


class VendorParameters(BaseModel):
    name: str = Field(max_length=64, description="Vendor name.", examples=["Polymaker"])
    comment: str | None = Field(
        None,
        max_length=1024,
        description="Free text comment about this vendor.",
        examples=[""],
    )
    empty_spool_weight: float | None = Field(
        None,
        ge=0,
        description="The weight of an empty spool, in grams.",
        examples=[200],
    )
    external_id: str | None = Field(
        None,
        max_length=256,
        description=(
            "Set if this vendor comes from an external database. This contains the ID in the external database."
        ),
        examples=["eSun"],
    )
    extra: dict[str, str] | None = Field(
        None,
        description="Extra fields for this vendor.",
    )


class VendorUpdateParameters(VendorParameters):
    name: str | None = Field(None, max_length=64, description="Vendor name.", examples=["Polymaker"])

    @field_validator("name")
    @classmethod
    def prevent_none(cls: type["VendorUpdateParameters"], v: str | None) -> str | None:
        """Prevent name from being None."""
        if v is None:
            raise ValueError("Value must not be None.")
        return v


class VendorLogoPackSyncResult(BaseModel):
    updated: bool = Field(description="Whether a newer logo pack was downloaded.")
    message: str = Field(description="Result summary.")
    source_repo: str = Field(description="GitHub repository used as source.")
    source_ref: str = Field(description="Git branch/ref used as source.")
    source_url: str = Field(description="Source URL shown to users.")
    web_logo_count: int = Field(description="Number of web logos currently available.")
    print_logo_count: int = Field(description="Number of print logos currently available.")
    local_signature: str | None = Field(None, description="Previous local pack signature before check.")
    remote_signature: str = Field(description="Latest signature detected from GitHub.")
    synced_at_utc: str | None = Field(None, description="UTC timestamp of last successful pack sync.")


class VendorLogoConvertRequest(BaseModel):
    logo_url: str = Field(description="Source web logo URL or local logo path.")
    vendor_name: str | None = Field(None, max_length=64, description="Optional vendor name for filename slug.")

    @field_validator("logo_url")
    @classmethod
    def validate_logo_url(cls: type["VendorLogoConvertRequest"], value: str) -> str:
        """Validate and strip the logo URL."""
        trimmed = value.strip()
        if trimmed == "":
            raise ValueError("Logo URL is required.")
        return trimmed


class VendorLogoConvertResult(BaseModel):
    print_logo_url: str = Field(description="Generated print logo URL.")
    message: str = Field(description="Result summary.")


class VendorLogoImportResultModel(BaseModel):
    message: str = Field(description="Result summary.")
    source_repo: str = Field(description="Source marker for the imported pack.")
    source_ref: str = Field(description="Uploaded ZIP filename or source marker.")
    source_url: str = Field(description='Source shown to users, e.g. "local upload".')
    web_logo_count: int = Field(description="Number of imported web/color logos now available.")
    print_logo_count: int = Field(description="Number of print logos now available after import.")
    generated_print_logo_count: int = Field(description="Number of print logos generated during import.")
    synced_at_utc: str | None = Field(None, description="UTC timestamp of the import.")


class VendorLogoUploadResultModel(BaseModel):
    logo_url: str = Field(description="Local logo URL written to the runtime logo pack.")
    target: Literal["web", "print"] = Field(description="Destination logo folder kind.")
    message: str = Field(description="Result summary.")
    web_logo_count: int = Field(description="Number of web/color logos currently available.")
    print_logo_count: int = Field(description="Number of print logos currently available.")
    synced_at_utc: str | None = Field(None, description="UTC timestamp of the upload.")


@router.get(
    "",
    name="Find vendor",
    description=(
        "Get a list of vendors that matches the search query. "
        "A websocket is served on the same path to listen for updates to any vendor, or added or deleted vendors. "
        "See the HTTP Response code 299 for the content of the websocket messages."
    ),
    response_model_exclude_none=True,
    responses={
        200: {"model": list[Vendor]},
        299: {"model": VendorEvent, "description": "Websocket message"},
    },
)
async def find(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    name: Annotated[
        str | None,
        Query(
            title="Vendor Name",
            description=(
                "Partial case-insensitive search term for the vendor name. Separate multiple terms with a comma. "
                "Surround a term with quotes to search for the exact term."
            ),
        ),
    ] = None,
    external_id: Annotated[
        str | None,
        Query(
            title="Vendor External ID",
            description=(
                "Exact match for the vendor external ID. "
                "Separate multiple IDs with a comma. "
                "Specify empty string to match filaments with no external ID. "
                "Surround a term with quotes to search for the exact term."
            ),
        ),
    ] = None,
    logo: Annotated[
        str | None,
        Query(
            title="Logo Filter",
            description='Use "has-logo" to return vendors with an explicitly saved web logo, or "no-logo" otherwise.',
        ),
    ] = None,
    sort: Annotated[
        str | None,
        Query(
            title="Sort",
            description=(
                'Sort the results by the given field. Should be a comma-separate string with "field:direction" items.'
            ),
            examples=["name:asc,id:desc"],
        ),
    ] = None,
    limit: Annotated[
        int | None,
        Query(title="Limit", description="Maximum number of items in the response."),
    ] = None,
    offset: Annotated[int, Query(title="Offset", description="Offset in the full result set if a limit is set.")] = 0,
) -> JSONResponse:
    sort_by: dict[str, SortOrder] = {}
    if sort is not None:
        for sort_item in sort.split(","):
            field, direction = sort_item.split(":")
            sort_by[field] = SortOrder[direction.upper()]

    db_items, total_count = await vendor.find(
        db=db,
        name=name,
        external_id=external_id,
        logo=logo,
        sort_by=sort_by,
        limit=limit,
        offset=offset,
    )
    # Set x-total-count header for pagination
    return JSONResponse(
        content=jsonable_encoder(
            (Vendor.from_db(db_item) for db_item in db_items),
            exclude_none=True,
        ),
        headers={"x-total-count": str(total_count)},
    )


@router.websocket(
    "",
    name="Listen to vendor changes",
)
async def notify_any(
    websocket: WebSocket,
) -> None:
    await websocket.accept()
    websocket_manager.connect(("vendor",), websocket)
    try:
        while True:
            await asyncio.sleep(0.5)
            if await websocket.receive_text():
                await websocket.send_json({"status": "healthy"})
    except WebSocketDisconnect:
        websocket_manager.disconnect(("vendor",), websocket)


@router.post(
    "/logo-pack/sync-from-github",
    name="Check and sync vendor logo pack from GitHub",
    description=(
        "Checks for updates to the vendor logo source repository and downloads files only when there are changes."
    ),
)
async def sync_logo_pack_from_github() -> VendorLogoPackSyncResult | JSONResponse:
    try:
        result = await asyncio.to_thread(sync_logo_pack_from_github_if_needed)
    except (RuntimeError, OSError, ValueError) as exc:
        return JSONResponse(status_code=400, content=Message(message=str(exc)).model_dump())

    return VendorLogoPackSyncResult(
        updated=result.updated,
        message=result.message,
        source_repo=result.source_repo,
        source_ref=result.source_ref,
        source_url=result.source_url,
        web_logo_count=result.web_logo_count,
        print_logo_count=result.print_logo_count,
        local_signature=result.local_signature,
        remote_signature=result.remote_signature,
        synced_at_utc=result.synced_at_utc,
    )


@router.post(
    "/logo-pack/import-zip",
    name="Import vendor logo pack ZIP",
    description=(
        "Imports a ZIP archive of logo image files into the local runtime logo pack. "
        "All supported image files are treated as web/color logos by default. "
        "Optionally generates print logos for each imported web logo."
    ),
    response_model=VendorLogoImportResultModel,
)
async def import_logo_pack(
    file: Annotated[UploadFile, File(description="ZIP archive containing logo image files.")],
    generate_print_logos: Annotated[
        bool,
        Form(description="Whether to generate print logos from each imported web logo."),
    ] = False,
) -> VendorLogoImportResultModel | JSONResponse:
    try:
        file_bytes = await file.read()
        result = await asyncio.to_thread(import_logo_pack_zip, file_bytes, file.filename, generate_print_logos)
    except (RuntimeError, OSError) as exc:
        return JSONResponse(status_code=400, content=Message(message=str(exc)).model_dump())
    finally:
        await file.close()

    return VendorLogoImportResultModel(
        message=result.message,
        source_repo=result.source_repo,
        source_ref=result.source_ref,
        source_url=result.source_url,
        web_logo_count=result.web_logo_count,
        print_logo_count=result.print_logo_count,
        generated_print_logo_count=result.generated_print_logo_count,
        synced_at_utc=result.synced_at_utc,
    )


@router.post(
    "/logo-pack/upload-file",
    name="Upload vendor logo file",
    description="Uploads a single image file into the runtime web or print vendor logo folder.",
    response_model=VendorLogoUploadResultModel,
)
async def upload_logo_file(
    file: Annotated[UploadFile, File(description="Logo image file to upload.")],
    target: Annotated[Literal["web", "print"], Form(description="Target folder kind for uploaded file.")],
) -> VendorLogoUploadResultModel | JSONResponse:
    try:
        file_bytes = await file.read()
        result = await asyncio.to_thread(store_uploaded_logo_file, file_bytes, file.filename, target)
    except (RuntimeError, OSError, ValueError) as exc:
        return JSONResponse(status_code=400, content=Message(message=str(exc)).model_dump())
    finally:
        await file.close()

    return VendorLogoUploadResultModel(
        logo_url=result.logo_url,
        target=result.target,
        message=result.message,
        web_logo_count=result.web_logo_count,
        print_logo_count=result.print_logo_count,
        synced_at_utc=result.synced_at_utc,
    )


@router.post(
    "/logo-pack/convert-web-to-print",
    name="Convert vendor web logo to print logo",
    description="Converts a web logo into a black-and-white print logo stored in runtime vendor logos.",
    response_model=VendorLogoConvertResult,
)
async def convert_web_logo_to_print(body: VendorLogoConvertRequest) -> VendorLogoConvertResult | JSONResponse:
    try:
        # Pillow conversion can touch disk and parse image bytes, so run it off the event loop.
        print_logo_url = await asyncio.to_thread(convert_web_logo_to_print_logo, body.logo_url, body.vendor_name)
    except (ValueError, RuntimeError, OSError) as exc:
        return JSONResponse(status_code=400, content=Message(message=str(exc)).model_dump())

    return VendorLogoConvertResult(
        print_logo_url=print_logo_url,
        message="Generated print logo from web logo.",
    )


@router.get(
    "/{vendor_id}",
    name="Get vendor",
    description=(
        "Get a specific vendor. A websocket is served on the same path to listen for changes to the vendor. "
        "See the HTTP Response code 299 for the content of the websocket messages."
    ),
    response_model_exclude_none=True,
    responses={404: {"model": Message}, 299: {"model": VendorEvent, "description": "Websocket message"}},
)
async def get(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    vendor_id: int,
) -> Vendor:
    db_item = await vendor.get_by_id(db, vendor_id)
    return Vendor.from_db(db_item)


@router.websocket(
    "/{vendor_id}",
    name="Listen to vendor changes",
)
async def notify(
    websocket: WebSocket,
    vendor_id: int,
) -> None:
    await websocket.accept()
    websocket_manager.connect(("vendor", str(vendor_id)), websocket)
    try:
        while True:
            await asyncio.sleep(0.5)
            if await websocket.receive_text():
                await websocket.send_json({"status": "healthy"})
    except WebSocketDisconnect:
        websocket_manager.disconnect(("vendor", str(vendor_id)), websocket)


@router.post(
    "",
    name="Add vendor",
    description="Add a new vendor to the database.",
    response_model_exclude_none=True,
    response_model=Vendor,
    responses={400: {"model": Message}},
)
async def create(  # noqa: ANN201
    db: Annotated[AsyncSession, Depends(get_db_session)],
    body: VendorParameters,
):
    if body.extra:
        all_fields = await get_extra_fields(db, EntityType.vendor)
        # App-managed logo paths share vendor.extra storage but bypass generic field validation.
        extra_to_validate = {k: v for k, v in body.extra.items() if k not in RESERVED_VENDOR_EXTRA_KEYS}
        try:
            validate_extra_field_dict(all_fields, extra_to_validate)
        except ValueError as e:
            return JSONResponse(status_code=400, content=Message(message=str(e)).model_dump())

    db_item = await vendor.create(
        db=db,
        name=body.name,
        comment=body.comment,
        empty_spool_weight=body.empty_spool_weight,
        external_id=body.external_id,
        extra=body.extra,
    )

    return Vendor.from_db(db_item)


@router.patch(
    "/{vendor_id}",
    name="Update vendor",
    description=(
        "Update any attribute of a vendor. Only fields specified in the request will be affected. "
        "If extra is set, all existing extra fields will be removed and replaced with the new ones."
    ),
    response_model_exclude_none=True,
    response_model=Vendor,
    responses={
        400: {"model": Message},
        404: {"model": Message},
    },
)
async def update(  # noqa: ANN201
    db: Annotated[AsyncSession, Depends(get_db_session)],
    vendor_id: int,
    body: VendorUpdateParameters,
):
    patch_data = body.model_dump(exclude_unset=True)

    if body.extra:
        all_fields = await get_extra_fields(db, EntityType.vendor)
        # App-managed logo paths share vendor.extra storage but bypass generic field validation.
        extra_to_validate = {k: v for k, v in body.extra.items() if k not in RESERVED_VENDOR_EXTRA_KEYS}
        try:
            validate_extra_field_dict(all_fields, extra_to_validate)
        except ValueError as e:
            return JSONResponse(status_code=400, content=Message(message=str(e)).dict())

    db_item = await vendor.update(
        db=db,
        vendor_id=vendor_id,
        data=patch_data,
    )

    return Vendor.from_db(db_item)


@router.delete(
    "/{vendor_id}",
    name="Delete vendor",
    description=(
        "Delete a vendor. The vendor attribute of any filaments who refer to the deleted vendor will be cleared."
    ),
    responses={404: {"model": Message}},
)
async def delete(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    vendor_id: int,
) -> Message:
    await vendor.delete(db, vendor_id)
    return Message(message="Success!")

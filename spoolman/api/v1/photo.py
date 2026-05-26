"""Photo file endpoints."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Annotated
from urllib.parse import quote

if TYPE_CHECKING:
    from collections.abc import AsyncIterator

import sqlalchemy as sa
from fastapi import APIRouter, Depends, Header, Path, Request
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession  # noqa: TC002

from spoolman.api.v1.models import Message, SpoolmanDateTime
from spoolman.database import models
from spoolman.database import photo as db_photo
from spoolman.database.database import get_db_session
from spoolman.exceptions import ItemNotFoundError
from spoolman.extra_fields import EntityType  # noqa: TC001
from spoolman.photo_compression import PhotoValidationError, compress_photo_stream
from spoolman.photo_settings import get_photo_storage_settings

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/photo",
    tags=["photo"],
)

class PhotoFile(BaseModel):
    id: int = Field(description="Photo file ID.")
    registered: SpoolmanDateTime = Field(description="When the photo was registered.")
    filename: str = Field(description="Original uploaded filename.")
    content_type: str = Field(description="Stored compressed content type.")
    original_content_type: str | None = Field(None, description="Original uploaded content type.")
    size_bytes: int = Field(description="Stored compressed size in bytes.")
    original_size_bytes: int = Field(description="Original upload size in bytes.")
    width: int | None = Field(None, description="Stored photo width.")
    height: int | None = Field(None, description="Stored photo height.")
    sha256: str = Field(description="SHA-256 of original uploaded bytes.")

    @staticmethod
    def from_db(item: models.PhotoFile) -> PhotoFile:
        """Create a response model from a database model."""
        return PhotoFile(
            id=item.id,
            registered=item.registered,
            filename=item.filename,
            content_type=item.content_type,
            original_content_type=item.original_content_type,
            size_bytes=item.size_bytes,
            original_size_bytes=item.original_size_bytes,
            width=item.width,
            height=item.height,
            sha256=item.sha256,
        )


class PhotoUpdateParameters(BaseModel):
    filename: str | None = Field(None, min_length=1, max_length=256)


class PhotoAttachParameters(BaseModel):
    photo_ids: list[int] = Field(default_factory=list)


class PhotoBatchRequestItem(BaseModel):
    entity_type: EntityType
    entity_id: int = Field(ge=1)
    field_key: str = Field(min_length=1, max_length=64, pattern="^[a-z0-9_]+$")


class PhotoBatchResponseItem(PhotoBatchRequestItem):
    photos: list[PhotoFile]


async def _stream_chunks(db: AsyncSession, photo_id: int) -> AsyncIterator[bytes]:
    """Yield stored photo chunks."""
    stmt = (
        sa.select(models.PhotoFileChunk.data)
        .where(models.PhotoFileChunk.photo_file_id == photo_id)
        .order_by(models.PhotoFileChunk.chunk_index.asc())
    )
    stream = await db.stream_scalars(stmt)
    async for chunk in stream:
        yield chunk


def _content_disposition_inline(filename: str) -> str:
    """Return a safe inline filename header."""
    ascii_filename = filename.encode("ascii", "ignore").decode("ascii").replace('"', "").replace("\\", "")
    if not ascii_filename.strip():
        ascii_filename = "photo.jpg"
    encoded_filename = quote(filename, safe="")
    return f"inline; filename=\"{ascii_filename}\"; filename*=UTF-8''{encoded_filename}"


def _photo_error_status(exc: Exception) -> int:
    """Return the HTTP status for a photo error."""
    text = str(exc)
    return 413 if "50 MB" in text or "too large" in text or "no more than 5" in text else 400


@router.post(
    "/orphan/{entity_type}/{field_key}",
    name="Upload orphan photo for a not-yet-created entity field",
    response_model=PhotoFile,
    responses={400: {"model": Message}, 413: {"model": Message}},
)
async def upload_orphan(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    request: Request,
    entity_type: Annotated[EntityType, Path(description="Entity type")],
    field_key: Annotated[str, Path(min_length=1, max_length=64, pattern="^[a-z0-9_]+$")],
    x_filename: Annotated[str | None, Header(alias="X-Filename")] = None,
    content_type: Annotated[str | None, Header(alias="Content-Type")] = None,
) -> PhotoFile | JSONResponse:
    """Upload an unlinked photo."""
    try:
        settings = await get_photo_storage_settings(db)
        photo_stream = compress_photo_stream(
            request.stream(),
            filename=x_filename,
            original_content_type=content_type,
            max_photo_bytes=settings.max_upload_size_bytes,
            allowed_content_types=settings.allowed_content_types,
        )
        db_item = await db_photo.create_orphan_stream(
            db=db,
            entity_type=entity_type,
            field_key=field_key,
            photo_stream=photo_stream,
        )
        return PhotoFile.from_db(db_item)
    except PhotoValidationError as exc:
        await db.rollback()
        return JSONResponse(status_code=_photo_error_status(exc), content=Message(message=str(exc)).dict())
    except db_photo.PhotoLinkError as exc:
        return JSONResponse(status_code=400, content=Message(message=str(exc)).dict())


@router.post(
    "/batch",
    name="Batch list photos for entity fields",
    response_model=list[PhotoBatchResponseItem],
    responses={400: {"model": Message}, 404: {"model": Message}},
)
async def batch_list(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    body: list[PhotoBatchRequestItem],
) -> list[PhotoBatchResponseItem] | JSONResponse:
    """Return photos for several fields."""
    try:
        response: list[PhotoBatchResponseItem] = []
        for item in body:
            photos = await db_photo.list_for_field(db, item.entity_type, item.entity_id, item.field_key)
            response.append(
                PhotoBatchResponseItem(
                    entity_type=item.entity_type,
                    entity_id=item.entity_id,
                    field_key=item.field_key,
                    photos=[PhotoFile.from_db(photo) for photo in photos],
                ),
            )
        return response  # noqa: TRY300
    except db_photo.PhotoLinkError as exc:
        return JSONResponse(status_code=400, content=Message(message=str(exc)).dict())
    except ItemNotFoundError as exc:
        return JSONResponse(status_code=404, content=Message(message=str(exc)).dict())


@router.get(
    "/{photo_id}",
    name="Get photo metadata",
    response_model=PhotoFile,
    responses={404: {"model": Message}},
)
async def get(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    photo_id: Annotated[int, Path(ge=1)],
) -> PhotoFile | JSONResponse:
    """Return photo metadata."""
    try:
        return PhotoFile.from_db(await db_photo.get_by_id(db, photo_id))
    except ItemNotFoundError as exc:
        return JSONResponse(status_code=404, content=Message(message=str(exc)).dict())


@router.patch(
    "/{photo_id}",
    name="Update photo metadata",
    response_model=PhotoFile,
    responses={400: {"model": Message}, 404: {"model": Message}},
)
async def update(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    photo_id: Annotated[int, Path(ge=1)],
    body: PhotoUpdateParameters,
) -> PhotoFile | JSONResponse:
    """Update photo metadata."""
    try:
        return PhotoFile.from_db(await db_photo.update_metadata(db, photo_id, filename=body.filename))
    except db_photo.PhotoLinkError as exc:
        return JSONResponse(status_code=400, content=Message(message=str(exc)).dict())
    except ItemNotFoundError as exc:
        return JSONResponse(status_code=404, content=Message(message=str(exc)).dict())


@router.delete(
    "/{photo_id}",
    name="Delete photo",
    response_model=Message,
    responses={404: {"model": Message}},
)
async def delete(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    photo_id: Annotated[int, Path(ge=1)],
) -> Message | JSONResponse:
    """Delete a photo."""
    try:
        await db_photo.delete(db, photo_id)
    except ItemNotFoundError as exc:
        return JSONResponse(status_code=404, content=Message(message=str(exc)).dict())
    return Message(message="Success!")


@router.get(
    "/{photo_id}/content",
    name="Get photo content",
    response_model=None,
    responses={404: {"model": Message}},
)
async def content(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    photo_id: Annotated[int, Path(ge=1)],
) -> StreamingResponse | JSONResponse:
    """Stream photo content."""
    try:
        photo = await db_photo.get_by_id(db, photo_id)
    except ItemNotFoundError as exc:
        return JSONResponse(status_code=404, content=Message(message=str(exc)).dict())

    return StreamingResponse(
        _stream_chunks(db, photo_id),
        media_type=photo.content_type,
        headers={
            "Content-Length": str(photo.size_bytes),
            "Content-Disposition": _content_disposition_inline(photo.filename),
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
            "Expires": "0",
            "ETag": f'"{photo.sha256}-{photo.size_bytes}"',
        },
    )


@router.get(
    "/{entity_type}/{entity_id}/{field_key}",
    name="List photos for entity field",
    response_model=list[PhotoFile],
    responses={400: {"model": Message}, 404: {"model": Message}},
)
async def list_for_field(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    entity_type: Annotated[EntityType, Path(description="Entity type")],
    entity_id: Annotated[int, Path(ge=1)],
    field_key: Annotated[str, Path(min_length=1, max_length=64, pattern="^[a-z0-9_]+$")],
) -> list[PhotoFile] | JSONResponse:
    """Return photos for an entity field."""
    try:
        photos = await db_photo.list_for_field(db, entity_type, entity_id, field_key)
    except db_photo.PhotoLinkError as exc:
        return JSONResponse(status_code=400, content=Message(message=str(exc)).dict())
    except ItemNotFoundError as exc:
        return JSONResponse(status_code=404, content=Message(message=str(exc)).dict())
    return [PhotoFile.from_db(item) for item in photos]


@router.post(
    "/{entity_type}/{entity_id}/{field_key}",
    name="Upload photo for entity field",
    response_model=PhotoFile,
    responses={400: {"model": Message}, 404: {"model": Message}, 413: {"model": Message}},
)
async def upload(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    request: Request,
    entity_type: Annotated[EntityType, Path(description="Entity type")],
    entity_id: Annotated[int, Path(ge=1)],
    field_key: Annotated[str, Path(min_length=1, max_length=64, pattern="^[a-z0-9_]+$")],
    x_filename: Annotated[str | None, Header(alias="X-Filename")] = None,
    content_type: Annotated[str | None, Header(alias="Content-Type")] = None,
) -> PhotoFile | JSONResponse:
    """Upload and link a photo."""
    try:
        settings = await get_photo_storage_settings(db)
        photo_stream = compress_photo_stream(
            request.stream(),
            filename=x_filename,
            original_content_type=content_type,
            max_photo_bytes=settings.max_upload_size_bytes,
            allowed_content_types=settings.allowed_content_types,
        )
        db_item = await db_photo.create_and_link_stream(
            db=db,
            entity_type=entity_type,
            entity_id=entity_id,
            field_key=field_key,
            photo_stream=photo_stream,
        )
        return PhotoFile.from_db(db_item)
    except PhotoValidationError as exc:
        await db.rollback()
        return JSONResponse(status_code=_photo_error_status(exc), content=Message(message=str(exc)).dict())
    except db_photo.PhotoLinkError as exc:
        return JSONResponse(status_code=400, content=Message(message=str(exc)).dict())
    except ItemNotFoundError as exc:
        return JSONResponse(status_code=404, content=Message(message=str(exc)).dict())


@router.post(
    "/{entity_type}/{entity_id}/{field_key}/attach",
    name="Attach existing uploaded photos to entity field",
    response_model=list[PhotoFile],
    responses={400: {"model": Message}, 404: {"model": Message}, 413: {"model": Message}},
)
async def attach(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    entity_type: Annotated[EntityType, Path(description="Entity type")],
    entity_id: Annotated[int, Path(ge=1)],
    field_key: Annotated[str, Path(min_length=1, max_length=64, pattern="^[a-z0-9_]+$")],
    body: PhotoAttachParameters,
) -> list[PhotoFile] | JSONResponse:
    """Attach uploaded photos."""
    try:
        photos = await db_photo.link_existing_photos(
            db,
            entity_type,
            entity_id,
            field_key,
            body.photo_ids,
            append=False,
        )
        return [PhotoFile.from_db(photo) for photo in photos]
    except db_photo.PhotoLinkError as exc:
        return JSONResponse(status_code=_photo_error_status(exc), content=Message(message=str(exc)).dict())
    except ItemNotFoundError as exc:
        return JSONResponse(status_code=404, content=Message(message=str(exc)).dict())

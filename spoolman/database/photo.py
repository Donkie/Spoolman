"""Photo database helpers."""

from __future__ import annotations

import json
import logging
from datetime import datetime
from enum import Enum

import sqlalchemy as sa
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession  # noqa: TC002

from spoolman.database import filament as db_filament
from spoolman.database import models
from spoolman.database import spool as db_spool
from spoolman.database import vendor as db_vendor
from spoolman.exceptions import ItemNotFoundError
from spoolman.extra_fields import EntityType, ExtraFieldType, get_extra_fields
from spoolman.photo_compression import CompressedPhotoMetadata, StreamingCompressedPhoto  # noqa: TC001
from spoolman.photo_settings import get_photo_storage_settings

logger = logging.getLogger(__name__)

PHOTO_CHUNK_SIZE = 49152


class PhotoLinkError(ValueError):
    """Photo link validation error."""


class PhotoEntityTable(Enum):
    """Entity photo table mapping."""

    vendor = (models.VendorPhoto, models.VendorPhoto.vendor_id, db_vendor.get_by_id)
    filament = (models.FilamentPhoto, models.FilamentPhoto.filament_id, db_filament.get_by_id)
    spool = (models.SpoolPhoto, models.SpoolPhoto.spool_id, db_spool.get_by_id)

    @property
    def link_model(self):  # noqa: ANN201
        """Return the entity-photo link model."""
        return self.value[0]

    @property
    def entity_id_column(self):  # noqa: ANN201
        """Return the link-table entity ID column."""
        return self.value[1]

    @property
    def get_entity(self):  # noqa: ANN201
        """Return the entity lookup function."""
        return self.value[2]


def _table(entity_type: EntityType) -> PhotoEntityTable:
    return PhotoEntityTable[entity_type.name]


async def _validate_photo_field(
    db: AsyncSession,
    entity_type: EntityType,
    entity_id: int | None,
    field_key: str,
) -> None:
    table = _table(entity_type)
    if entity_id is not None:
        await table.get_entity(db, entity_id)

    fields = await get_extra_fields(db, entity_type)
    field = next((item for item in fields if item.key == field_key), None)
    if field is None:
        raise PhotoLinkError(f"Unknown extra field {field_key} for {entity_type.value}.")
    if field.field_type != ExtraFieldType.photo:
        raise PhotoLinkError(f"Extra field {field_key} is not a photo field.")


async def count_for_field(db: AsyncSession, entity_type: EntityType, entity_id: int, field_key: str) -> int:
    """Return the number of photos attached to a field."""
    table = _table(entity_type)
    stmt = (
        select(func.count())
        .select_from(table.link_model)
        .where(
            table.entity_id_column == entity_id,
            table.link_model.field_key == field_key,
        )
    )
    return int((await db.execute(stmt)).scalar() or 0)


async def next_sort_order(db: AsyncSession, entity_type: EntityType, entity_id: int, field_key: str) -> int:
    """Return the next sort order."""
    table = _table(entity_type)
    stmt = select(func.max(table.link_model.sort_order)).where(
        table.entity_id_column == entity_id,
        table.link_model.field_key == field_key,
    )
    current = (await db.execute(stmt)).scalar()
    return int(current or 0) + 1


def _apply_photo_metadata(db_photo: models.PhotoFile, metadata: CompressedPhotoMetadata) -> None:
    db_photo.filename = metadata.filename
    db_photo.content_type = metadata.content_type
    db_photo.original_content_type = metadata.original_content_type
    db_photo.size_bytes = metadata.size_bytes
    db_photo.original_size_bytes = metadata.original_size_bytes
    db_photo.width = metadata.width
    db_photo.height = metadata.height
    db_photo.sha256 = metadata.sha256


async def _delete_photo_rows(db: AsyncSession, photo_id: int) -> None:
    await db.execute(sa.delete(models.PhotoFileChunk).where(models.PhotoFileChunk.photo_file_id == photo_id))
    await db.execute(sa.delete(models.PhotoFile).where(models.PhotoFile.id == photo_id))


async def _persist_stream(db: AsyncSession, photo_stream: StreamingCompressedPhoto) -> models.PhotoFile:
    db_photo = models.PhotoFile(
        registered=datetime.utcnow().replace(microsecond=0),
        filename="photo.jpg",
        content_type="image/jpeg",
        original_content_type=None,
        size_bytes=0,
        original_size_bytes=0,
        width=None,
        height=None,
        sha256="0" * 64,
    )
    db.add(db_photo)
    await db.flush()

    try:
        chunk_index = 0
        async for chunk in photo_stream.chunks():
            for offset in range(0, len(chunk), PHOTO_CHUNK_SIZE):
                part = chunk[offset : offset + PHOTO_CHUNK_SIZE]
                if not part:
                    continue
                db.add(models.PhotoFileChunk(photo_file_id=db_photo.id, chunk_index=chunk_index, data=part))
                chunk_index += 1

        metadata = await photo_stream.finish()
        _apply_photo_metadata(db_photo, metadata)
        await db.flush()
        return db_photo  # noqa: TRY300
    except Exception:
        await photo_stream.aclose()
        await _delete_photo_rows(db, db_photo.id)
        await db.flush()
        raise


async def create_orphan_stream(
    *,
    db: AsyncSession,
    entity_type: EntityType,
    field_key: str,
    photo_stream: StreamingCompressedPhoto,
) -> models.PhotoFile:
    """Create an unlinked photo."""
    await _validate_photo_field(db, entity_type, None, field_key)
    return await _persist_stream(db, photo_stream)


async def create_and_link_stream(
    *,
    db: AsyncSession,
    entity_type: EntityType,
    entity_id: int,
    field_key: str,
    photo_stream: StreamingCompressedPhoto,
) -> models.PhotoFile:
    """Create and link a streamed photo."""
    await _validate_photo_field(db, entity_type, entity_id, field_key)
    settings = await get_photo_storage_settings(db)
    current_count = await count_for_field(db, entity_type, entity_id, field_key)
    if current_count >= settings.max_files_per_field:
        raise PhotoLinkError(f"A photo field can contain no more than {settings.max_files_per_field} photos.")

    db_photo = await _persist_stream(db, photo_stream)
    try:
        await link_existing_photos(db, entity_type, entity_id, field_key, [db_photo.id], append=True)
        final_count = await count_for_field(db, entity_type, entity_id, field_key)
        if final_count > settings.max_files_per_field:
            raise PhotoLinkError(f"A photo field can contain no more than {settings.max_files_per_field} photos.")  # noqa: TRY301
        await db.flush()
        return db_photo  # noqa: TRY300
    except Exception:
        await delete(db, db_photo.id)
        await db.flush()
        raise


async def get_by_id(db: AsyncSession, photo_id: int) -> models.PhotoFile:
    """Return photo metadata."""
    photo = await db.get(models.PhotoFile, photo_id)
    if photo is None:
        raise ItemNotFoundError(f"No photo with ID {photo_id} found.")
    return photo


async def _photo_link_rows(db: AsyncSession, photo_id: int) -> list[tuple[PhotoEntityTable, int, str]]:
    rows: list[tuple[PhotoEntityTable, int, str]] = []
    for table in PhotoEntityTable:
        stmt = select(table.entity_id_column, table.link_model.field_key).where(
            table.link_model.photo_file_id == photo_id,
        )
        for entity_id, field_key in (await db.execute(stmt)).all():
            rows.append((table, int(entity_id), str(field_key)))
    return rows


async def _assert_photos_can_be_linked(
    db: AsyncSession,
    entity_type: EntityType,
    entity_id: int,
    field_key: str,
    photo_ids: list[int],
) -> None:
    settings = await get_photo_storage_settings(db)
    if len(photo_ids) > settings.max_files_per_field:
        raise PhotoLinkError(f"A photo field can contain no more than {settings.max_files_per_field} photos.")
    if not photo_ids:
        return

    found_ids = set(
        (await db.execute(select(models.PhotoFile.id).where(models.PhotoFile.id.in_(photo_ids)))).scalars().all(),
    )
    missing = [photo_id for photo_id in photo_ids if photo_id not in found_ids]
    if missing:
        raise ItemNotFoundError(f"No photo with ID {missing[0]} found.")

    expected_table = _table(entity_type)
    for photo_id in photo_ids:
        for linked_table, linked_entity_id, linked_field_key in await _photo_link_rows(db, photo_id):
            if linked_table != expected_table or linked_entity_id != entity_id or linked_field_key != field_key:
                raise PhotoLinkError(f"Photo {photo_id} is already linked to another entity or field.")


async def link_existing_photos(  # noqa: C901
    db: AsyncSession,
    entity_type: EntityType,
    entity_id: int,
    field_key: str,
    photo_ids: list[int],
    *,
    append: bool = False,
) -> list[models.PhotoFile]:
    """Link uploaded photos to an entity field."""
    await _validate_photo_field(db, entity_type, entity_id, field_key)
    unique_ids = list(dict.fromkeys(int(photo_id) for photo_id in photo_ids))

    settings = await get_photo_storage_settings(db)
    if append:
        current_count = await count_for_field(db, entity_type, entity_id, field_key)
        if current_count + len(unique_ids) > settings.max_files_per_field:
            raise PhotoLinkError(f"A photo field can contain no more than {settings.max_files_per_field} photos.")
    elif len(unique_ids) > settings.max_files_per_field:
        raise PhotoLinkError(f"A photo field can contain no more than {settings.max_files_per_field} photos.")

    await _assert_photos_can_be_linked(db, entity_type, entity_id, field_key, unique_ids)

    table = _table(entity_type)
    removed_ids: list[int] = []
    if not append:
        current_stmt = select(table.link_model.photo_file_id).where(
            table.entity_id_column == entity_id,
            table.link_model.field_key == field_key,
        )
        current_ids = list((await db.execute(current_stmt)).scalars().all())
        removed_ids = [photo_id for photo_id in current_ids if photo_id not in unique_ids]
        if removed_ids:
            await db.execute(
                sa.delete(table.link_model).where(
                    table.entity_id_column == entity_id,
                    table.link_model.field_key == field_key,
                    table.link_model.photo_file_id.in_(removed_ids),
                ),
            )

    existing_stmt = select(table.link_model.photo_file_id).where(
        table.entity_id_column == entity_id,
        table.link_model.field_key == field_key,
    )
    existing_ids = set((await db.execute(existing_stmt)).scalars().all())
    sort_order = await next_sort_order(db, entity_type, entity_id, field_key)
    for photo_id in unique_ids:
        if photo_id in existing_ids:
            continue
        db.add(
            table.link_model(
                **{
                    table.entity_id_column.key: entity_id,
                    "field_key": field_key,
                    "photo_file_id": photo_id,
                    "sort_order": sort_order,
                },
            ),
        )
        sort_order += 1

    for photo_id in removed_ids:
        if not await is_linked(db, photo_id):
            await _delete_photo_rows(db, photo_id)

    await db.flush()
    final_count = await count_for_field(db, entity_type, entity_id, field_key)
    if final_count > settings.max_files_per_field:
        raise PhotoLinkError(f"A photo field can contain no more than {settings.max_files_per_field} photos.")
    if not unique_ids:
        return []
    photos = (
        await db.execute(select(models.PhotoFile).where(models.PhotoFile.id.in_(unique_ids)))
    ).scalars().all()
    by_id = {photo.id: photo for photo in photos}
    return [by_id[photo_id] for photo_id in unique_ids if photo_id in by_id]


async def is_linked(db: AsyncSession, photo_id: int) -> bool:
    """Return true if a photo is linked to any entity."""
    for table in PhotoEntityTable:
        stmt = select(func.count()).select_from(table.link_model).where(table.link_model.photo_file_id == photo_id)
        if int((await db.execute(stmt)).scalar() or 0) > 0:
            return True
    return False


async def list_for_field(
    db: AsyncSession,
    entity_type: EntityType,
    entity_id: int,
    field_key: str,
) -> list[models.PhotoFile]:
    """Return photos attached to an entity photo field."""
    await _validate_photo_field(db, entity_type, entity_id, field_key)
    table = _table(entity_type)
    stmt = (
        select(models.PhotoFile)
        .join(table.link_model, table.link_model.photo_file_id == models.PhotoFile.id)
        .where(table.entity_id_column == entity_id, table.link_model.field_key == field_key)
        .order_by(table.link_model.sort_order.asc(), models.PhotoFile.id.asc())
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def update_metadata(db: AsyncSession, photo_id: int, *, filename: str | None = None) -> models.PhotoFile:
    """Update editable photo metadata."""
    photo = await get_by_id(db, photo_id)
    if filename is not None:
        stripped = filename.strip()
        if not stripped:
            raise PhotoLinkError("Filename cannot be empty.")
        photo.filename = stripped[:256]
    await db.flush()
    return photo


async def delete(db: AsyncSession, photo_id: int) -> None:
    """Delete a photo, its chunks and all entity links."""
    await get_by_id(db, photo_id)
    for link_model in (models.VendorPhoto, models.FilamentPhoto, models.SpoolPhoto):
        await db.execute(sa.delete(link_model).where(link_model.photo_file_id == photo_id))
    await _delete_photo_rows(db, photo_id)


async def clear_field(db: AsyncSession, entity_type: EntityType, field_key: str) -> None:
    """Delete all photos linked to a removed photo extra field."""
    table = _table(entity_type)
    stmt = select(table.link_model.photo_file_id).where(table.link_model.field_key == field_key)
    photo_ids = list((await db.execute(stmt)).scalars().all())
    for photo_id in photo_ids:
        await delete(db, photo_id)


async def _photo_ids_from_extra(
    db: AsyncSession,
    entity_type: EntityType,
    extra: dict[str, str] | None,
) -> dict[str, list[int]]:
    if not extra:
        return {}
    settings = await get_photo_storage_settings(db)
    fields = await get_extra_fields(db, entity_type)
    photo_keys = {field.key for field in fields if field.field_type == ExtraFieldType.photo}
    result: dict[str, list[int]] = {}
    for key, raw_value in extra.items():
        if key not in photo_keys:
            continue
        try:
            parsed = json.loads(raw_value)
        except json.JSONDecodeError as exc:
            raise PhotoLinkError(f"Photo field {key} value is not valid JSON.") from exc
        if parsed is None:
            ids: list[int] = []
        elif isinstance(parsed, list) and all(isinstance(item, int) for item in parsed):
            ids = parsed
        else:
            raise PhotoLinkError(f"Photo field {key} value must be a list of photo IDs.")
        if len(ids) > settings.max_files_per_field:
            raise PhotoLinkError(f"A photo field can contain no more than {settings.max_files_per_field} photos.")
        result[key] = list(dict.fromkeys(ids))
    return result


async def validate_extra_photo_ids(
    db: AsyncSession,
    entity_type: EntityType,
    extra: dict[str, str] | None,
    *,
    entity_id: int | None = None,
) -> None:
    """Validate photo IDs passed inside extra field values before entity save."""
    photo_ids_by_key = await _photo_ids_from_extra(db, entity_type, extra)
    if not photo_ids_by_key:
        return
    if entity_id is None:
        for photo_ids in photo_ids_by_key.values():
            for photo_id in photo_ids:
                await get_by_id(db, photo_id)
                if await is_linked(db, photo_id):
                    raise PhotoLinkError(f"Photo {photo_id} is already linked and cannot be attached to a new entity.")
        return

    for key, photo_ids in photo_ids_by_key.items():
        await _validate_photo_field(db, entity_type, entity_id, key)
        await _assert_photos_can_be_linked(db, entity_type, entity_id, key, photo_ids)


async def apply_extra_photo_links(
    db: AsyncSession,
    entity_type: EntityType,
    entity_id: int,
    extra: dict[str, str] | None,
) -> None:
    """Attach photo IDs sent in photo extra fields to a saved entity."""
    photo_ids_by_key = await _photo_ids_from_extra(db, entity_type, extra)
    for key, photo_ids in photo_ids_by_key.items():
        await link_existing_photos(db, entity_type, entity_id, key, photo_ids, append=False)


async def delete_orphaned_older_than(db: AsyncSession, cutoff: datetime) -> int:
    """Delete photo files that have no entity links and are older than cutoff."""
    stmt = select(models.PhotoFile.id).where(models.PhotoFile.registered < cutoff).order_by(models.PhotoFile.id.asc())
    deleted = 0
    for photo_id in list((await db.execute(stmt)).scalars().all()):
        if not await is_linked(db, int(photo_id)):
            await _delete_photo_rows(db, int(photo_id))
            deleted += 1
    await db.flush()
    if deleted:
        logger.info("Deleted %d orphaned photo(s).", deleted)
    return deleted

"""Photo setting helpers."""

from __future__ import annotations

import datetime
import json
from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

from spoolman.database import setting as db_setting
from spoolman.exceptions import ItemNotFoundError
from spoolman.settings import parse_setting

DEFAULT_MAX_FILES_PER_FIELD = 5
DEFAULT_MAX_UPLOAD_SIZE_MB = 50
DEFAULT_CLEANUP_TIME = "03:30"
DEFAULT_CLEANUP_TTL_HOURS = 24
DEFAULT_ALLOWED_CONTENT_TYPES = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/tiff",
    "image/avif",
    "image/heic",
    "image/heif",
]


@dataclass(frozen=True, slots=True)
class PhotoStorageSettings:
    """Photo storage settings."""

    max_files_per_field: int
    max_upload_size_mb: int
    allowed_content_types: tuple[str, ...]
    orphan_cleanup_enabled: bool
    orphan_cleanup_time: datetime.time
    orphan_cleanup_ttl_hours: int

    @property
    def max_upload_size_bytes(self) -> int:
        """Return the upload size limit in bytes."""
        return self.max_upload_size_mb * 1024 * 1024

    @property
    def orphan_cleanup_ttl(self) -> datetime.timedelta:
        """Return the orphan cleanup age."""
        return datetime.timedelta(hours=self.orphan_cleanup_ttl_hours)


def _clamp_int(value: object, *, default: int, minimum: int, maximum: int) -> int:
    """Return an integer inside the allowed range."""
    if isinstance(value, bool):
        return default
    if isinstance(value, (int, float)):
        return max(minimum, min(maximum, int(value)))
    return default


def _normalize_content_types(value: object) -> tuple[str, ...]:
    """Return normalized image MIME types."""
    if not isinstance(value, list):
        return tuple(DEFAULT_ALLOWED_CONTENT_TYPES)
    result = []
    for item in value:
        if not isinstance(item, str):
            continue
        normalized = item.strip().lower()
        if normalized.startswith("image/") and normalized not in result:
            result.append(normalized)
    return tuple(result or DEFAULT_ALLOWED_CONTENT_TYPES)


def _parse_cleanup_time(value: object) -> datetime.time:
    """Return cleanup start time."""
    if not isinstance(value, str):
        value = DEFAULT_CLEANUP_TIME
    try:
        hour, minute = value.strip().split(":", 1)
        return datetime.time(hour=int(hour), minute=int(minute))
    except (TypeError, ValueError):
        return datetime.time(hour=3, minute=30)


async def _get_setting_value(db: AsyncSession, key: str) -> object:
    """Return a decoded setting value."""
    definition = parse_setting(key)
    try:
        db_item = await db_setting.get(db, definition)
        raw_value = db_item.value
    except ItemNotFoundError:
        raw_value = definition.default
    return json.loads(raw_value)


async def get_photo_storage_settings(db: AsyncSession) -> PhotoStorageSettings:
    """Return validated photo settings."""
    max_files = _clamp_int(
        await _get_setting_value(db, "photo_max_files_per_field"),
        default=DEFAULT_MAX_FILES_PER_FIELD,
        minimum=1,
        maximum=50,
    )
    max_upload_mb = _clamp_int(
        await _get_setting_value(db, "photo_max_upload_size_mb"),
        default=DEFAULT_MAX_UPLOAD_SIZE_MB,
        minimum=1,
        maximum=200,
    )
    cleanup_ttl_hours = _clamp_int(
        await _get_setting_value(db, "photo_orphan_cleanup_ttl_hours"),
        default=DEFAULT_CLEANUP_TTL_HOURS,
        minimum=1,
        maximum=24 * 365,
    )
    cleanup_enabled = await _get_setting_value(db, "photo_orphan_cleanup_enabled")
    content_types = _normalize_content_types(await _get_setting_value(db, "photo_allowed_content_types"))
    cleanup_time = _parse_cleanup_time(await _get_setting_value(db, "photo_orphan_cleanup_time"))
    return PhotoStorageSettings(
        max_files_per_field=max_files,
        max_upload_size_mb=max_upload_mb,
        allowed_content_types=content_types,
        orphan_cleanup_enabled=cleanup_enabled if isinstance(cleanup_enabled, bool) else True,
        orphan_cleanup_time=cleanup_time,
        orphan_cleanup_ttl_hours=cleanup_ttl_hours,
    )

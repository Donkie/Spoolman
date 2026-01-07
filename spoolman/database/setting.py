"""Helper functions for interacting with vendor database objects."""

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from spoolman.api.v1.models import EventType, SettingEvent, SettingKV
from spoolman.database import models
from spoolman.exceptions import ItemNotFoundError
from spoolman.settings import SettingDefinition
from spoolman.ws import websocket_manager

SETTING_MAX_LENGTH = 2**16 - 1


async def update(
    *,
    db: AsyncSession,
    definition: SettingDefinition,
    value: str,
) -> None:
    """Set a setting in the database."""
    if len(value) > SETTING_MAX_LENGTH:
        raise ValueError(f"Setting value is too big, max size is {SETTING_MAX_LENGTH} characters.")

    setting = models.Setting(
        key=definition.key,
        value=value,
        last_updated=datetime.utcnow().replace(microsecond=0),
    )
    await db.merge(setting)
    await setting_changed(definition, value, EventType.UPDATED)


async def get(db: AsyncSession, definition: SettingDefinition) -> models.Setting:
    """Get a specific setting from the database."""
    setting = await db.get(models.Setting, definition.key)
    if setting is None:
        raise ItemNotFoundError(f"Setting with key {definition.key} has not been set.")
    return setting


async def get_all(db: AsyncSession) -> list[models.Setting]:
    """Get all set settings in the database."""
    stmt = select(models.Setting)
    rows = await db.execute(stmt)
    return list(rows.scalars().all())


async def delete(db: AsyncSession, definition: SettingDefinition) -> None:
    """Delete a setting from the database."""
    setting = await get(db, definition)
    await db.delete(setting)
    await setting_changed(definition, None, EventType.DELETED)


async def setting_changed(definition: SettingDefinition, set_value: str | None, typ: EventType) -> None:
    """Notify websocket clients that a setting has changed."""
    await websocket_manager.send(
        ("setting", str(definition.key)),
        SettingEvent(
            type=typ,
            resource="setting",
            date=datetime.utcnow(),
            payload=SettingKV.from_db(definition, set_value),
        ),
    )

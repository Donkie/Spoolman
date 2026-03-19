"""Optional application capabilities that can be enabled per entity type."""

import json
import logging
from enum import Enum

from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from spoolman.database import setting as db_setting
from spoolman.exceptions import ItemNotFoundError
from spoolman.extra_fields import EntityType
from spoolman.settings import parse_setting

logger = logging.getLogger(__name__)


class ApplicationSurface(Enum):
    """UI surfaces that an application can extend."""

    show = "show"
    edit = "edit"
    list = "list"
    action = "action"
    derived = "derived"


class ApplicationDefinition(BaseModel):
    """Code-defined description for an optional application capability."""

    key: str = Field(description="Unique key", pattern="^[a-z0-9_]+$", min_length=1, max_length=64)
    app_key: str | None = Field(
        default=None, description="Groups multi-entity registrations under one app (defaults to key)"
    )
    icon: str | None = Field(default=None, description="Emoji icon shown in the applications catalog (e.g. '🔔')")
    entity_type: EntityType = Field(description="Entity type this application is for")
    name: str = Field(description="Display name", min_length=1, max_length=128)
    description: str = Field(description="Short description", min_length=1, max_length=512)
    enable_description: str = Field(description="What enabling adds", min_length=1, max_length=512)
    surfaces: list[ApplicationSurface] = Field(
        default_factory=list, description="Surfaces affected by this application"
    )


class ApplicationState(ApplicationDefinition):
    """Application definition with its current enabled state."""

    enabled: bool = Field(description="Whether the application is enabled")


class ApplicationToggleRequest(BaseModel):
    """Request body for enabling or disabling an application."""

    enabled: bool = Field(description="Whether the application should be enabled")


_application_registry: dict[EntityType, list[ApplicationDefinition]] = {entity_type: [] for entity_type in EntityType}
_application_cache: dict[EntityType, list[str]] = {}


def register_application(application: ApplicationDefinition) -> None:
    """Register an application definition for future use."""
    existing = _application_registry[application.entity_type]
    if any(app.key == application.key for app in existing):
        raise ValueError(f"Application {application.key} is already registered for {application.entity_type.name}.")
    existing.append(application)
    existing.sort(key=lambda item: (item.name.lower(), item.key))


def get_registered_applications(entity_type: EntityType) -> list[ApplicationDefinition]:
    """Get all registered application definitions for an entity type."""
    return list(_application_registry[entity_type])


async def get_enabled_application_keys(db: AsyncSession, entity_type: EntityType) -> list[str]:
    """Get the enabled application keys for an entity type."""
    if entity_type in _application_cache:
        return _application_cache[entity_type]

    setting_def = parse_setting(f"applications_{entity_type.name}")
    try:
        setting = await db_setting.get(db, setting_def)
        setting_value = setting.value
    except ItemNotFoundError:
        setting_value = setting_def.default

    parsed = json.loads(setting_value)
    if not isinstance(parsed, list):
        logger.warning("Setting %s is not a list, using default.", setting_def.key)
        parsed = []

    enabled_keys = [value for value in parsed if isinstance(value, str)]
    _application_cache[entity_type] = enabled_keys
    return enabled_keys


async def get_applications(db: AsyncSession, entity_type: EntityType) -> list[ApplicationState]:
    """Get all registered applications for an entity type, including enabled state."""
    enabled_keys = set(await get_enabled_application_keys(db, entity_type))
    return [
        ApplicationState.model_validate(
            {
                **jsonable_encoder(definition),
                "enabled": definition.key in enabled_keys,
            },
        )
        for definition in get_registered_applications(entity_type)
    ]


async def set_application_enabled(db: AsyncSession, entity_type: EntityType, key: str, *, enabled: bool) -> None:
    """Enable or disable a registered application for an entity type."""
    registered = get_registered_applications(entity_type)
    if not any(app.key == key for app in registered):
        raise ItemNotFoundError(f"Application with key {key} does not exist.")

    enabled_keys = await get_enabled_application_keys(db, entity_type)
    next_keys = [value for value in enabled_keys if value != key]
    if enabled:
        next_keys.append(key)
    next_keys = sorted(set(next_keys))

    setting_def = parse_setting(f"applications_{entity_type.name}")
    await db_setting.update(db=db, definition=setting_def, value=json.dumps(next_keys))
    _application_cache[entity_type] = next_keys

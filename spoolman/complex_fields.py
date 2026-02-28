"""Code-defined complex field capabilities that can be enabled per entity type."""

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


class ComplexFieldSurface(Enum):
    """UI surfaces that a complex field can extend."""

    show = "show"
    edit = "edit"
    list = "list"
    action = "action"
    derived = "derived"


class ComplexFieldDefinition(BaseModel):
    """Code-defined description for a complex field capability."""

    key: str = Field(description="Unique key", pattern="^[a-z0-9_]+$", min_length=1, max_length=64)
    entity_type: EntityType = Field(description="Entity type this complex field is for")
    name: str = Field(description="Display name", min_length=1, max_length=128)
    description: str = Field(description="Short description", min_length=1, max_length=512)
    enable_description: str = Field(description="What enabling adds", min_length=1, max_length=512)
    surfaces: list[ComplexFieldSurface] = Field(default_factory=list, description="Surfaces affected by this feature")


class ComplexFieldState(ComplexFieldDefinition):
    """Complex field definition with its current enabled state."""

    enabled: bool = Field(description="Whether the complex field is enabled")


class ComplexFieldToggleRequest(BaseModel):
    """Request body for enabling or disabling a complex field."""

    enabled: bool = Field(description="Whether the complex field should be enabled")


_complex_field_registry: dict[EntityType, list[ComplexFieldDefinition]] = {entity_type: [] for entity_type in EntityType}
_complex_field_cache: dict[EntityType, list[str]] = {}


def register_complex_field(complex_field: ComplexFieldDefinition) -> None:
    """Register a complex field definition for future use."""
    existing = _complex_field_registry[complex_field.entity_type]
    if any(field.key == complex_field.key for field in existing):
        raise ValueError(f"Complex field {complex_field.key} is already registered for {complex_field.entity_type.name}.")
    existing.append(complex_field)
    existing.sort(key=lambda item: (item.name.lower(), item.key))


def get_registered_complex_fields(entity_type: EntityType) -> list[ComplexFieldDefinition]:
    """Get all registered complex field definitions for an entity type."""
    return list(_complex_field_registry[entity_type])


async def get_enabled_complex_field_keys(db: AsyncSession, entity_type: EntityType) -> list[str]:
    """Get the enabled complex field keys for an entity type."""
    if entity_type in _complex_field_cache:
        return _complex_field_cache[entity_type]

    setting_def = parse_setting(f"complex_fields_{entity_type.name}")
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
    _complex_field_cache[entity_type] = enabled_keys
    return enabled_keys


async def get_complex_fields(db: AsyncSession, entity_type: EntityType) -> list[ComplexFieldState]:
    """Get all registered complex fields for an entity type, including enabled state."""
    enabled_keys = set(await get_enabled_complex_field_keys(db, entity_type))
    return [
        ComplexFieldState.model_validate(
            {
                **jsonable_encoder(definition),
                "enabled": definition.key in enabled_keys,
            },
        )
        for definition in get_registered_complex_fields(entity_type)
    ]


async def set_complex_field_enabled(db: AsyncSession, entity_type: EntityType, key: str, enabled: bool) -> None:
    """Enable or disable a registered complex field for an entity type."""
    registered = get_registered_complex_fields(entity_type)
    if not any(field.key == key for field in registered):
        raise ItemNotFoundError(f"Complex field with key {key} does not exist.")

    enabled_keys = await get_enabled_complex_field_keys(db, entity_type)
    next_keys = [value for value in enabled_keys if value != key]
    if enabled:
        next_keys.append(key)
    next_keys = sorted(set(next_keys))

    setting_def = parse_setting(f"complex_fields_{entity_type.name}")
    await db_setting.update(db=db, definition=setting_def, value=json.dumps(next_keys))
    _complex_field_cache[entity_type] = next_keys


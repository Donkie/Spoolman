"""Custom/extra fields for spoolman entities."""

import json
import logging
from enum import Enum
from typing import Optional

from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from spoolman.database import filament as db_filament
from spoolman.database import setting as db_setting
from spoolman.database import spool as db_spool
from spoolman.database import vendor as db_vendor
from spoolman.exceptions import ItemNotFoundError
from spoolman.settings import parse_setting

logger = logging.getLogger(__name__)


class EntityType(Enum):
    vendor = "vendor"
    filament = "filament"
    spool = "spool"


class ExtraFieldType(Enum):
    text = "text"
    integer = "integer"
    integer_range = "integer_range"
    float = "float"
    float_range = "float_range"
    datetime = "datetime"
    boolean = "boolean"
    choice = "choice"


class ExtraFieldParameters(BaseModel):
    name: str = Field(description="Nice name", min_length=1, max_length=128)
    order: int = Field(0, description="Order of the field")
    unit: Optional[str] = Field(None, description="Unit of the value", min_length=1, max_length=16)
    field_type: ExtraFieldType = Field(description="Type of the field")
    default_value: Optional[str] = Field(None, description="Default value of the field")
    choices: Optional[list[str]] = Field(
        None,
        description="Choices for the field, only for field type choice",
        min_items=1,
    )
    multi_choice: Optional[bool] = Field(None, description="Whether multiple choices can be selected")


class ExtraField(ExtraFieldParameters):
    key: str = Field(description="Unique key", regex="^[a-z0-9_]+$", min_length=1, max_length=64)
    entity_type: EntityType = Field(description="Entity type this field is for")


def validate_extra_field_value(field: ExtraFieldParameters, value: str) -> None:  # noqa: C901, PLR0912
    """Validate that the value has the correct type."""
    try:
        data = json.loads(value)
    except json.JSONDecodeError:
        raise ValueError("Value is not valid JSON.") from None

    if field.field_type == ExtraFieldType.text:
        if not isinstance(data, str):
            raise ValueError("Value is not a string.")
    elif field.field_type == ExtraFieldType.integer:
        if not isinstance(data, int):
            raise ValueError("Value is not an integer.")
    elif field.field_type == ExtraFieldType.integer_range:
        if not isinstance(data, list):
            raise ValueError("Value is not a list.")
        if len(data) != 2:  # noqa: PLR2004
            raise ValueError("Value list must have exactly two values.")
        if not all(isinstance(value, int) for value in data):
            raise ValueError("Value list must contain only integers.")
    elif field.field_type == ExtraFieldType.float:
        if not isinstance(data, (float, int)) or isinstance(data, bool):
            raise ValueError("Value is not a float.")
    elif field.field_type == ExtraFieldType.float_range:
        if not isinstance(data, list):
            raise ValueError("Value is not a list.")
        if len(data) != 2:  # noqa: PLR2004
            raise ValueError("Value list must have exactly two values.")
        if not all(isinstance(value, (float, int)) and not isinstance(value, bool) for value in data):
            raise ValueError("Value list must contain only floats.")
    elif field.field_type == ExtraFieldType.datetime:
        if not isinstance(data, str):
            raise ValueError("Value is not a string.")
    elif field.field_type == ExtraFieldType.boolean:
        if not isinstance(data, bool):
            raise ValueError("Value is not a boolean.")
    elif field.field_type == ExtraFieldType.choice:
        if field.multi_choice:
            if not isinstance(data, list):
                raise ValueError("Value is not a list.")
            if not all(isinstance(value, str) for value in data):
                raise ValueError("Value list must contain only strings.")
            if field.choices is not None and not all(value in field.choices for value in data):
                raise ValueError("Value list contains invalid choices.")
        else:
            if not isinstance(data, str):
                raise ValueError("Value is not a string.")
            if field.choices is not None and data not in field.choices:
                raise ValueError("Value is not a valid choice.")
    else:
        raise ValueError(f"Unknown field type {field.field_type}.")


def validate_extra_field(field: ExtraFieldParameters) -> None:
    """Validate an extra field."""
    # Validate choices exist if field type is choice
    if field.field_type == ExtraFieldType.choice:
        if field.choices is None:
            raise ValueError("Choices must be set for field type choice.")
        if field.multi_choice is None:
            raise ValueError("Multi choice must be set for field type choice.")
    else:
        if field.choices is not None:
            raise ValueError("Choices must not be set for field type other than choice.")
        if field.multi_choice is not None:
            raise ValueError("Multi choice must not be set for field type other than choice.")

    # Validate default value data type
    if field.default_value is not None:
        try:
            validate_extra_field_value(field, field.default_value)
        except ValueError as e:
            raise ValueError(f"Default value is not valid: {e}") from None


def validate_extra_field_dict(all_fields: list[ExtraField], fields_input: dict[str, str]) -> None:
    """Validate a dict of extra fields."""
    all_field_lookup = {field.key: field for field in all_fields}
    for key, value in fields_input.items():
        if key not in all_field_lookup:
            raise ValueError(f"Unknown extra field {key}.")
        field = all_field_lookup[key]
        try:
            validate_extra_field_value(field, value)
        except ValueError as e:
            raise ValueError(f"Invalid extra field for key {key}: {e!s}") from None


extra_field_cache = {}


async def get_extra_fields(db: AsyncSession, entity_type: EntityType) -> list[ExtraField]:
    """Get all extra fields for a specific entity type."""
    if entity_type in extra_field_cache:
        return extra_field_cache[entity_type]

    setting_def = parse_setting(f"extra_fields_{entity_type.name}")
    try:
        setting = await db_setting.get(db, setting_def)
        setting_value = setting.value
    except ItemNotFoundError:
        setting_value = setting_def.default

    setting_array = json.loads(setting_value)
    if not isinstance(setting_array, list):
        logger.warning("Setting %s is not a list, using default.", setting_def.key)
        setting_array = []

    fields = [ExtraField.parse_obj(obj) for obj in setting_array]
    extra_field_cache[entity_type] = fields
    return fields


async def add_or_update_extra_field(db: AsyncSession, entity_type: EntityType, extra_field: ExtraField) -> None:
    """Add or update an extra field for a specific entity type."""
    validate_extra_field(extra_field)

    extra_fields = await get_extra_fields(db, entity_type)

    # If the field already exists, verify that we don't do anything that would break existing data
    existing_field = next((field for field in extra_fields if field.key == extra_field.key), None)
    if existing_field is not None:
        if existing_field.field_type != extra_field.field_type:
            raise ValueError("Field type cannot be changed.")
        if extra_field.field_type == ExtraFieldType.choice:
            # Can't change multi choice since that would break existing data
            if existing_field.multi_choice != extra_field.multi_choice:
                raise ValueError("Multi choice cannot be changed.")

            # Verify that we have only added new choices, not removed any
            if (
                existing_field.choices is not None
                and extra_field.choices is not None
                and not all(choice in extra_field.choices for choice in existing_field.choices)
            ):
                raise ValueError("Cannot remove existing choices.")

    extra_fields = [field for field in extra_fields if field.key != extra_field.key]
    extra_fields.append(extra_field)

    setting_def = parse_setting(f"extra_fields_{entity_type.name}")
    await db_setting.update(db=db, definition=setting_def, value=json.dumps(jsonable_encoder(extra_fields)))

    # Update cache
    extra_field_cache[entity_type] = extra_fields

    logger.info("Added/updated extra field %s for entity type %s.", extra_field.key, entity_type.name)


async def delete_extra_field(db: AsyncSession, entity_type: EntityType, key: str) -> None:
    """Delete an extra field for a specific entity type."""
    extra_fields = await get_extra_fields(db, entity_type)

    # Check if the field exists
    if not any(field.key == key for field in extra_fields):
        raise ItemNotFoundError(f"Extra field with key {key} does not exist.")

    extra_fields = [field for field in extra_fields if field.key != key]

    setting_def = parse_setting(f"extra_fields_{entity_type.name}")
    await db_setting.update(db=db, definition=setting_def, value=json.dumps(jsonable_encoder(extra_fields)))

    # Update cache
    extra_field_cache[entity_type] = extra_fields

    # Delete the extra field for all entities
    if entity_type == EntityType.vendor:
        await db_vendor.clear_extra_field(db, key)
    elif entity_type == EntityType.filament:
        await db_filament.clear_extra_field(db, key)
    elif entity_type == EntityType.spool:
        await db_spool.clear_extra_field(db, key)
    else:
        raise ValueError(f"Unknown entity type {entity_type.name}.")

    logger.info("Deleted extra field %s for entity type %s.", key, entity_type.name)


async def populate_with_defaults(db: AsyncSession, entity_type: EntityType, existing: dict[str, str]) -> None:
    """Populate the given list of extra fields with defaults."""
    extra_fields = await get_extra_fields(db, entity_type)
    for extra_field in extra_fields:
        if extra_field.default_value is None:
            continue
        if extra_field.key in existing:
            continue
        existing[extra_field.key] = extra_field.default_value

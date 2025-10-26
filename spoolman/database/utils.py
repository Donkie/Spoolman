"""Utility functions for the database module."""

from collections.abc import Sequence
import json
from enum import Enum
from typing import Any, Dict, Tuple, Type, TypeVar

import sqlalchemy
from sqlalchemy import Select, and_, cast, func, or_, text
from sqlalchemy.orm import attributes, aliased
from sqlalchemy.sql import expression

from spoolman.database import models
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from spoolman.extra_fields import EntityType, ExtraField, ExtraFieldType


class SortOrder(Enum):
    ASC = 1
    DESC = 2


def parse_nested_field(base_obj: type[models.Base], field: str) -> attributes.InstrumentedAttribute[Any]:
    """Parse a nested field string into a sqlalchemy field object."""
    fields = field.split(".")
    if not hasattr(base_obj, fields[0]):
        raise ValueError(f"Invalid field name '{field}', '{fields[0]}' is not a valid field on '{base_obj.__name__}'.")

    if fields[0] == "filament" and len(fields) == 1:
        raise ValueError("No field specified for filament")
    if fields[0] == "filament":
        return parse_nested_field(models.Filament, ".".join(fields[1:]))

    if fields[0] == "vendor" and len(fields) == 1:
        raise ValueError("No field specified for vendor")
    if fields[0] == "vendor":
        return parse_nested_field(models.Vendor, ".".join(fields[1:]))

    if len(fields) > 1:
        raise ValueError(f"Field '{fields[0]}' does not have any nested fields")

    return getattr(base_obj, fields[0])


def add_where_clause_str_opt(
    stmt: Select,
    field: attributes.InstrumentedAttribute[str | None],
    value: str | None,
) -> Select:
    """Add a where clause to a select statement for an optional string field."""
    if value is not None:
        conditions = []
        for value_part in value.split(","):
            # If part is empty, search for empty fields
            if len(value_part) == 0:
                conditions.append(field.is_(None))
                conditions.append(field == "")
            # Do exact match if value_part is surrounded by quotes
            elif value_part[0] == '"' and value_part[-1] == '"':
                conditions.append(field == value_part[1:-1])
            # Do fuzzy match if value_part is not surrounded by quotes
            else:
                conditions.append(field.ilike(f"%{value_part}%"))

        stmt = stmt.where(sqlalchemy.or_(*conditions))
    return stmt


def add_where_clause_str(
    stmt: Select,
    field: attributes.InstrumentedAttribute[str],
    value: str | None,
) -> Select:
    """Add a where clause to a select statement for a string field."""
    if value is not None:
        conditions = []
        for value_part in value.split(","):
            # If part is empty, search for empty fields
            if len(value_part) == 0:
                conditions.append(field == "")
            # Do exact match if value_part is surrounded by quotes
            elif value_part[0] == '"' and value_part[-1] == '"':
                conditions.append(field == value_part[1:-1])
            # Do fuzzy match if value_part is not surrounded by quotes
            else:
                conditions.append(field.ilike(f"%{value_part}%"))

        stmt = stmt.where(sqlalchemy.or_(*conditions))
    return stmt


def add_where_clause_int(
    stmt: Select,
    field: attributes.InstrumentedAttribute[int],
    value: int | Sequence[int] | None,
) -> Select:
    """Add a where clause to a select statement for a field."""
    if value is not None:
        if isinstance(value, int):
            value = [value]
        stmt = stmt.where(field.in_(value))
    return stmt


def add_where_clause_int_opt(
    stmt: Select,
    field: attributes.InstrumentedAttribute[int | None],
    value: int | Sequence[int] | None,
) -> Select:
    """Add a where clause to a select statement for a field."""
    if value is not None:
        if isinstance(value, int):
            value = [value]
        statements = []
        for value_part in value:
            if value_part == -1:
                statements.append(field.is_(None))
            else:
                statements.append(field == value_part)
        stmt = stmt.where(sqlalchemy.or_(*statements))
    return stmt


T = TypeVar("T")


def add_where_clause_int_in(
    stmt: Select,
    field: attributes.InstrumentedAttribute[T],
    value: Sequence[T] | None,
) -> Select:
    """Add a where clause to a select statement for a field."""
    if value is not None:
        stmt = stmt.where(field.in_(value))
    return stmt


def get_field_table_for_entity(entity_type: Any) -> Type[models.Base]:
    """Get the field table class for a given entity type."""
    # Import here to avoid circular imports
    from spoolman.extra_fields import EntityType
    
    if entity_type == EntityType.spool:
        return models.SpoolField
    elif entity_type == EntityType.filament:
        return models.FilamentField
    elif entity_type == EntityType.vendor:
        return models.VendorField
    else:
        raise ValueError(f"Unknown entity type: {entity_type}")


def get_entity_id_column(field_table: Type[models.Base]) -> attributes.InstrumentedAttribute[int]:
    """Get the entity ID column for a given field table."""
    if field_table == models.SpoolField:
        return models.SpoolField.spool_id
    elif field_table == models.FilamentField:
        return models.FilamentField.filament_id
    elif field_table == models.VendorField:
        return models.VendorField.vendor_id
    else:
        raise ValueError(f"Unknown field table: {field_table}")


def add_where_clause_extra_field(
    stmt: Select,
    base_obj: Type[models.Base],
    entity_type: Any,
    field_key: str,
    field_type: Any,
    value: str,
    multi_choice: bool | None = None,
) -> Select:
    """Add a where clause to a select statement for an extra field.
    Args:
        stmt: The select statement to add the where clause to
        base_obj: The base object type (Spool, Filament, Vendor)
        entity_type: The entity type
        field_key: The key of the extra field
        field_type: The type of the extra field
        value: The value to filter by
        multi_choice: Whether the field is a multi-choice field (only for choice fields)
    Returns:
        The modified select statement
    """
    # Import here to avoid circular imports
    from spoolman.extra_fields import ExtraFieldType

    field_table = get_field_table_for_entity(entity_type)
    entity_id_column = get_entity_id_column(field_table)

    value_parts = value.split(",")

    # Handle filtering for empty values
    if any(p == "<empty>" or len(p) == 0 for p in value_parts):
        # An item is considered "empty" if:
        # A) A row exists in the field table, and its value is null, 'null', or 'false' for booleans.
        # B) No row exists in the field table for this item and field_key.

        # Condition A subquery
        empty_conditions = [
            field_table.value.is_(None),
            field_table.value == "null",
        ]
        if field_type == ExtraFieldType.boolean:
            empty_conditions.append(field_table.value == json.dumps(False))

        subq_a = sqlalchemy.select(entity_id_column).where(
            sqlalchemy.and_(field_table.key == field_key, sqlalchemy.or_(*empty_conditions))
        )

        # Condition B subquery
        subq_b = sqlalchemy.select(base_obj.id).where(
            getattr(base_obj, "id").not_in(sqlalchemy.select(entity_id_column).where(field_table.key == field_key))
        )

        return stmt.where(
            sqlalchemy.or_(
                getattr(base_obj, "id").in_(subq_a),
                getattr(base_obj, "id").in_(subq_b),
            )
        )

    # Handle filtering for specific values
    conditions = []
    for value_part in value_parts:
        exact_match = value_part.startswith('"') and value_part.endswith('"')
        if exact_match:
            value_part = value_part[1:-1]

        if field_type == ExtraFieldType.text:
            if exact_match:
                conditions.append(field_table.value == json.dumps(value_part))
            else:
                conditions.append(field_table.value.ilike(f"%{value_part}%"))
        elif field_type == ExtraFieldType.integer:
            try:
                conditions.append(field_table.value == json.dumps(int(value_part)))
            except ValueError:
                pass
        elif field_type == ExtraFieldType.float:
            try:
                conditions.append(field_table.value == json.dumps(float(value_part)))
            except ValueError:
                pass
        elif field_type == ExtraFieldType.boolean:
            bool_value = value_part.lower() in ("true", "1", "yes")
            conditions.append(field_table.value == json.dumps(bool_value))
        elif field_type == ExtraFieldType.choice:
            if multi_choice:
                conditions.append(field_table.value.like(f'%"{value_part}"%'))
            else:
                conditions.append(field_table.value == json.dumps(value_part))
        elif field_type == ExtraFieldType.datetime:
            conditions.append(field_table.value == json.dumps(value_part))
        elif field_type in (ExtraFieldType.integer_range, ExtraFieldType.float_range):
            if ":" in value_part:
                min_val_str, max_val_str = value_part.split(":", 1)
                converter = int if field_type == ExtraFieldType.integer_range else float
                try:
                    if min_val_str:
                        conditions.append(func.json_extract(field_table.value, "$[0]") >= converter(min_val_str))
                    if max_val_str:
                        conditions.append(func.json_extract(field_table.value, "$[1]") <= converter(max_val_str))
                except (ValueError, TypeError):
                    pass

    if not conditions:
        return stmt

    subq = sqlalchemy.select(entity_id_column).where(
        sqlalchemy.and_(field_table.key == field_key, sqlalchemy.or_(*conditions))
    )

    return stmt.where(getattr(base_obj, "id").in_(subq))


def add_order_by_extra_field(
    stmt: Select,
    base_obj: Type[models.Base],
    entity_type: Any,
    field_key: str,
    field_type: Any,
    order: SortOrder,
) -> Select:
    """Add an order by clause to a select statement for an extra field.
    
    Args:
        stmt: The select statement to add the order by clause to
        base_obj: The base object type (Spool, Filament, Vendor)
        entity_type: The entity type
        field_key: The key of the extra field
        field_type: The type of the extra field
        order: The sort order
        
    Returns:
        The modified select statement
    """
    # Import here to avoid circular imports
    from spoolman.extra_fields import EntityType, ExtraFieldType
    
    # Use a subquery approach instead of joins
    field_table = get_field_table_for_entity(entity_type)
    entity_id_column = get_entity_id_column(field_table)
    
    # Create a subquery that selects the value for each entity
    value_subq = (
        sqlalchemy.select(field_table.value)
        .where(
            sqlalchemy.and_(
                field_table.key == field_key,
                entity_id_column == getattr(base_obj, "id")
            )
        )
        .scalar_subquery()
        .correlate(base_obj)
    )
    
    # Create a sort expression based on the field type
    if field_type == ExtraFieldType.integer:
        # Cast the JSON value to an integer for sorting
        sort_expr = func.cast(func.json_extract(value_subq, '$'), sqlalchemy.Integer)
    elif field_type == ExtraFieldType.float:
        # Cast the JSON value to a float for sorting
        sort_expr = func.cast(func.json_extract(value_subq, '$'), sqlalchemy.Float)
    elif field_type == ExtraFieldType.datetime:
        # For datetime fields, we can sort by the ISO string
        sort_expr = value_subq
    elif field_type == ExtraFieldType.boolean:
        # For boolean fields, true comes after false
        sort_expr = value_subq
    elif field_type in (ExtraFieldType.integer_range, ExtraFieldType.float_range):
        # For range fields, sort by the first value in the range
        sort_expr = func.json_extract(value_subq, '$[0]')
    else:
        # For text and choice fields, sort by the string value
        sort_expr = value_subq
    
    # Apply the sort order
    if order == SortOrder.ASC:
        stmt = stmt.order_by(sort_expr.asc())
    else:
        stmt = stmt.order_by(sort_expr.desc())
    
    return stmt

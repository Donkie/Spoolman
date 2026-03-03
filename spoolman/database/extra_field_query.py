"""Helpers for filtering and sorting extra fields."""

import json
from typing import Any

import sqlalchemy
from sqlalchemy import Select
from sqlalchemy.orm import attributes

from spoolman.database import models
from spoolman.database.utils import SortOrder


def _get_field_table_for_entity(entity_type: Any) -> type[models.Base]:
    """Get the field table class for a given entity type."""
    # Import here to avoid circular imports.
    from spoolman.extra_fields import EntityType

    if entity_type == EntityType.spool:
        return models.SpoolField
    if entity_type == EntityType.filament:
        return models.FilamentField
    if entity_type == EntityType.vendor:
        return models.VendorField
    raise ValueError(f"Unknown entity type: {entity_type}")


def _get_entity_id_column(field_table: type[models.Base]) -> attributes.InstrumentedAttribute[int]:
    """Get the entity ID column for a given field table."""
    if field_table == models.SpoolField:
        return models.SpoolField.spool_id
    if field_table == models.FilamentField:
        return models.FilamentField.filament_id
    if field_table == models.VendorField:
        return models.VendorField.vendor_id
    raise ValueError(f"Unknown field table: {field_table}")


def add_where_clause_extra_field(
    stmt: Select,
    base_obj: type[models.Base],
    entity_type: Any,
    field_key: str,
    field_type: Any,
    value: str,
    multi_choice: bool | None = None,
) -> Select:
    """Add a where clause to a select statement for an extra field."""
    # Import here to avoid circular imports.
    from spoolman.extra_fields import ExtraFieldType

    field_table = _get_field_table_for_entity(entity_type)
    entity_id_column = _get_entity_id_column(field_table)
    value_parts = value.split(",")

    # An item is considered "empty" if:
    # A) the row exists and value is null/'null' (or false for bool), or
    # B) no row exists for this item + key.
    if any(part == "<empty>" or len(part) == 0 for part in value_parts):
        empty_conditions = [
            field_table.value.is_(None),
            field_table.value == "null",
        ]
        if field_type == ExtraFieldType.boolean:
            empty_conditions.append(field_table.value == json.dumps(False))

        subq_a = sqlalchemy.select(entity_id_column).where(
            sqlalchemy.and_(field_table.key == field_key, sqlalchemy.or_(*empty_conditions))
        )
        subq_b = sqlalchemy.select(base_obj.id).where(
            getattr(base_obj, "id").not_in(sqlalchemy.select(entity_id_column).where(field_table.key == field_key))
        )
        return stmt.where(
            sqlalchemy.or_(
                getattr(base_obj, "id").in_(subq_a),
                getattr(base_obj, "id").in_(subq_b),
            )
        )

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
        elif field_type in (ExtraFieldType.integer_range, ExtraFieldType.float_range) and ":" in value_part:
            min_val_str, max_val_str = value_part.split(":", 1)
            converter = int if field_type == ExtraFieldType.integer_range else float
            try:
                if min_val_str:
                    conditions.append(field_table.value[0].as_integer() >= converter(min_val_str))
                if max_val_str:
                    conditions.append(field_table.value[1].as_integer() <= converter(max_val_str))
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
    base_obj: type[models.Base],
    entity_type: Any,
    field_key: str,
    field_type: Any,
    order: SortOrder,
) -> Select:
    """Add an order-by clause to a select statement for an extra field."""
    # Import here to avoid circular imports.
    from spoolman.extra_fields import ExtraFieldType

    field_table = _get_field_table_for_entity(entity_type)
    entity_id_column = _get_entity_id_column(field_table)

    value_subq = (
        sqlalchemy.select(field_table.value)
        .where(
            sqlalchemy.and_(
                field_table.key == field_key,
                entity_id_column == getattr(base_obj, "id"),
            )
        )
        .scalar_subquery()
        .correlate(base_obj)
    )

    if field_type == ExtraFieldType.integer:
        sort_expr = sqlalchemy.cast(value_subq, sqlalchemy.Integer)
    elif field_type == ExtraFieldType.float:
        sort_expr = sqlalchemy.cast(value_subq, sqlalchemy.Float)
    elif field_type in (ExtraFieldType.integer_range, ExtraFieldType.float_range):
        # Range columns need a stable scalar sort key; using the low-end keeps similar
        # ranges grouped predictably without inventing a second synthetic value.
        sort_expr = value_subq[0]
    else:
        sort_expr = value_subq

    if order == SortOrder.ASC:
        return stmt.order_by(sort_expr.asc())
    return stmt.order_by(sort_expr.desc())

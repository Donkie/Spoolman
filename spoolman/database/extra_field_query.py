"""Helpers for filtering and sorting extra fields."""

from __future__ import annotations

import json
from typing import TYPE_CHECKING

import sqlalchemy
from sqlalchemy import Select
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.sql.expression import FunctionElement

from spoolman.database import models
from spoolman.database.utils import SortOrder
from spoolman.extra_field_registry import EntityType, ExtraField, ExtraFieldType, get_extra_fields

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession
    from sqlalchemy.orm.attributes import InstrumentedAttribute


class _JsonArrayFirstElement(FunctionElement):
    """Cross-database helper: return the first element of a JSON array stored as text."""

    name = "json_array_first_element"
    inherit_cache = True


@compiles(_JsonArrayFirstElement, "postgresql")
def _compile_json_array_first_pg(element: _JsonArrayFirstElement, compiler: object, **kw: object) -> str:  # type: ignore[misc]
    """PostgreSQL: CAST(value AS JSON)->>'0' returns the first element as TEXT."""
    (col_expr,) = element.clauses
    col_sql = compiler.process(col_expr, **kw)  # type: ignore[union-attr]
    return f"(CAST({col_sql} AS JSON)->>0)"


@compiles(_JsonArrayFirstElement)
def _compile_json_array_first_default(element: _JsonArrayFirstElement, compiler: object, **kw: object) -> str:  # type: ignore[misc]
    """SQLite/MariaDB: json_extract(value, '$[0]') returns the first element as a scalar."""
    (col_expr,) = element.clauses
    col_sql = compiler.process(col_expr, **kw)  # type: ignore[union-attr]
    return f"JSON_EXTRACT({col_sql}, '$[0]')"


class _JsonArraySecondElement(FunctionElement):
    """Cross-database helper: return the second element of a JSON array stored as text."""

    name = "json_array_second_element"
    inherit_cache = True


@compiles(_JsonArraySecondElement, "postgresql")
def _compile_json_array_second_pg(element: _JsonArraySecondElement, compiler: object, **kw: object) -> str:  # type: ignore[misc]
    """PostgreSQL: CAST(value AS JSON)->>'1' returns the second element as TEXT."""
    (col_expr,) = element.clauses
    col_sql = compiler.process(col_expr, **kw)  # type: ignore[union-attr]
    return f"(CAST({col_sql} AS JSON)->>1)"


@compiles(_JsonArraySecondElement)
def _compile_json_array_second_default(element: _JsonArraySecondElement, compiler: object, **kw: object) -> str:  # type: ignore[misc]
    """SQLite/MariaDB: json_extract(value, '$[1]') returns the second element as a scalar."""
    (col_expr,) = element.clauses
    col_sql = compiler.process(col_expr, **kw)  # type: ignore[union-attr]
    return f"JSON_EXTRACT({col_sql}, '$[1]')"


def _get_field_table_for_entity(entity_type: EntityType) -> type[models.Base]:
    """Map an entity type to its extra-field table."""
    if entity_type == EntityType.spool:
        return models.SpoolField
    if entity_type == EntityType.filament:
        return models.FilamentField
    if entity_type == EntityType.vendor:
        return models.VendorField
    raise ValueError(f"Unknown entity type: {entity_type}")


def _get_entity_id_column(field_table: type[models.Base]) -> InstrumentedAttribute[int]:
    """Map an extra-field table to its owning entity id column."""
    if field_table == models.SpoolField:
        return models.SpoolField.spool_id
    if field_table == models.FilamentField:
        return models.FilamentField.filament_id
    if field_table == models.VendorField:
        return models.VendorField.vendor_id
    raise ValueError(f"Unknown field table: {field_table}")


def _parse_boolean_filter(value: str) -> bool:
    """Parse a boolean filter using explicit true/false tokens only."""
    normalized = value.strip().lower()
    if normalized == "true":
        return True
    if normalized == "false":
        return False
    raise ValueError(f"Invalid boolean filter value: {value!r}")


async def apply_extra_field_filters_and_sort(
    *,
    db: AsyncSession,
    stmt: Select,
    base_obj: type[models.Base],
    entity_type: EntityType,
    extra_field_filters: dict[str, str] | None,
    sort_by: dict[str, SortOrder] | None,
) -> Select:
    """Apply extra-field filtering and sorting to a query."""
    if not extra_field_filters and not (sort_by is not None and any(field.startswith("extra.") for field in sort_by)):
        return stmt

    extra_fields = await get_extra_fields(db, entity_type)
    extra_fields_dict: dict[str, ExtraField] = {field.key: field for field in extra_fields}

    if extra_field_filters:
        for field_key, value in extra_field_filters.items():
            field = extra_fields_dict.get(field_key)
            if field is None:
                continue
            stmt = add_where_clause_extra_field(
                stmt=stmt,
                base_obj=base_obj,
                entity_type=entity_type,
                field_key=field_key,
                field_type=field.field_type,
                value=value,
                multi_choice=field.multi_choice if field.field_type == ExtraFieldType.choice else None,
            )

    if sort_by is not None:
        for field_name, order in sort_by.items():
            if not field_name.startswith("extra."):
                continue

            field_key = field_name[6:]
            extra_field = extra_fields_dict.get(field_key)
            if extra_field is None:
                continue

            stmt = add_order_by_extra_field(
                stmt=stmt,
                base_obj=base_obj,
                entity_type=entity_type,
                field_key=field_key,
                field_type=extra_field.field_type,
                order=order,
            )

    return stmt


def add_where_clause_extra_field(  # noqa: C901, PLR0912, PLR0915
    stmt: Select,
    base_obj: type[models.Base],
    entity_type: EntityType,
    field_key: str,
    field_type: ExtraFieldType,
    value: str,
    *,
    multi_choice: bool | None = None,
) -> Select:
    """Add a where clause to a select statement for an extra field."""
    field_table = _get_field_table_for_entity(entity_type)
    entity_id_column = _get_entity_id_column(field_table)
    base_id_column = base_obj.id

    conditions = []
    for value_part in value.split(","):
        # Empty-string filters follow the existing string-query API semantics.
        if len(value_part) == 0:
            empty_conditions = [
                field_table.value.is_(None),
                field_table.value == "null",
            ]
            if field_type == ExtraFieldType.boolean:
                empty_conditions.append(field_table.value == json.dumps(bool(0)))

            field_has_empty_value = sqlalchemy.select(entity_id_column).where(
                sqlalchemy.and_(field_table.key == field_key, sqlalchemy.or_(*empty_conditions))
            )
            field_missing_entirely = sqlalchemy.select(base_id_column).where(
                base_id_column.not_in(sqlalchemy.select(entity_id_column).where(field_table.key == field_key))
            )
            conditions.append(base_id_column.in_(field_has_empty_value))
            conditions.append(base_id_column.in_(field_missing_entirely))
            continue

        exact_match = value_part.startswith('"') and value_part.endswith('"')
        parsed_value = value_part[1:-1] if exact_match else value_part

        if field_type == ExtraFieldType.text:
            field_condition = (
                field_table.value == json.dumps(parsed_value)
                if exact_match
                else field_table.value.ilike(f"%{parsed_value}%")
            )
        elif field_type == ExtraFieldType.integer:
            if ":" in parsed_value:
                min_val_str, max_val_str = parsed_value.split(":", 1)
                int_conditions = []
                try:
                    stored = sqlalchemy.cast(field_table.value, sqlalchemy.Integer)
                    if min_val_str:
                        int_conditions.append(stored >= int(min_val_str))
                    if max_val_str:
                        int_conditions.append(stored <= int(max_val_str))
                except (ValueError, TypeError) as exc:
                    raise ValueError(f"Invalid integer range filter value for '{field_key}': {parsed_value}") from exc
                if not int_conditions:
                    raise ValueError(f"Invalid integer range filter value for '{field_key}': {parsed_value}")
                field_condition = sqlalchemy.and_(*int_conditions)
            else:
                try:
                    field_condition = field_table.value == json.dumps(int(parsed_value))
                except ValueError as exc:
                    raise ValueError(f"Invalid integer filter value for '{field_key}': {parsed_value}") from exc
        elif field_type == ExtraFieldType.float:
            if ":" in parsed_value:
                min_val_str, max_val_str = parsed_value.split(":", 1)
                float_conditions = []
                try:
                    stored = sqlalchemy.cast(field_table.value, sqlalchemy.Float)
                    if min_val_str:
                        float_conditions.append(stored >= float(min_val_str))
                    if max_val_str:
                        float_conditions.append(stored <= float(max_val_str))
                except (ValueError, TypeError) as exc:
                    raise ValueError(f"Invalid float range filter value for '{field_key}': {parsed_value}") from exc
                if not float_conditions:
                    raise ValueError(f"Invalid float range filter value for '{field_key}': {parsed_value}")
                field_condition = sqlalchemy.and_(*float_conditions)
            else:
                try:
                    field_condition = field_table.value == json.dumps(float(parsed_value))
                except ValueError as exc:
                    raise ValueError(f"Invalid float filter value for '{field_key}': {parsed_value}") from exc
        elif field_type == ExtraFieldType.boolean:
            field_condition = field_table.value == json.dumps(_parse_boolean_filter(parsed_value))
        elif field_type == ExtraFieldType.choice:
            if multi_choice:
                field_condition = field_table.value.like(f'%"{parsed_value}"%')
            else:
                field_condition = field_table.value == json.dumps(parsed_value)
        elif field_type == ExtraFieldType.datetime:
            if "|" in parsed_value:
                start_str, end_str = parsed_value.split("|", 1)
                dt_conditions = []
                if start_str:
                    dt_conditions.append(field_table.value >= json.dumps(start_str))
                if end_str:
                    dt_conditions.append(field_table.value <= json.dumps(end_str))
                if not dt_conditions:
                    raise ValueError(
                        f"Invalid datetime range filter for '{field_key}': {parsed_value}. Expected '<start>|<end>'."
                    )
                field_condition = sqlalchemy.and_(*dt_conditions)
            else:
                field_condition = field_table.value == json.dumps(parsed_value)
        elif field_type in (ExtraFieldType.integer_range, ExtraFieldType.float_range):
            if ":" not in parsed_value:
                raise ValueError(
                    f"Invalid range filter value for '{field_key}': {parsed_value}. Expected '<min>:<max>'."
                )
            min_val_str, max_val_str = parsed_value.split(":", 1)
            converter = int if field_type == ExtraFieldType.integer_range else float
            range_conditions = []
            try:
                cast_type = sqlalchemy.Integer if field_type == ExtraFieldType.integer_range else sqlalchemy.Float
                if min_val_str:
                    # stored_min >= filter_min: the range starts at or after the requested minimum.
                    stored_min = sqlalchemy.cast(_JsonArrayFirstElement(field_table.value), cast_type)
                    range_conditions.append(stored_min >= converter(min_val_str))
                if max_val_str:
                    # stored_max <= filter_max: the range ends at or before the requested maximum.
                    stored_max = sqlalchemy.cast(_JsonArraySecondElement(field_table.value), cast_type)
                    range_conditions.append(stored_max <= converter(max_val_str))
            except (ValueError, TypeError) as exc:
                range_kind = "integer" if field_type == ExtraFieldType.integer_range else "float"
                raise ValueError(f"Invalid {range_kind} range filter value for '{field_key}': {parsed_value}") from exc
            if not range_conditions:
                raise ValueError(
                    f"Invalid range filter value for '{field_key}': {parsed_value}. Expected '<min>:<max>'."
                )
            field_condition = sqlalchemy.and_(*range_conditions)
        else:
            raise ValueError(f"Unsupported extra field type for '{field_key}': {field_type}")

        matching_entities = sqlalchemy.select(entity_id_column).where(
            sqlalchemy.and_(field_table.key == field_key, field_condition)
        )
        conditions.append(base_id_column.in_(matching_entities))

    if not conditions:
        return stmt

    return stmt.where(sqlalchemy.or_(*conditions))


def add_order_by_extra_field(
    stmt: Select,
    base_obj: type[models.Base],
    entity_type: EntityType,
    field_key: str,
    field_type: ExtraFieldType,
    order: SortOrder,
) -> Select:
    """Add an order-by clause to a select statement for an extra field."""
    field_table = _get_field_table_for_entity(entity_type)
    entity_id_column = _get_entity_id_column(field_table)

    value_subq = (
        sqlalchemy.select(field_table.value)
        .where(
            sqlalchemy.and_(
                field_table.key == field_key,
                entity_id_column == base_obj.id,
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
        cast_type = sqlalchemy.Integer if field_type == ExtraFieldType.integer_range else sqlalchemy.Float
        # Use dialect-specific JSON first-element extraction, then cast to numeric.
        sort_expr = sqlalchemy.cast(_JsonArrayFirstElement(value_subq), cast_type)
    else:
        sort_expr = value_subq

    if order == SortOrder.ASC:
        return stmt.order_by(sort_expr.asc())
    return stmt.order_by(sort_expr.desc())

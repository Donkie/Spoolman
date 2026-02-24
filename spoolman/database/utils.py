"""Utility functions for the database module."""

from collections.abc import Sequence
from enum import Enum
from typing import Any, TypeVar

import sqlalchemy
from sqlalchemy import Select
from sqlalchemy.orm import attributes

from spoolman.database import models


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


def add_where_clause_search(
    stmt: Select,
    fields: Sequence[attributes.InstrumentedAttribute[str | None]],
    value: str | None,
) -> Select:
    """Add a where clause for a general search across multiple string fields."""
    if value is not None:
        conditions = []
        for value_part in value.split(","):
            value_part = value_part.strip()
            if len(value_part) == 0:
                continue
            # Do exact match if value_part is surrounded by quotes
            if value_part[0] == '"' and value_part[-1] == '"':
                term = value_part[1:-1]
                conditions.append(sqlalchemy.or_(*[field == term for field in fields]))
            # Do prefix match for better index usage
            else:
                pattern = f"{value_part}%"
                conditions.append(sqlalchemy.or_(*[field.ilike(pattern) for field in fields]))

        if conditions:
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

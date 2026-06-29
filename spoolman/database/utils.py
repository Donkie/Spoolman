"""Utility functions for the database module."""

from collections.abc import Sequence
from datetime import datetime, timezone
from enum import Enum
from typing import Any, TypeVar

import sqlalchemy
from sqlalchemy import Select
from sqlalchemy.orm import attributes

from spoolman.database import models


def utc_timezone_naive(dt: datetime) -> datetime:
    """Convert a datetime object to UTC and remove timezone info."""
    return dt.astimezone(tz=timezone.utc).replace(tzinfo=None)


class SortOrder(Enum):
    ASC = 1
    DESC = 2


def parse_sort(sort: str | None) -> dict[str, "SortOrder"]:
    """Parse a sort query string of comma-separated "field:direction" items.

    Raises ValueError (mapped to HTTP 400 by the endpoints) for malformed input instead of letting
    an unpacking ValueError / KeyError surface as a 500.
    """
    sort_by: dict[str, SortOrder] = {}
    if sort is None:
        return sort_by
    for sort_item in sort.split(","):
        field, sep, direction = sort_item.partition(":")
        if not sep or direction.upper() not in SortOrder.__members__:
            raise ValueError(
                f"Invalid sort item '{sort_item}'. Expected '<field>:asc' or '<field>:desc'.",
            )
        sort_by[field] = SortOrder[direction.upper()]
    return sort_by


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

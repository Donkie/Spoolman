"""Utility functions for the database module."""

from collections.abc import Sequence
from enum import Enum
from typing import Any, TypeVar

import sqlalchemy
from sqlalchemy import Select
from sqlalchemy.orm import attributes

from spoolman.database import models

# Escape character for LIKE patterns. Deliberately not backslash: a backslash ESCAPE clause is
# ambiguous under MySQL/MariaDB string parsing. '/' renders safely on all four dialects.
LIKE_ESCAPE = "/"


def escape_like(value: str) -> str:
    """Escape LIKE wildcards so user input is matched literally, not as a wildcard pattern.

    Pair it with ``escape=LIKE_ESCAPE`` on the ``like``/``ilike`` call, or the escape character
    means nothing to the database and the wildcards are still live.

    Args:
        value: The raw user input to be embedded in a LIKE pattern.

    Returns:
        str: The input with the escape character and both wildcards escaped.

    """
    return value.replace(LIKE_ESCAPE, LIKE_ESCAPE * 2).replace("%", f"{LIKE_ESCAPE}%").replace("_", f"{LIKE_ESCAPE}_")


class SortOrder(Enum):
    ASC = 1
    DESC = 2


def parse_sort(sort: str | None) -> dict[str, SortOrder]:
    """Parse the ``sort`` query parameter into field/direction pairs.

    Shared by the spool, filament and vendor endpoints, which each used to do this inline with a
    bare ``split(":")`` -- so ``?sort=name`` raised "not enough values to unpack" and
    ``?sort=name:sideways`` a KeyError, both surfacing as a 500.

    Args:
        sort: The raw parameter, e.g. ``name:asc,filament.material:desc``. May be None.

    Returns:
        dict[str, SortOrder]: Field name to direction, empty if nothing was requested.

    Raises:
        ValueError: If an entry has no direction, or a direction that is not asc/desc.

    """
    sort_by: dict[str, SortOrder] = {}
    if sort is None:
        return sort_by

    for sort_item in sort.split(","):
        item = sort_item.strip()
        if not item:
            continue

        field, separator, direction = item.partition(":")
        if not separator:
            raise ValueError(f"Invalid sort '{item}', expected the form 'field:asc' or 'field:desc'.")
        if not field:
            raise ValueError(f"Invalid sort '{item}', no field name was given.")
        try:
            sort_by[field] = SortOrder[direction.strip().upper()]
        except KeyError:
            raise ValueError(
                f"Invalid sort direction '{direction}' for field '{field}', expected 'asc' or 'desc'.",
            ) from None

    return sort_by


def parse_nested_field(base_obj: type[models.Base], field: str) -> attributes.InstrumentedAttribute[Any]:
    """Parse a nested field string into a sqlalchemy field object."""
    fields = field.split(".")

    if fields[0] == "filament" and hasattr(base_obj, "filament"):
        if len(fields) == 1:
            raise ValueError("No field specified for filament")
        return parse_nested_field(models.Filament, ".".join(fields[1:]))

    if fields[0] == "vendor" and hasattr(base_obj, "vendor"):
        if len(fields) == 1:
            raise ValueError("No field specified for vendor")
        return parse_nested_field(models.Vendor, ".".join(fields[1:]))

    # Only mapped columns, not any attribute that happens to exist. `hasattr` also accepted
    # `metadata`, `registry` and relationships, which then reached order_by() and blew up there --
    # `?sort=metadata:asc` raised "'MetaData' object has no attribute 'asc'" as a 500.
    if fields[0] not in sqlalchemy.inspect(base_obj).columns:
        raise ValueError(f"Invalid field name '{field}', '{fields[0]}' is not a valid field on '{base_obj.__name__}'.")

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

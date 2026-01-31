"""Functionality for exporting data in various format."""

import asyncio
import csv
import json
from collections.abc import Iterable
from typing import TYPE_CHECKING, Any

from spoolman.database import models

if TYPE_CHECKING:
    from _typeshed import SupportsWrite

banned_attrs = {"awaitable_attrs", "metadata", "registry", "spools", "filaments"}


async def flatten_sqlalchemy_object(obj: models.Base, parent_key: str = "", sep: str = ".") -> dict[str, Any]:
    """Recursively flattens a SQLAlchemy object into a dictionary with dot-separated keys."""
    fields = {}
    for attr in dir(obj):
        # Check if the attribute is a column or a relationship
        if not attr.startswith("_") and attr not in banned_attrs:
            try:
                value = await getattr(obj.awaitable_attrs, attr)
            except Exception:
                # Fallback for plain objects (e.g., SimpleNamespace) or other non-SQLAlchemy objects
                try:
                    value = getattr(obj, attr)
                except Exception:
                    continue

            if attr == "extra":
                # Handle extra fields
                # Support several types: list of objects with key/value, dicts and lists of dicts
                if isinstance(value, dict):
                    for k, v in value.items():
                        fields[f"{parent_key}extra.{k}"] = v
                else:
                    try:
                        for v in value:
                            k = getattr(v, "key", None)
                            val = getattr(v, "value", None)
                            if k is not None:
                                fields[f"{parent_key}extra.{k}"] = val
                    except Exception:
                        # Not iterable or unexpected format, skip
                        pass
                continue

            # Handle nested SQLAlchemy objects
            if isinstance(value, models.Base):
                nested_fields = await flatten_sqlalchemy_object(value, f"{parent_key}{attr}{sep}", sep=sep)
                fields.update(nested_fields)
            else:
                # Use only columns and simple data types
                # Skip callables and complex objects
                if callable(value):
                    continue
                fields[f"{parent_key}{attr}"] = value
    return fields


async def dump_as_csv(sqlalchemy_objects: Iterable[models.Base], writer: "SupportsWrite[str]") -> None:
    """Export a list of objects as CSV to a writer. Nested objects are flattened with dot-separated keys."""
    # Flatten each object and get all column names
    all_flattened = await asyncio.gather(*[flatten_sqlalchemy_object(obj) for obj in sqlalchemy_objects])

    # Collect all unique headers across flattened objects
    headers = set()
    for flattened_obj in all_flattened:
        headers.update(flattened_obj.keys())

    headers = sorted(headers)  # Sort headers for consistent column ordering

    # Write to CSV
    csv_writer = csv.DictWriter(writer, fieldnames=headers)
    csv_writer.writeheader()
    for flattened_obj in all_flattened:
        csv_writer.writerow(flattened_obj)


async def dump_as_json(sqlalchemy_objects: Iterable[models.Base], writer: "SupportsWrite[str]") -> None:
    """Export a list of objects as JSON to a writer. Nested objects are flattened with dot-separated keys."""
    # Flatten each object and get all column names
    all_flattened = await asyncio.gather(*[flatten_sqlalchemy_object(obj) for obj in sqlalchemy_objects])

    # Write to JSON
    json.dump(all_flattened, writer, default=str)

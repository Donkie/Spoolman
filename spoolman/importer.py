"""Functionality for importing data exported from Spoolman or produced elsewhere.

This is the inverse of `spoolman.export`. The export flattens objects into dot-separated
keys (`filament.vendor.name`), so the import un-flattens them back into a tree, drops the
columns that describe a particular database rather than the object (`id`, `registered`,
and the lengths derived from the weights), and coerces every remaining cell to the type
the create functions expect.

Everything here is pure: it turns rows into records and complaints about rows, and touches
neither the database nor the network. The API layer decides what to do with the result.
"""

import csv
import io
import json
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any

from spoolman.export import FORMULA_PREFIXES


class ImportEntity(Enum):
    """What the rows of a file describe."""

    VENDOR = "vendors"
    FILAMENT = "filaments"
    SPOOL = "spools"


class ImportFormat(Enum):
    """The file format being imported."""

    CSV = "csv"
    JSON = "json"


# Writable fields and the type each cell is coerced to. Anything not listed here is
# either derived (`remaining_length`), or describes the database a row came from
# (`id`, `registered`), and is reported as ignored rather than written.
VENDOR_FIELDS: dict[str, str] = {
    "name": "str",
    "comment": "str",
    "empty_spool_weight": "float",
    "external_id": "str",
}

FILAMENT_FIELDS: dict[str, str] = {
    "name": "str",
    "material": "str",
    "price": "float",
    "density": "float",
    "diameter": "float",
    "weight": "float",
    "spool_weight": "float",
    "article_number": "str",
    "comment": "str",
    "settings_extruder_temp": "int",
    "settings_bed_temp": "int",
    "color_hex": "str",
    "multi_color_hexes": "str",
    "multi_color_direction": "str",
    "external_id": "str",
}

SPOOL_FIELDS: dict[str, str] = {
    "first_used": "datetime",
    "last_used": "datetime",
    "price": "float",
    "initial_weight": "float",
    "spool_weight": "float",
    "used_weight": "float",
    "remaining_weight": "float",
    "location": "str",
    "lot_nr": "str",
    "comment": "str",
    "archived": "bool",
}

FIELDS_BY_ENTITY: dict[ImportEntity, dict[str, str]] = {
    ImportEntity.VENDOR: VENDOR_FIELDS,
    ImportEntity.FILAMENT: FILAMENT_FIELDS,
    ImportEntity.SPOOL: SPOOL_FIELDS,
}

# Where the parent objects hang off a row, per entity. A spools file carries its filament
# under `filament.` and that filament's vendor under `filament.vendor.`.
PARENTS_BY_ENTITY: dict[ImportEntity, list[tuple[str, ImportEntity]]] = {
    ImportEntity.VENDOR: [],
    ImportEntity.FILAMENT: [("vendor", ImportEntity.VENDOR)],
    ImportEntity.SPOOL: [("filament", ImportEntity.FILAMENT), ("filament.vendor", ImportEntity.VENDOR)],
}

# The row-level complaints that mean "this row has no such object in it at all",
# as opposed to "this row has something wrong with it".
STRUCTURAL_MESSAGES = frozenset(
    {
        "No filament columns found for this row.",
        "A vendor needs a name.",
    },
)

# Shown in the hint when a file is not recognised at all. A few characteristic names
# are enough to make it obvious what kind of file belongs here.
ARTICLE = {
    ImportEntity.VENDOR: "a vendor",
    ImportEntity.FILAMENT: "a filament",
    ImportEntity.SPOOL: "the filament a spool is wound with",
}

EXAMPLE_COLUMNS: dict[ImportEntity, tuple[str, ...]] = {
    ImportEntity.VENDOR: ("name", "comment", "empty_spool_weight"),
    ImportEntity.FILAMENT: ("name", "density", "diameter", "vendor.name"),
    ImportEntity.SPOOL: ("filament.name", "filament.density", "filament.vendor.name", "remaining_weight"),
}

# Filament rows without these cannot be created: `filament.create` takes them positionally
# and the database has them as NOT NULL.
REQUIRED_FILAMENT_FIELDS = ("density", "diameter")

# Columns whose value has to be one of a fixed set. Checked here so a typo in a file is a
# row number and a list of the accepted spellings, not a 500 from deeper down.
ALLOWED_VALUES: dict[str, tuple[str, ...]] = {
    "multi_color_direction": ("coaxial", "longitudinal"),
}

# How many of a foreign file's columns to quote back before cutting the list short.
EXAMPLE_LIMIT = 12

TRUE_VALUES = frozenset({"true", "1", "yes", "y", "on"})
FALSE_VALUES = frozenset({"false", "0", "no", "n", "off", ""})


@dataclass
class RowError:
    """One reason a row cannot be imported."""

    row: int
    """Row number as a person counts them: the first data row is 1.

    Zero means the complaint is about the file as a whole rather than a row in it.
    """
    column: str | None
    message: str


@dataclass
class ImportRecord:
    """One row, ready to be handed to the database layer.

    `fields` are the entity's own values; `parents` holds the nested objects keyed by the
    prefix they arrived under, so a spool's filament is at `filament` and that filament's
    vendor at `filament.vendor`.
    """

    row: int
    fields: dict[str, Any] = field(default_factory=dict)
    extra: dict[str, str] = field(default_factory=dict)
    parents: dict[str, dict[str, Any]] = field(default_factory=dict)
    parent_extra: dict[str, dict[str, str]] = field(default_factory=dict)


@dataclass
class ParseResult:
    """What a file turned into."""

    records: list[ImportRecord] = field(default_factory=list)
    errors: list[RowError] = field(default_factory=list)
    ignored_columns: list[str] = field(default_factory=list)
    """Columns that were present but not written, so nothing is dropped silently."""


def unescape_csv_value(value: str) -> str:
    """Undo the leading quote that the CSV export adds to formula-like values.

    `escape_csv_value` prefixes `=1+1` with a single quote so a spreadsheet reads it as
    text. Without this, a round trip through CSV would grow one quote per trip.

    Args:
        value: The cell value as read from the file.

    Returns:
        str: The value as it was before escaping.

    """
    if value.startswith("'") and value[1:].startswith(FORMULA_PREFIXES):
        return value[1:]
    return value


def parse_datetime(value: str) -> datetime:
    """Parse a timestamp as written by the export, returning it naive in UTC.

    The export writes `str(datetime)`, which is ISO 8601 with a space instead of the `T`.
    Both spellings are accepted, as is a trailing `Z`.
    """
    text = value.strip().replace(" ", "T")
    if text.endswith(("z", "Z")):
        text = text[:-1] + "+00:00"
    parsed = datetime.fromisoformat(text)
    if parsed.tzinfo is not None:
        parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
    return parsed


def _to_int(value: Any) -> int:  # noqa: ANN401
    """Read a whole number, accepting the `210.0` that JSON and spreadsheets both write."""
    as_float = float(value)
    if as_float != int(as_float):
        raise ValueError(f"{value!r} is not a whole number")
    return int(as_float)


def _to_bool(value: Any) -> bool:  # noqa: ANN401
    if isinstance(value, bool):
        return value
    text = str(value).strip().lower()
    if text in TRUE_VALUES:
        return True
    if text in FALSE_VALUES:
        return False
    raise ValueError(f"{value!r} is not a true/false value")


def _to_datetime(value: Any) -> datetime:  # noqa: ANN401
    if isinstance(value, datetime):
        return value
    return parse_datetime(str(value))


CONVERTERS: dict[str, Callable[[Any], Any]] = {
    "str": str,
    "float": float,
    "int": _to_int,
    "bool": _to_bool,
    "datetime": _to_datetime,
}


def coerce(value: Any, kind: str) -> Any:  # noqa: ANN401
    """Turn a cell into the type the create functions expect.

    JSON files already carry numbers and booleans as such; CSV carries everything as text.
    Both end up here so the two formats cannot disagree about what a column means.

    Raises:
        ValueError: If the cell cannot be read as the requested type.
        TypeError: If the field type is not one this module knows.

    """
    if value is None:
        return None
    if isinstance(value, str):
        value = unescape_csv_value(value).strip()
        if value == "":
            return None

    try:
        convert = CONVERTERS[kind]
    except KeyError:
        raise TypeError(f"Unknown field type {kind!r}") from None
    return convert(value)


def read_rows(data: bytes, fmt: ImportFormat) -> list[dict[str, Any]]:
    """Read a file into a list of flat rows.

    Raises:
        ValueError: If the file cannot be read in the given format.

    """
    text = data.decode("utf-8-sig", errors="replace")

    if fmt == ImportFormat.CSV:
        reader = csv.DictReader(io.StringIO(text))
        if reader.fieldnames is None:
            raise ValueError("The CSV file has no header row.")
        return [row for row in reader if any((cell or "").strip() for cell in row.values())]

    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as exc:
        raise ValueError(f"The file is not valid JSON: {exc}") from exc
    if not isinstance(parsed, list):
        # A ValueError rather than a TypeError: the shape of an uploaded file is something
        # the user got wrong, not a bug in a call, and the caller turns it into a message.
        raise ValueError("The JSON file must contain a list of objects.")  # noqa: TRY004
    if not all(isinstance(item, dict) for item in parsed):
        raise ValueError("Every item in the JSON file must be an object.")
    return parsed


def _split_key(key: str) -> tuple[str, str]:
    """Split a flattened column into (prefix, field). `filament.vendor.name` → both parts."""
    if "." not in key:
        return "", key
    prefix, _, name = key.rpartition(".")
    return prefix, name


def _read_extra_cell(record: ImportRecord, key: str, raw: Any) -> bool:  # noqa: ANN401
    """Store an `extra.*` cell on the row or on one of its parents.

    Returns:
        bool: True if the column was an extra field and was stored, False if it was an
        extra field belonging to no object this file describes, so the caller can report
        it as ignored.

    """
    holder_prefix, _, extra_key = key.partition("extra.")
    holder_prefix = holder_prefix.rstrip(".")
    if not extra_key:
        return False
    if holder_prefix == "":
        holder = record.extra
    elif holder_prefix in record.parent_extra:
        holder = record.parent_extra[holder_prefix]
    else:
        return False

    if raw is not None:
        value = unescape_csv_value(str(raw))
        if value.strip() != "":
            holder[extra_key] = value
    return True


def _read_cell(
    record: ImportRecord,
    key: str,
    raw: Any,  # noqa: ANN401
    fields_by_prefix: dict[str, dict[str, str]],
) -> RowError | None:
    """Store one ordinary cell on the row or on one of its parents.

    Returns:
        RowError | None: Why the cell could not be read, or None when it was stored or
        deliberately ignored.

    Raises:
        KeyError: Never; the lookup below cannot miss because unknown prefixes are
            filtered by the caller.

    """
    prefix, name = _split_key(key)
    own = fields_by_prefix.get(prefix)
    if own is None:
        return None
    kind = own.get(name)
    if kind is None:
        return None

    try:
        value = coerce(raw, kind)
    except (ValueError, TypeError) as exc:
        return RowError(row=record.row, column=key, message=str(exc))

    if value is not None:
        target = record.fields if prefix == "" else record.parents[prefix]
        target[name] = value
    return None


def _is_written(key: str, record: ImportRecord, fields_by_prefix: dict[str, dict[str, str]]) -> bool:
    """Whether a column ends up somewhere, so the rest can be reported as ignored."""
    if "extra." in key:
        holder_prefix = key.partition("extra.")[0].rstrip(".")
        return bool(key.partition("extra.")[2]) and (holder_prefix == "" or holder_prefix in record.parent_extra)
    prefix, name = _split_key(key)
    return name in fields_by_prefix.get(prefix, {})


def parse_rows(rows: list[dict[str, Any]], entity: ImportEntity) -> ParseResult:
    """Turn flat rows into records, collecting every reason a row cannot be used.

    Rows are validated as a set rather than one at a time: the caller can then refuse the
    whole file and show every problem at once, instead of importing half of it and stopping
    on the first bad cell.
    """
    result = ParseResult()
    parents = dict(PARENTS_BY_ENTITY[entity])
    fields_by_prefix: dict[str, dict[str, str]] = {"": FIELDS_BY_ENTITY[entity]}
    for prefix, parent_entity in parents.items():
        fields_by_prefix[prefix] = FIELDS_BY_ENTITY[parent_entity]
    ignored: set[str] = set()
    recognised: set[str] = set()

    for index, row in enumerate(rows, start=1):
        record = ImportRecord(row=index)
        for prefix in parents:
            record.parents[prefix] = {}
            record.parent_extra[prefix] = {}

        for raw_key, raw in row.items():
            if raw_key is None:
                continue
            key = raw_key.strip()

            if not _is_written(key, record, fields_by_prefix):
                ignored.add(key)
                continue
            recognised.add(key)

            # Extra fields keep their own namespace at every level: `extra.foo` belongs to
            # the row itself, `filament.extra.foo` to the nested filament.
            if "extra." in key:
                _read_extra_cell(record, key, raw)
                continue

            error = _read_cell(record, key, raw, fields_by_prefix)
            if error is not None:
                result.errors.append(error)

        _validate_record(record, entity, result)
        result.records.append(record)

    result.ignored_columns = sorted(ignored)
    _collapse_structural_failure(result, entity, sorted(ignored), recognised)
    return result


def _defining_columns_absent(entity: ImportEntity, recognised: set[str]) -> bool:
    """Whether the file lacks the columns that say what its rows even are.

    This is what separates the wrong file from a bad one. A vendors export with a
    blank name in it does have a `name` column, and that row is a row-level problem
    worth pointing at. A file with no `name` column at all is not a vendors export.
    """
    if entity == ImportEntity.SPOOL:
        return not any(key.startswith("filament.") for key in recognised)
    if entity == ImportEntity.VENDOR:
        return "name" not in recognised
    return not recognised


def _collapse_structural_failure(
    result: ParseResult,
    entity: ImportEntity,
    ignored: list[str],
    recognised: set[str],
) -> None:
    """Turn "every row is missing the same thing" into one statement about the file.

    A file where every single row lacks the columns that define the entity is not a
    file with bad rows in it — it is the wrong kind of file: another tool's export,
    the wrong list, the wrong endpoint. Repeating an identical row-level complaint
    once per line buries that; saying it once, with what was expected and what was
    actually there, points straight at the mistake.

    Only an unbroken run counts. One row that parses means the file really is ours
    and the others really are broken rows, which is a different message.
    """
    if not result.records or not _defining_columns_absent(entity, recognised):
        return
    structural = [e for e in result.errors if e.message in STRUCTURAL_MESSAGES]
    if len(structural) != len(result.records) or len(structural) != len(result.errors):
        return

    quoted = ", ".join(ignored[:EXAMPLE_LIMIT])
    if len(ignored) > EXAMPLE_LIMIT:
        quoted += ", …"
    result.records.clear()
    result.errors = [
        RowError(
            row=0,
            column=None,
            message=(
                f"This file does not look like a {entity.value} export, so there is nothing to import. "
                f"Every row is missing the columns that describe {ARTICLE[entity]}. "
                f"This endpoint reads what /export/{entity.value} writes, with columns such as "
                f"{', '.join(EXAMPLE_COLUMNS[entity])}"
                + (f". The columns in this file are: {quoted}" if quoted else "")
            ),
        ),
    ]


def _validate_filament(record: ImportRecord, entity: ImportEntity, result: ParseResult) -> None:
    """Check that the filament a row describes could actually be created."""
    if entity == ImportEntity.FILAMENT:
        fields, prefix = record.fields, ""
    elif entity == ImportEntity.SPOOL:
        fields, prefix = record.parents.get("filament", {}), "filament."
    else:
        return

    if not fields:
        result.errors.append(
            RowError(row=record.row, column=None, message="No filament columns found for this row."),
        )
        return

    for name in REQUIRED_FILAMENT_FIELDS:
        if fields.get(name) is None:
            result.errors.append(
                RowError(row=record.row, column=f"{prefix}{name}", message=f"A filament needs a {name}."),
            )


def _validate_allowed_values(record: ImportRecord, result: ParseResult) -> None:
    """Check the columns that only accept a fixed set of spellings, and normalise them."""
    holders = [(record.fields, "")] + [(values, f"{prefix}.") for prefix, values in record.parents.items()]
    for holder, prefix in holders:
        for name, allowed in ALLOWED_VALUES.items():
            value = holder.get(name)
            if value is None:
                continue
            lowered = str(value).casefold()
            if lowered in allowed:
                holder[name] = lowered
            else:
                result.errors.append(
                    RowError(
                        row=record.row,
                        column=f"{prefix}{name}",
                        message=f"{value!r} is not one of: {', '.join(allowed)}.",
                    ),
                )


def _validate_record(record: ImportRecord, entity: ImportEntity, result: ParseResult) -> None:
    """Check that a record carries enough to create the objects it describes."""
    _validate_filament(record, entity, result)

    if entity == ImportEntity.VENDOR and not record.fields.get("name"):
        result.errors.append(RowError(row=record.row, column="name", message="A vendor needs a name."))

    _validate_allowed_values(record, result)

    # The export writes both weights, and they disagree if either was edited by hand.
    # `used_weight` is what the database stores, so it wins and the derived one is dropped.
    if entity == ImportEntity.SPOOL and "used_weight" in record.fields:
        record.fields.pop("remaining_weight", None)

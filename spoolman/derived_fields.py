"""User-defined derived fields with safe expression evaluation."""

import colorsys
import json
import logging
import math
from datetime import date, datetime, time, timezone
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field, ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from spoolman.database import setting as db_setting
from spoolman.exceptions import ItemNotFoundError
from spoolman.extra_fields import EntityType
from spoolman.settings import parse_setting

logger = logging.getLogger(__name__)

class DerivedFieldType(Enum):
    """Supported output types for a derived field."""

    number = "number"
    text = "text"


class DerivedFieldDefinition(BaseModel):
    """Stored user-defined derived field."""

    key: str = Field(description="Unique key", pattern="^[a-z0-9_]+$", min_length=1, max_length=64)
    entity_type: EntityType = Field(description="Entity type this derived field is for")
    name: str = Field(description="Display name", min_length=1, max_length=128)
    description: str | None = Field(default=None, description="Optional description", max_length=512)
    result_type: DerivedFieldType = Field(description="Expected result type")
    expression_json: dict[str, Any] = Field(description="Derived expression in JSON Logic format")
    surfaces: list[str] = Field(default_factory=list, description="Where this derived field should appear")
    allow_list_column_toggle: bool = Field(
        default=False,
        description="Whether list-surface fields can be hidden or shown from the column picker",
    )
    include_in_api: bool = Field(
        default=False,
        description="Whether this formula field can be exposed in API derived payloads",
    )


class DerivedFieldParameters(BaseModel):
    """Editable parameters for a derived field."""

    name: str = Field(description="Display name", min_length=1, max_length=128)
    description: str | None = Field(default=None, description="Optional description", max_length=512)
    result_type: DerivedFieldType = Field(description="Expected result type")
    expression_json: dict[str, Any] = Field(description="Derived expression in JSON Logic format")
    surfaces: list[str] = Field(default_factory=list, description="Where this derived field should appear")
    allow_list_column_toggle: bool = Field(
        default=False,
        description="Whether list-surface fields can be hidden or shown from the column picker",
    )
    include_in_api: bool = Field(
        default=False,
        description="Whether this formula field can be exposed in API derived payloads",
    )


class DerivedFieldPreviewRequest(BaseModel):
    """Preview request for evaluating a derived field expression."""

    expression_json: dict[str, Any] = Field(description="Derived expression in JSON Logic format")
    sample_values: dict[str, Any] = Field(default_factory=dict, description="Sample values keyed by field reference")


class DerivedFieldPreviewResponse(BaseModel):
    """Preview result for a derived field expression."""

    result: str | float | int | bool | None = Field(description="Preview result")
    references: list[str] = Field(default_factory=list, description="Field references used by the expression")


_derived_field_cache: dict[EntityType, list[DerivedFieldDefinition]] = {}


def _as_datetime(value: Any) -> datetime:
    # Normalize all datetime operands to timezone-aware UTC so interval helpers
    # (days_between/hours_between) can safely compare mixed user inputs (with/without timezone).
    if isinstance(value, datetime):
        return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)
    if isinstance(value, date):
        return datetime.combine(value, time.min, tzinfo=timezone.utc)
    if isinstance(value, str):
        normalized = value.strip()
        if normalized.endswith("Z"):
            normalized = f"{normalized[:-1]}+00:00"
        parsed = datetime.fromisoformat(normalized)
        return parsed if parsed.tzinfo is not None else parsed.replace(tzinfo=timezone.utc)
    raise ValueError(f"Value {value!r} is not a datetime-compatible input.")


def _coalesce(*values: Any) -> Any:
    for value in values:
        if value is not None:
            return value
    return None


def _date_only(value: Any) -> str:
    return _as_datetime(value).date().isoformat()


def _time_only(value: Any) -> str:
    return _as_datetime(value).timetz().isoformat()


def _days_between(start: Any, end: Any) -> float:
    return (_as_datetime(end) - _as_datetime(start)).total_seconds() / 86400


def _hours_between(start: Any, end: Any) -> float:
    return (_as_datetime(end) - _as_datetime(start)).total_seconds() / 3600


def _hue_from_hex(value: Any) -> float:
    if not isinstance(value, str):
        raise ValueError("hue_from_hex expects a color string.")
    normalized = value.strip().lstrip("#")
    if len(normalized) == 3:
        normalized = "".join(char * 2 for char in normalized)
    if len(normalized) != 6:
        raise ValueError("hue_from_hex expects a 3 or 6 digit hex color.")
    red = int(normalized[0:2], 16) / 255
    green = int(normalized[2:4], 16) / 255
    blue = int(normalized[4:6], 16) / 255
    hue, _, _ = colorsys.rgb_to_hsv(red, green, blue)
    return round(hue * 360, 3)


def _today() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def _left(value: Any, count: Any = 1) -> str:
    text = str(value if value is not None else "")
    try:
        length = max(0, math.floor(float(count)))
    except (TypeError, ValueError):
        length = 1
    return text[:length]


def _right(value: Any, count: Any = 1) -> str:
    text = str(value if value is not None else "")
    try:
        length = max(0, math.floor(float(count)))
    except (TypeError, ValueError):
        length = 1
    if length == 0:
        return ""
    return text[-length:]


JSON_LOGIC_ALLOWED_OPERATORS = {
    "var",
    "if",
    "and",
    "or",
    "!",
    "==",
    "!=",
    "<",
    "<=",
    ">",
    ">=",
    "+",
    "-",
    "*",
    "/",
    "%",
    "min",
    "max",
    "round",
    "floor",
    "ceil",
    "abs",
    "cat",
    "upper",
    "lower",
    "trim",
    "length",
    "replace",
    "left",
    "right",
    "coalesce",
    "today",
    "year",
    "month",
    "day",
    "hour",
    "minute",
    "second",
    "timestamp",
    "date_only",
    "time_only",
    "days_between",
    "hours_between",
    "hue_from_hex",
}


def _normalize_json_logic_args(raw_value: Any) -> list[Any]:
    if isinstance(raw_value, list):
        return raw_value
    return [raw_value]


def _normalize_preview_result(value: Any) -> str | float | int | bool | None:
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, (str, float, int, bool)) or value is None:
        return value
    return str(value)


def _truthy(value: Any) -> bool:
    return bool(value)


def _lookup_reference(reference: Any, scope: dict[str, Any], default: Any = None) -> Any:
    if isinstance(reference, int):
        return scope.get(str(reference), default)
    if not isinstance(reference, str):
        raise ValueError("JSON Logic var reference must be a string or integer.")
    if reference == "":
        return scope

    current: Any = scope
    for part in reference.split("."):
        if isinstance(current, dict) and part in current:
            current = current[part]
            continue
        return default
    return current


def _validate_json_logic_node(node: Any, references: set[str]) -> None:
    if isinstance(node, (str, int, float, bool)) or node is None:
        return
    if isinstance(node, list):
        for value in node:
            _validate_json_logic_node(value, references)
        return
    if not isinstance(node, dict):
        raise ValueError("JSON Logic expression contains unsupported value types.")
    if len(node) != 1:
        raise ValueError("JSON Logic expression objects must contain exactly one operator.")

    operator, raw_args = next(iter(node.items()))
    if operator not in JSON_LOGIC_ALLOWED_OPERATORS:
        raise ValueError(f"JSON Logic operator '{operator}' is not allowed.")

    args = _normalize_json_logic_args(raw_args)
    if operator == "var":
        if len(args) == 0:
            raise ValueError("JSON Logic var operator requires at least one argument.")
        reference = args[0]
        if not isinstance(reference, (str, int)):
            raise ValueError("JSON Logic var reference must be a string or integer.")
        if isinstance(reference, str) and reference != "":
            references.add(reference)
        if len(args) > 1:
            _validate_json_logic_node(args[1], references)
        return

    for arg in args:
        _validate_json_logic_node(arg, references)


def validate_derived_expression_json(expression_json: dict[str, Any]) -> list[str]:
    references: set[str] = set()
    _validate_json_logic_node(expression_json, references)
    return sorted(references)


def _evaluate_json_logic(node: Any, scope: dict[str, Any]) -> Any:
    if isinstance(node, (str, int, float, bool)) or node is None:
        return node
    if isinstance(node, list):
        return [_evaluate_json_logic(value, scope) for value in node]
    if not isinstance(node, dict) or len(node) != 1:
        raise ValueError("JSON Logic expression uses an invalid object shape.")

    operator, raw_args = next(iter(node.items()))
    args = _normalize_json_logic_args(raw_args)

    if operator == "var":
        reference = args[0] if len(args) > 0 else ""
        default = _evaluate_json_logic(args[1], scope) if len(args) > 1 else None
        return _lookup_reference(reference, scope, default)
    if operator == "if":
        if len(args) < 2:
            raise ValueError("JSON Logic if operator requires at least 2 arguments.")
        for index in range(0, len(args) - 1, 2):
            if _truthy(_evaluate_json_logic(args[index], scope)):
                return _evaluate_json_logic(args[index + 1], scope)
        if len(args) % 2 == 1:
            return _evaluate_json_logic(args[-1], scope)
        return None
    if operator == "and":
        result: Any = True
        for arg in args:
            result = _evaluate_json_logic(arg, scope)
            if not _truthy(result):
                return result
        return result
    if operator == "or":
        result: Any = False
        for arg in args:
            result = _evaluate_json_logic(arg, scope)
            if _truthy(result):
                return result
        return result
    if operator == "!":
        if len(args) != 1:
            raise ValueError("JSON Logic ! operator requires one argument.")
        return not _truthy(_evaluate_json_logic(args[0], scope))

    evaluated_args = [_evaluate_json_logic(arg, scope) for arg in args]

    if operator == "==":
        return evaluated_args[0] == evaluated_args[1]
    if operator == "!=":
        return evaluated_args[0] != evaluated_args[1]
    if operator == "<":
        return evaluated_args[0] < evaluated_args[1]
    if operator == "<=":
        return evaluated_args[0] <= evaluated_args[1]
    if operator == ">":
        return evaluated_args[0] > evaluated_args[1]
    if operator == ">=":
        return evaluated_args[0] >= evaluated_args[1]
    if operator == "+":
        return sum(evaluated_args)
    if operator == "-":
        if len(evaluated_args) == 1:
            return -evaluated_args[0]
        return evaluated_args[0] - evaluated_args[1]
    if operator == "*":
        result = 1
        for value in evaluated_args:
            result *= value
        return result
    if operator == "/":
        if len(evaluated_args) != 2:
            raise ValueError("JSON Logic / operator requires two arguments.")
        return evaluated_args[0] / evaluated_args[1]
    if operator == "%":
        return evaluated_args[0] % evaluated_args[1]
    if operator == "min":
        return min(evaluated_args)
    if operator == "max":
        return max(evaluated_args)
    if operator == "round":
        return round(evaluated_args[0])
    if operator == "floor":
        return math.floor(evaluated_args[0])
    if operator == "ceil":
        return math.ceil(evaluated_args[0])
    if operator == "abs":
        return abs(evaluated_args[0])
    if operator == "cat":
        return "".join(str(value) for value in evaluated_args)
    if operator == "upper":
        return str(evaluated_args[0]).upper()
    if operator == "lower":
        return str(evaluated_args[0]).lower()
    if operator == "trim":
        return str(evaluated_args[0]).strip()
    if operator == "length":
        return len(evaluated_args[0])
    if operator == "replace":
        return str(evaluated_args[0]).replace(str(evaluated_args[1]), str(evaluated_args[2]))
    if operator == "left":
        return _left(evaluated_args[0], evaluated_args[1] if len(evaluated_args) > 1 else 1)
    if operator == "right":
        return _right(evaluated_args[0], evaluated_args[1] if len(evaluated_args) > 1 else 1)
    if operator == "coalesce":
        return _coalesce(*evaluated_args)
    if operator == "today":
        return _today()
    if operator == "year":
        return _as_datetime(evaluated_args[0]).year
    if operator == "month":
        return _as_datetime(evaluated_args[0]).month
    if operator == "day":
        return _as_datetime(evaluated_args[0]).day
    if operator == "hour":
        return _as_datetime(evaluated_args[0]).hour
    if operator == "minute":
        return _as_datetime(evaluated_args[0]).minute
    if operator == "second":
        return _as_datetime(evaluated_args[0]).second
    if operator == "timestamp":
        return _as_datetime(evaluated_args[0]).timestamp()
    if operator == "date_only":
        return _date_only(evaluated_args[0])
    if operator == "time_only":
        return _time_only(evaluated_args[0])
    if operator == "days_between":
        return _days_between(evaluated_args[0], evaluated_args[1])
    if operator == "hours_between":
        return _hours_between(evaluated_args[0], evaluated_args[1])
    if operator == "hue_from_hex":
        return _hue_from_hex(evaluated_args[0])

    raise ValueError(f"JSON Logic operator '{operator}' is not implemented.")


def preview_derived_expression_json(
    expression_json: dict[str, Any],
    sample_values: dict[str, Any],
) -> DerivedFieldPreviewResponse:
    references = validate_derived_expression_json(expression_json)
    try:
        result = _evaluate_json_logic(expression_json, sample_values)
    except Exception as exc:
        raise ValueError(str(exc)) from exc
    return DerivedFieldPreviewResponse(result=_normalize_preview_result(result), references=references)


def preview_derived_payload(
    *,
    expression_json: dict[str, Any],
    sample_values: dict[str, Any],
) -> DerivedFieldPreviewResponse:
    return preview_derived_expression_json(expression_json, sample_values)


def _validate_expression_payload(expression_json: dict[str, Any]) -> None:
    validate_derived_expression_json(expression_json)


def _parse_extra_field_value(value: Any) -> Any:
    # Extra-field values are persisted as JSON strings; parse when possible so
    # formula operators evaluate real typed values instead of quoted text.
    if not isinstance(value, str):
        return value
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return value


def _normalize_formula_scope(value: Any) -> Any:
    # Normalize nested payloads recursively so derived evaluation sees stable types
    # and compatibility aliases regardless of API/UI serialization differences.
    if isinstance(value, dict):
        normalized: dict[str, Any] = {}
        for key, nested in value.items():
            if key == "extra" and isinstance(nested, dict):
                normalized[key] = {
                    extra_key: _parse_extra_field_value(extra_value)
                    for extra_key, extra_value in nested.items()
                }
                continue
            normalized[key] = _normalize_formula_scope(nested)

        # Preserve both naming conventions so existing formulas written against either
        # "registered" or "created_at" keep evaluating across API/UI payloads.
        if "registered" in normalized and "created_at" not in normalized:
            normalized["created_at"] = normalized["registered"]
        if "created_at" in normalized and "registered" not in normalized:
            normalized["registered"] = normalized["created_at"]
        return normalized
    if isinstance(value, list):
        return [_normalize_formula_scope(item) for item in value]
    return value


def build_formula_scope(payload: dict[str, Any]) -> dict[str, Any]:
    """Normalize API payload values into a formula-evaluation scope."""
    normalized = _normalize_formula_scope(payload)
    return normalized if isinstance(normalized, dict) else {}


def evaluate_derived_fields_for_scope(
    *,
    derived_fields: list[DerivedFieldDefinition],
    scope: dict[str, Any],
    entity_type: EntityType,
    entity_id: int | None = None,
) -> dict[str, Any]:
    """Evaluate a set of derived fields for one entity payload scope."""
    values: dict[str, Any] = {}
    for field in derived_fields:
        try:
            result = _evaluate_json_logic(field.expression_json, scope)
            values[field.key] = _normalize_preview_result(result)
        except Exception as exc:
            # Derived output is best-effort in API payloads so one invalid definition never blocks
            # the base entity response for clients.
            logger.warning(
                "Failed to evaluate derived field %s for %s id=%s: %s",
                field.key,
                entity_type.name,
                entity_id,
                exc,
            )
    return values


async def get_derived_fields(db: AsyncSession, entity_type: EntityType) -> list[DerivedFieldDefinition]:
    """Return stored derived fields for an entity type."""
    if entity_type in _derived_field_cache:
        return list(_derived_field_cache[entity_type])

    setting_def = parse_setting(f"derived_fields_{entity_type.name}")
    try:
        setting = await db_setting.get(db, setting_def)
        setting_value = setting.value
    except ItemNotFoundError:
        setting_value = setting_def.default

    parsed = json.loads(setting_value)
    if not isinstance(parsed, list):
        logger.warning("Setting %s is not a list, using default.", setting_def.key)
        parsed = []

    derived_fields: list[DerivedFieldDefinition] = []
    for raw_value in parsed:
        if not isinstance(raw_value, dict):
            continue
        try:
            derived_fields.append(DerivedFieldDefinition.model_validate(raw_value))
        except ValidationError as exc:
            logger.warning(
                "Skipping invalid derived field for %s (key=%s): %s",
                entity_type.name,
                raw_value.get("key"),
                exc,
            )

    # Return a stable presentation order so settings tables and template variable lists do not
    # re-shuffle unexpectedly when the stored JSON order changes.
    derived_fields.sort(key=lambda item: (item.name.lower(), item.key))
    _derived_field_cache[entity_type] = derived_fields
    return list(derived_fields)


async def get_derived_fields_for_surface(
    db: AsyncSession,
    entity_type: EntityType,
    surface: str | None,
    *,
    api_enabled_only: bool = False,
) -> list[DerivedFieldDefinition]:
    """Get derived fields filtered by surface, preserving the cached stable order."""
    derived_fields = await get_derived_fields(db, entity_type)
    if surface is None:
        filtered_fields = derived_fields
    else:
        filtered_fields = [field for field in derived_fields if surface in field.surfaces]

    if api_enabled_only:
        # API exposure is a field-level opt-in, so formula definitions can remain available in UI
        # surfaces without automatically becoming API output.
        return [field for field in filtered_fields if field.include_in_api]
    return filtered_fields


async def resolve_include_derived_in_api(db: AsyncSession, include_derived: bool | None) -> bool:
    """Resolve per-request include_derived with a settings-level default."""
    if include_derived is not None:
        return include_derived

    setting_def = parse_setting("api_include_derived_fields")
    default_value = json.loads(setting_def.default)
    try:
        setting = await db_setting.get(db, setting_def)
    except ItemNotFoundError:
        return default_value

    try:
        parsed = json.loads(setting.value)
    except json.JSONDecodeError:
        logger.warning("Setting %s is not valid JSON, using default.", setting_def.key)
        return default_value

    if isinstance(parsed, bool):
        return parsed

    logger.warning("Setting %s is not a boolean, using default.", setting_def.key)
    return default_value


async def add_or_update_derived_field(db: AsyncSession, entity_type: EntityType, derived_field: DerivedFieldDefinition) -> None:
    """Create or update a derived field."""
    _validate_expression_payload(derived_field.expression_json)

    existing = await get_derived_fields(db, entity_type)
    next_fields = [field for field in existing if field.key != derived_field.key]
    next_fields.append(derived_field)
    next_fields.sort(key=lambda item: (item.name.lower(), item.key))

    setting_def = parse_setting(f"derived_fields_{entity_type.name}")
    await db_setting.update(
        db=db,
        definition=setting_def,
        value=json.dumps([field.model_dump(mode="json") for field in next_fields]),
    )
    _derived_field_cache[entity_type] = next_fields


async def delete_derived_field(db: AsyncSession, entity_type: EntityType, key: str) -> None:
    """Delete a derived field."""
    existing = await get_derived_fields(db, entity_type)
    next_fields = [field for field in existing if field.key != key]
    if len(next_fields) == len(existing):
        raise ItemNotFoundError(f"Derived field with key {key} does not exist.")

    setting_def = parse_setting(f"derived_fields_{entity_type.name}")
    await db_setting.update(
        db=db,
        definition=setting_def,
        value=json.dumps([field.model_dump(mode="json") for field in next_fields]),
    )
    _derived_field_cache[entity_type] = next_fields

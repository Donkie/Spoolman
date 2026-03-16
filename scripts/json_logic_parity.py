#!/usr/bin/env python3
"""Run JSON Logic parity fixtures against a selected Python runtime."""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
TIME_RE = re.compile(r"^\d{2}:\d{2}:\d{2}$")


@dataclass
class FixtureResult:
    fixture_id: str
    status: str
    detail: str = ""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--fixtures",
        type=Path,
        default=Path("tests_integration/tests/fields/json_logic_parity_fixtures.json"),
        help="Path to JSON fixtures file.",
    )
    parser.add_argument(
        "--engine",
        choices=["json_logic_py"],
        default="json_logic_py",
        help="Python evaluator runtime to use.",
    )
    return parser.parse_args()


def _as_datetime(value: Any) -> datetime:
    if isinstance(value, datetime):
        dt = value
    elif isinstance(value, str):
        normalized = value.strip()
        if normalized.endswith("Z"):
            normalized = f"{normalized[:-1]}+00:00"
        dt = datetime.fromisoformat(normalized)
    else:
        raise ValueError(f"Unsupported datetime input: {value!r}")

    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _date_only(value: Any) -> str:
    return _as_datetime(value).date().isoformat()


def _time_only(value: Any) -> str:
    return _as_datetime(value).time().replace(microsecond=0).isoformat()


def _days_between(start: Any, end: Any) -> float:
    return (_as_datetime(end) - _as_datetime(start)).total_seconds() / 86400


def _hours_between(start: Any, end: Any) -> float:
    return (_as_datetime(end) - _as_datetime(start)).total_seconds() / 3600


def _hue_from_hex(value: Any) -> float:
    if not isinstance(value, str):
        raise ValueError("hue_from_hex expects a hex color string.")

    normalized = value.strip().lstrip("#")
    if len(normalized) == 3:
        normalized = "".join(char * 2 for char in normalized)
    if len(normalized) != 6:
        raise ValueError("hue_from_hex expects 3 or 6 hex digits.")

    red = int(normalized[0:2], 16) / 255
    green = int(normalized[2:4], 16) / 255
    blue = int(normalized[4:6], 16) / 255

    max_value = max(red, green, blue)
    min_value = min(red, green, blue)
    delta = max_value - min_value
    if delta == 0:
        return 0.0

    if max_value == red:
        hue = ((green - blue) / delta) % 6
    elif max_value == green:
        hue = (blue - red) / delta + 2
    else:
        hue = (red - green) / delta + 4

    return round((hue * 60) % 360, 3)


def _coalesce(*values: Any) -> Any:
    for value in values:
        if value is not None:
            return value
    return None


def _replace(value: Any, old: Any, new: Any) -> str:
    return str(value).replace(str(old), str(new))


def _to_number(value: Any) -> float:
    if isinstance(value, bool):
        return float(int(value))
    if isinstance(value, (int, float)):
        return float(value)
    return float(str(value))


def _install_custom_operations(operations: dict[str, Any]) -> None:
    # Keep helper/operator names aligned with the planned Formula Extra Fields vocabulary so this
    # harness reflects the real target behavior instead of raw library defaults.
    operations.update(
        {
            "abs": abs,
            "round": round,
            "floor": math.floor,
            "ceil": math.ceil,
            "coalesce": _coalesce,
            "today": lambda: datetime.now(timezone.utc).date().isoformat(),
            "date_only": _date_only,
            "time_only": _time_only,
            "days_between": _days_between,
            "hours_between": _hours_between,
            "hue_from_hex": _hue_from_hex,
            "upper": lambda value: str(value).upper(),
            "lower": lambda value: str(value).lower(),
            "trim": lambda value: str(value).strip(),
            "length": lambda value: len(value),
            "replace": _replace,
            "timestamp": lambda value: _as_datetime(value).timestamp(),
            "to_number": _to_number,
        },
    )


def _load_engine(engine_name: str) -> Any:
    if engine_name != "json_logic_py":
        raise RuntimeError(f"Unsupported engine: {engine_name}")

    try:
        from json_logic import jsonLogic, operations  # type: ignore[import-not-found]
    except ModuleNotFoundError as exc:
        raise RuntimeError(
            "json-logic-py is not installed. Install candidate runtime first, e.g. "
            "`pip install json-logic-py`.",
        ) from exc

    _install_custom_operations(operations)
    return jsonLogic


def _validate_result_type(value: Any, result_type: str) -> None:
    if result_type == "number":
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise ValueError("result_type_mismatch:number")
        return
    if result_type == "text":
        if not isinstance(value, str):
            raise ValueError("result_type_mismatch:text")
        return
    if result_type == "boolean":
        if not isinstance(value, bool):
            raise ValueError("result_type_mismatch:boolean")
        return
    if result_type == "date":
        if not isinstance(value, str) or DATE_RE.match(value) is None:
            raise ValueError("result_type_mismatch:date")
        return
    if result_type == "time":
        if not isinstance(value, str) or TIME_RE.match(value) is None:
            raise ValueError("result_type_mismatch:time")
        return
    if result_type == "datetime":
        if not isinstance(value, str):
            raise ValueError("result_type_mismatch:datetime")
        _as_datetime(value)
        return
    raise ValueError(f"Unsupported result type: {result_type}")


def _classify_error(exc: Exception) -> str:
    message = str(exc)
    if "Unrecognized operation" in message:
        return "operator_not_allowed"
    if "result_type_mismatch" in message:
        return "result_type_mismatch"
    if any(token in message for token in ["NoneType", "missing", "float()", "unsupported operand"]):
        return "missing_reference"
    return "other"


def _compare_values(actual: Any, expected: Any) -> bool:
    if isinstance(actual, (float, int)) and isinstance(expected, (float, int)):
        return math.isclose(float(actual), float(expected), rel_tol=1e-9, abs_tol=1e-9)
    return actual == expected


def run_fixtures(fixtures_path: Path, engine_name: str) -> list[FixtureResult]:
    evaluator = _load_engine(engine_name)
    fixtures = json.loads(fixtures_path.read_text(encoding="utf-8"))
    results: list[FixtureResult] = []

    for fixture in fixtures:
        fixture_id = fixture["id"]
        result_type = fixture["result_type"]
        expression_json = fixture["expression_json"]
        scope = fixture.get("scope", {})
        expected_error = fixture.get("expect_error")
        expected_value = fixture.get("expected")
        expected_shape = fixture.get("expected_shape")

        try:
            actual = evaluator(expression_json, scope)
            _validate_result_type(actual, result_type)
            if expected_error:
                results.append(
                    FixtureResult(
                        fixture_id=fixture_id,
                        status="fail",
                        detail=f"expected error `{expected_error}` but evaluation succeeded with `{actual!r}`",
                    ),
                )
                continue
            if expected_shape == "yyyy-mm-dd":
                if not isinstance(actual, str) or DATE_RE.match(actual) is None:
                    results.append(
                        FixtureResult(
                            fixture_id=fixture_id,
                            status="fail",
                            detail=f"expected date shape yyyy-mm-dd but got `{actual!r}`",
                        ),
                    )
                    continue
            elif expected_value is not None and not _compare_values(actual, expected_value):
                results.append(
                    FixtureResult(
                        fixture_id=fixture_id,
                        status="fail",
                        detail=f"expected `{expected_value!r}` but got `{actual!r}`",
                    ),
                )
                continue
            results.append(FixtureResult(fixture_id=fixture_id, status="pass"))
        except Exception as exc:  # noqa: BLE001
            if not expected_error:
                results.append(FixtureResult(fixture_id=fixture_id, status="fail", detail=f"unexpected error: {exc}"))
                continue
            actual_error = _classify_error(exc)
            if actual_error != expected_error:
                results.append(
                    FixtureResult(
                        fixture_id=fixture_id,
                        status="fail",
                        detail=f"expected error `{expected_error}` but got `{actual_error}` ({exc})",
                    ),
                )
                continue
            results.append(FixtureResult(fixture_id=fixture_id, status="pass"))

    return results


def main() -> int:
    args = parse_args()
    try:
        results = run_fixtures(args.fixtures, args.engine)
    except RuntimeError as exc:
        print(f"ERROR: {exc}")  # noqa: T201
        return 2

    passed = [result for result in results if result.status == "pass"]
    failed = [result for result in results if result.status != "pass"]

    print(f"Engine: {args.engine}")  # noqa: T201
    print(f"Fixtures: {args.fixtures}")  # noqa: T201
    print(f"Passed: {len(passed)} / {len(results)}")  # noqa: T201
    if failed:
        print("Failures:")  # noqa: T201
        for item in failed:
            print(f"- {item.fixture_id}: {item.detail}")  # noqa: T201
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

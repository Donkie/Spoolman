"""Tests for filtering spools by extra fields on their filament or its vendor.

A spool's own extra fields use `extra.<key>`; its filament's use `filament.extra.<key>` and
that filament's vendor's use `filament.vendor.extra.<key>`. A spool matches when the related
entity matches the extra-field condition.
"""

import json
import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any

import httpx
import pytest

from ..conftest import URL, assert_httpx_success


@contextmanager
def _scenario() -> Iterator[dict[str, Any]]:
    """Set up vendors/filaments/spools spanning a filament choice field and a vendor text field.

    Layout (grade is a filament field, region a vendor field):
      vendor_eu (region=EU): filament_a (Premium), filament_b (Standard), filament_d (no grade)
      vendor_us (region=US): filament_c (Premium)
    Each filament carries one spool (spool_a..spool_d).
    """
    grade_key = f"rel_grade_{uuid.uuid4().hex[:8]}"
    region_key = f"rel_region_{uuid.uuid4().hex[:8]}"
    httpx.post(
        f"{URL}/api/v1/field/filament/{grade_key}",
        json={"name": "Grade", "field_type": "choice", "choices": ["Premium", "Standard"], "multi_choice": False},
    ).raise_for_status()
    httpx.post(
        f"{URL}/api/v1/field/vendor/{region_key}",
        json={"name": "Region", "field_type": "text"},
    ).raise_for_status()

    vendors: list[int] = []
    filaments: list[int] = []
    spools: list[int] = []

    def _vendor(region: str | None) -> int:
        body: dict[str, Any] = {"name": f"Vendor-{uuid.uuid4().hex[:8]}"}
        if region is not None:
            body["extra"] = {region_key: json.dumps(region)}
        result = httpx.post(f"{URL}/api/v1/vendor", json=body)
        result.raise_for_status()
        vid = result.json()["id"]
        vendors.append(vid)
        return vid

    def _filament(vendor_id: int, grade: str | None) -> int:
        body: dict[str, Any] = {
            "vendor_id": vendor_id,
            "name": f"Fil-{uuid.uuid4().hex[:8]}",
            "density": 1.24,
            "diameter": 1.75,
        }
        if grade is not None:
            body["extra"] = {grade_key: json.dumps(grade)}
        result = httpx.post(f"{URL}/api/v1/filament", json=body)
        result.raise_for_status()
        fid = result.json()["id"]
        filaments.append(fid)
        return fid

    def _spool(filament_id: int) -> int:
        result = httpx.post(f"{URL}/api/v1/spool", json={"filament_id": filament_id})
        result.raise_for_status()
        sid = result.json()["id"]
        spools.append(sid)
        return sid

    try:
        vendor_eu = _vendor("EU")
        vendor_us = _vendor("US")
        fa = _filament(vendor_eu, "Premium")
        fb = _filament(vendor_eu, "Standard")
        fc = _filament(vendor_us, "Premium")
        fd = _filament(vendor_eu, None)  # no grade set
        yield {
            "grade_key": grade_key,
            "region_key": region_key,
            "vendor_eu": vendor_eu,
            "vendor_us": vendor_us,
            "spool_a": _spool(fa),
            "spool_b": _spool(fb),
            "spool_c": _spool(fc),
            "spool_d": _spool(fd),
        }
    finally:
        for sid in spools:
            httpx.delete(f"{URL}/api/v1/spool/{sid}").raise_for_status()
        for fid in filaments:
            httpx.delete(f"{URL}/api/v1/filament/{fid}").raise_for_status()
        for vid in vendors:
            httpx.delete(f"{URL}/api/v1/vendor/{vid}").raise_for_status()
        httpx.delete(f"{URL}/api/v1/field/filament/{grade_key}").raise_for_status()
        httpx.delete(f"{URL}/api/v1/field/vendor/{region_key}").raise_for_status()


def _spool_ids(result: httpx.Response) -> set[int]:
    assert_httpx_success(result)
    return {item["id"] for item in result.json()}


@pytest.mark.asyncio
async def test_filter_spools_by_filament_extra_field() -> None:
    """Filtering spools by a filament extra field matches spools whose filament has that value."""
    with _scenario() as s:
        grade = s["grade_key"]

        ids = _spool_ids(httpx.get(f"{URL}/api/v1/spool", params={f"filament.extra.{grade}": '"Premium"'}))
        assert s["spool_a"] in ids
        assert s["spool_c"] in ids
        assert s["spool_b"] not in ids
        assert s["spool_d"] not in ids

        ids = _spool_ids(httpx.get(f"{URL}/api/v1/spool", params={f"filament.extra.{grade}": '"Standard"'}))
        assert ids & {s["spool_a"], s["spool_b"], s["spool_c"], s["spool_d"]} == {s["spool_b"]}


@pytest.mark.asyncio
async def test_filter_spools_by_vendor_extra_field() -> None:
    """Filtering spools by a vendor extra field matches spools whose filament's vendor has that value."""
    with _scenario() as s:
        region = s["region_key"]

        ids = _spool_ids(httpx.get(f"{URL}/api/v1/spool", params={f"filament.vendor.extra.{region}": '"EU"'}))
        assert s["spool_a"] in ids
        assert s["spool_b"] in ids
        assert s["spool_d"] in ids
        assert s["spool_c"] not in ids

        ids = _spool_ids(httpx.get(f"{URL}/api/v1/spool", params={f"filament.vendor.extra.{region}": '"US"'}))
        assert ids & {s["spool_a"], s["spool_b"], s["spool_c"], s["spool_d"]} == {s["spool_c"]}


@pytest.mark.asyncio
async def test_filter_spools_by_filament_and_vendor_extra_anded() -> None:
    """Filament and vendor extra-field filters compose (AND) together, and with each other."""
    with _scenario() as s:
        grade, region = s["grade_key"], s["region_key"]

        # Premium AND EU -> only spool_a (spool_c is Premium but US; spool_b is EU but Standard).
        ids = _spool_ids(
            httpx.get(
                f"{URL}/api/v1/spool",
                params={f"filament.extra.{grade}": '"Premium"', f"filament.vendor.extra.{region}": '"EU"'},
            )
        )
        assert ids & {s["spool_a"], s["spool_b"], s["spool_c"], s["spool_d"]} == {s["spool_a"]}

        # Contradictory combination matches nothing.
        ids = _spool_ids(
            httpx.get(
                f"{URL}/api/v1/spool",
                params={f"filament.extra.{grade}": '"Standard"', f"filament.vendor.extra.{region}": '"US"'},
            )
        )
        assert ids & {s["spool_a"], s["spool_b"], s["spool_c"], s["spool_d"]} == set()


@pytest.mark.asyncio
async def test_filter_spools_by_filament_extra_multi_value_or() -> None:
    """A comma-separated filament extra-field filter matches any of the listed values (OR)."""
    with _scenario() as s:
        grade = s["grade_key"]
        ids = _spool_ids(httpx.get(f"{URL}/api/v1/spool", params={f"filament.extra.{grade}": '"Premium","Standard"'}))
        assert {s["spool_a"], s["spool_b"], s["spool_c"]} <= ids
        assert s["spool_d"] not in ids  # spool_d's filament has no grade


@pytest.mark.asyncio
async def test_empty_filter_on_filament_extra_field() -> None:
    """The empty filter on a filament extra field returns spools whose filament has no value set."""
    with _scenario() as s:
        grade = s["grade_key"]
        ids = _spool_ids(httpx.get(f"{URL}/api/v1/spool", params={f"filament.extra.{grade}": ""}))
        assert s["spool_d"] in ids  # filament_d has no grade
        assert s["spool_a"] not in ids
        assert s["spool_b"] not in ids
        assert s["spool_c"] not in ids


@pytest.mark.asyncio
async def test_unknown_related_extra_field_is_ignored() -> None:
    """Filtering on an undefined filament/vendor extra field is ignored, not a 400."""
    with _scenario() as s:
        result = httpx.get(f"{URL}/api/v1/spool", params={"filament.extra.nope": "whatever"})
        assert s["spool_a"] in _spool_ids(result)
        result = httpx.get(f"{URL}/api/v1/spool", params={"filament.vendor.extra.nope": "whatever"})
        assert s["spool_a"] in _spool_ids(result)


@pytest.mark.asyncio
async def test_group_spools_by_vendor_with_filament_extra_filter() -> None:
    """The /spool/group endpoint honours filament/vendor extra-field filters too."""
    with _scenario() as s:
        grade = s["grade_key"]
        result = httpx.get(
            f"{URL}/api/v1/spool/group",
            params={"group_by": "vendor", f"filament.extra.{grade}": '"Premium"'},
        )
        assert_httpx_success(result)
        groups = result.json()
        counts = {g["key"]: g["spool_count"] for g in groups}
        # vendor_eu has one Premium spool (spool_a); vendor_us has one (spool_c).
        assert counts.get(str(s["vendor_eu"])) == 1
        assert counts.get(str(s["vendor_us"])) == 1

"""Integration tests for POST /tag/scan with hostile tag values, and the list endpoints after them.

Decoding is best effort, but `create: true` writes to the database. A tag whose values the API
would reject must come back as a scan that created nothing, and GET /filament and GET /spool must
keep working afterwards: Moonraker and OctoPrint poll those endpoints, and a bad sticker must not
be able to take them down.
"""

import base64
import math
import uuid
from typing import Any

import httpx
import pytest

from .._openprinttag_fixtures import (
    MF_BRAND_NAME,
    MF_DENSITY,
    MF_EMPTY_CONTAINER_WEIGHT,
    MF_FILAMENT_DIAMETER,
    MF_MATERIAL_NAME,
    MF_MATERIAL_TYPE,
    MF_NOMINAL_NETTO_FULL_WEIGHT,
    MF_PRIMARY_COLOR,
    build_openprinttag,
)
from ..conftest import URL, assert_httpx_success
from .test_scan_create import _delete_created_spool

_ACTUAL_NETTO_FULL_WEIGHT = 17
_BASE_MAIN: dict[int, Any] = {
    8: 0,  # material_class: FFF
    MF_MATERIAL_TYPE: 0,
    MF_MATERIAL_NAME: "PLA",
    MF_BRAND_NAME: "Vendor",
    MF_DENSITY: 1.24,
    MF_FILAMENT_DIAMETER: 1.75,
    MF_NOMINAL_NETTO_FULL_WEIGHT: 1000.0,
    MF_EMPTY_CONTAINER_WEIGHT: 140.0,
    MF_PRIMARY_COLOR: bytes([0x3D, 0x3E, 0x3D]),
}

# Each case replaces one field of a valid tag with a value a codec can read but the API must refuse.
_HOSTILE_VALUES: list[Any] = [
    pytest.param({MF_DENSITY: [1, 2]}, id="density-is-a-list"),
    pytest.param({MF_DENSITY: 2**80}, id="density-is-a-bignum"),
    pytest.param({MF_DENSITY: float("nan")}, id="density-is-nan"),
    pytest.param({MF_DENSITY: float("inf")}, id="density-is-infinite"),
    pytest.param({MF_DENSITY: -1.0}, id="density-is-negative"),
    pytest.param({MF_MATERIAL_TYPE: [1, 2]}, id="material-type-is-a-list"),
    pytest.param({MF_NOMINAL_NETTO_FULL_WEIGHT: float("inf")}, id="weight-is-infinite"),
    pytest.param({_ACTUAL_NETTO_FULL_WEIGHT: float("nan")}, id="measured-weight-is-nan"),
    pytest.param({MF_MATERIAL_NAME: "x" * 70}, id="name-too-long"),
    pytest.param({MF_BRAND_NAME: "y" * 70}, id="brand-too-long"),
]


def _scan(main: dict[int, Any], *, uid: str | None = None, create: bool | None = None) -> httpx.Response:
    body: dict[str, Any] = {
        "uid": uid or uuid.uuid4().hex[:14].upper(),
        "reader_id": f"reader-{uuid.uuid4().hex[:8]}",
        "format": "openprinttag",
        "payload_b64": base64.b64encode(build_openprinttag(main)).decode("ascii"),
    }
    if create is not None:
        body["create"] = create
    return httpx.post(f"{URL}/api/v1/tag/scan", json=body)


def _assert_list_endpoints_still_work() -> None:
    for path in ("/api/v1/filament", "/api/v1/spool"):
        assert_httpx_success(httpx.get(f"{URL}{path}"))


@pytest.mark.parametrize("override", _HOSTILE_VALUES)
def test_hostile_values_with_create_true_create_nothing_and_keep_the_lists_working(override: dict[int, Any]):
    result = _scan({**_BASE_MAIN, **override}, create=True)
    assert_httpx_success(result)
    body = result.json()

    assert body.get("created") is not True
    assert "spool" not in body
    _assert_list_endpoints_still_work()


@pytest.mark.parametrize("override", _HOSTILE_VALUES)
def test_hostile_values_without_create_still_scan_normally(override: dict[int, Any]):
    result = _scan({**_BASE_MAIN, **override})
    assert_httpx_success(result)
    assert result.json().get("created") is not True
    _assert_list_endpoints_still_work()


def test_odd_length_uid_scans_instead_of_erroring():
    """normalize_uid accepts an odd number of hex digits; decoding must not turn that into a 500."""
    result = _scan(_BASE_MAIN, uid="ABC")
    assert_httpx_success(result)
    assert result.json()["uid"] == "ABC"
    _assert_list_endpoints_still_work()


def test_a_valid_tag_with_create_true_still_creates_one_roll_and_reuses_the_filament():
    """The happy path next to the failures: a valid tag creates a spool, and a second roll reuses the filament."""
    product = {**_BASE_MAIN, MF_BRAND_NAME: f"Vendor {uuid.uuid4().hex[:8]}"}
    first = _scan(product, create=True)
    assert_httpx_success(first)
    assert first.json()["created"] is True
    created = first.json()["spool"]

    try:
        second = _scan(product, create=True)
        assert_httpx_success(second)
        assert second.json()["created"] is True
        assert second.json()["spool"]["filament"]["id"] == created["filament"]["id"]
    finally:
        _delete_created_spool(created)
        _delete_created_spool(second.json()["spool"])
    _assert_list_endpoints_still_work()


def test_nan_is_not_serialized_in_a_response():
    """A NaN that reached the response would break the JSON for every client that reads it."""
    result = _scan({**_BASE_MAIN, MF_DENSITY: float("nan")})
    assert_httpx_success(result)
    decoded = result.json().get("decoded") or {}
    assert not any(isinstance(v, float) and math.isnan(v) for v in decoded.values())

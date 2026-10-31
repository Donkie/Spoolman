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

import cbor2
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
    build_openprinttag_from_payload,
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
    pytest.param({MF_DENSITY: 5e-324}, id="density-is-a-denormal-near-zero"),
    pytest.param({MF_NOMINAL_NETTO_FULL_WEIGHT: 1e308}, id="weight-is-absurdly-large"),
    # A CBOR semantic tag (major type 6). cbor2 can validate a tag's argument and build its
    # error message with repr(value) -- unbounded if value is a shared-reference graph -- before
    # any validation of ours runs, even at constant nesting depth. The fix refuses every
    # semantic tag outright; this is the shape, not the exploit payload itself (see
    # tests/test_openprinttag_codec.py for the direct unit coverage of the decode-time guard).
    pytest.param({MF_DENSITY: cbor2.CBORTag(260, b"\x01\x02\x03\x04")}, id="density-is-a-semantic-tag"),
    pytest.param({MF_FILAMENT_DIAMETER: 0}, id="diameter-is-zero"),
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


def _row_counts() -> tuple[int, int, int]:
    """Rows in vendor, filament and spool, from the list endpoints' total counts."""
    counts = []
    for path in ("/api/v1/vendor", "/api/v1/filament", "/api/v1/spool"):
        response = httpx.get(f"{URL}{path}")
        assert_httpx_success(response)
        counts.append(int(response.headers["x-total-count"]))
    return counts[0], counts[1], counts[2]


@pytest.mark.parametrize("override", _HOSTILE_VALUES)
def test_hostile_values_with_create_true_create_nothing_and_keep_the_lists_working(override: dict[int, Any]):
    before = _row_counts()
    result = _scan({**_BASE_MAIN, **override}, create=True)
    assert_httpx_success(result)
    body = result.json()

    assert body.get("created") is not True
    assert "spool" not in body
    # A refused value is not echoed back either: the tag reads as undecodable.
    assert "decoded" not in body
    assert _row_counts() == before
    _assert_list_endpoints_still_work()


@pytest.mark.parametrize("override", _HOSTILE_VALUES)
def test_hostile_values_without_create_still_scan_normally(override: dict[int, Any]):
    result = _scan({**_BASE_MAIN, **override})
    assert_httpx_success(result)
    assert result.json().get("created") is not True
    _assert_list_endpoints_still_work()


def test_odd_length_uid_is_refused_with_400():
    """normalize_uid rejects an odd number of hex digits, so the scan answers 400 rather than decoding."""
    result = _scan(_BASE_MAIN, uid="ABC")
    assert result.status_code == 400
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


def test_filament_reuse_tolerates_small_diameter_and_weight_differences():
    """Different readings of the same real-world roll (float rounding) must not create a duplicate."""
    product = {**_BASE_MAIN, MF_BRAND_NAME: f"Vendor {uuid.uuid4().hex[:8]}"}
    first = _scan(product, create=True)
    assert_httpx_success(first)
    created = first.json()["spool"]

    nearby = {
        **product,
        MF_FILAMENT_DIAMETER: 1.751,  # within the 0.01mm matching tolerance
        MF_NOMINAL_NETTO_FULL_WEIGHT: 1000.5,  # within the 1g matching tolerance
    }
    try:
        second = _scan(nearby, create=True)
        assert_httpx_success(second)
        assert second.json()["created"] is True
        assert second.json()["spool"]["filament"]["id"] == created["filament"]["id"]
    finally:
        _delete_created_spool(created)
        _delete_created_spool(second.json()["spool"])
    _assert_list_endpoints_still_work()


def test_filament_reuse_does_not_merge_different_colors():
    """Same vendor/name/material, different color: must be two filaments, not one."""
    product = {**_BASE_MAIN, MF_BRAND_NAME: f"Vendor {uuid.uuid4().hex[:8]}"}
    red = _scan(product, create=True)
    assert_httpx_success(red)
    red_spool = red.json()["spool"]

    black = {**product, MF_PRIMARY_COLOR: bytes([0x00, 0x00, 0x00])}
    try:
        black_result = _scan(black, create=True)
        assert_httpx_success(black_result)
        black_spool = black_result.json()["spool"]
        assert black_spool["filament"]["id"] != red_spool["filament"]["id"]
    finally:
        _delete_created_spool(red_spool)
        _delete_created_spool(black_spool)
    _assert_list_endpoints_still_work()


def test_nan_is_not_serialized_in_a_response():
    """A NaN that reached the response would break the JSON for every client that reads it."""
    result = _scan({**_BASE_MAIN, MF_DENSITY: float("nan")})
    assert_httpx_success(result)
    decoded = result.json().get("decoded") or {}
    assert not any(isinstance(v, float) and math.isnan(v) for v in decoded.values())


def test_nested_shared_references_are_refused_without_expanding():
    """A deeply nested CBOR value must come back as undecodable, not allocate its expansion."""
    nested: Any = 1
    for _ in range(20):
        nested = [nested]
    result = _scan({**_BASE_MAIN, MF_MATERIAL_NAME: nested}, create=True)
    assert_httpx_success(result)
    assert "decoded" not in result.json()
    _assert_list_endpoints_still_work()


def test_non_ascii_payload_scans_instead_of_erroring():
    """Non-ASCII text is not base64. The scan must answer as usual, not return a 500."""
    response = httpx.post(
        f"{URL}/api/v1/tag/scan",
        json={
            "uid": uuid.uuid4().hex[:14].upper(),
            "reader_id": f"reader-{uuid.uuid4().hex[:8]}",
            "format": "openprinttag",
            "payload_b64": "pagé==",
        },
    )
    assert_httpx_success(response)
    assert "decoded" not in response.json()
    _assert_list_endpoints_still_work()


def _shared_reference_bomb(levels: int) -> bytes:
    """Build a flat list of shareable arrays (CBOR tags 28/29) ending in a malformed tag 260.

    Each array refers twice to the one before, so the object graph doubles per level at constant
    nesting depth: a depth cap never trips. cbor2 formats repr(value) of it into the error message
    for the malformed tag, inside decode(), before any validation here can run. About 300 bytes of
    this fit on one SLIX2 tag and took the API down.
    """
    steps = "".join(f"d81c82d81d{k - 1:02x}d81d{k - 1:02x}" for k in range(1, levels))
    return bytes.fromhex("9f" + "d81c8100" + steps + f"d9010481d81d{levels - 1:02x}" + "ff")


@pytest.mark.parametrize("create", [None, True])
def test_shared_reference_bomb_is_refused_before_cbor2_expands_it(create: bool | None):  # noqa: FBT001
    """Semantic tags are refused outright, so the scan answers quickly and the lists keep working."""
    before = _row_counts()
    payload = b"\xa0" + _shared_reference_bomb(14)  # empty meta, then a main section made of the bomb
    body: dict[str, Any] = {
        "uid": uuid.uuid4().hex[:14].upper(),
        "reader_id": f"reader-{uuid.uuid4().hex[:8]}",
        "format": "openprinttag",
        "payload_b64": base64.b64encode(build_openprinttag_from_payload(payload)).decode("ascii"),
    }
    if create is not None:
        body["create"] = create

    result = httpx.post(f"{URL}/api/v1/tag/scan", json=body, timeout=10)

    assert_httpx_success(result)
    assert result.elapsed.total_seconds() < 5  # the bomb took seconds and gigabytes before the guard
    assert "decoded" not in result.json()
    assert result.json().get("created") is not True
    assert _row_counts() == before
    _assert_list_endpoints_still_work()

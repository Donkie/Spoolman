"""Integration tests for POST /tag/scan with hostile or malformed TigerTag payloads.

TigerTag is a fixed-width, big-endian `struct`-packed binary format, not a self-describing
one like OpenPrintTag's CBOR -- so the type-confusion attacks test_scan_hostile.py covers
(a number field holding a list, a bignum, NaN, Infinity) cannot arrive here: every field is
a plain unsigned int of a fixed byte width, and there is no way to encode a float, a
container, or an out-of-range Python type into any of them. What TigerTag *can* carry that
still needs guarding against is a value that's technically a valid unsigned int but wrong
in a way that matters (a weight over any real spool's size, a unit that silently rescales
the weight, truncated or garbage bytes) -- this file covers those instead.
"""

import base64
import uuid
from typing import Any

import httpx

from .._tigertag_fixtures import TIGERTAG_INIT, build_tigertag
from ..conftest import URL, assert_httpx_success
from .test_scan_create import _delete_created_spool
from .test_scan_hostile import _assert_list_endpoints_still_work, _row_counts


def _uid() -> str:
    return uuid.uuid4().hex[:14].upper()


def _reader_id() -> str:
    return f"reader-{uuid.uuid4().hex[:8]}"


def _scan(raw: bytes, *, create: bool | None = None) -> httpx.Response:
    body: dict[str, Any] = {
        "uid": _uid(),
        "reader_id": _reader_id(),
        "format": "tigertag",
        "payload_b64": base64.b64encode(raw).decode("ascii"),
    }
    if create is not None:
        body["create"] = create
    return httpx.post(f"{URL}/api/v1/tag/scan", json=body)


def test_weight_over_the_supported_range_creates_nothing():
    """The 24-bit measure field's max is still accepted by the codec, but far too heavy.

    16,777,215g is well outside any real spool -- the shared range check in
    database/tag.py must refuse it.
    """
    before = _row_counts()
    raw = build_tigertag(weight=0xFFFFFF, color_hex="112233")  # grams unit (the default)
    result = _scan(raw, create=True)
    assert_httpx_success(result)
    body = result.json()

    assert body.get("created") is not True
    assert "spool" not in body
    assert _row_counts() == before
    _assert_list_endpoints_still_work()


def test_a_non_gram_unit_creates_a_spool_with_no_weight_instead_of_a_scaled_one():
    """A tag reporting its weight in kilograms must not silently become a wrong gram value.

    It must come through as no weight at all, same as OpenPrintTag's never-defined fields.
    """
    raw = build_tigertag(weight=1000, id_unit=35, color_hex="112233")  # 35 = kilograms
    result = _scan(raw, create=True)
    assert_httpx_success(result)
    body = result.json()
    try:
        assert body["created"] is True
        assert body["spool"]["filament"].get("weight") is None
    finally:
        _delete_created_spool(body["spool"])


def test_too_short_payload_creates_nothing():
    before = _row_counts()
    result = _scan(b"\x00" * 10, create=True)
    assert_httpx_success(result)
    body = result.json()

    assert body.get("created") is not True
    assert "decoded" not in body
    assert _row_counts() == before
    _assert_list_endpoints_still_work()


def test_unmapped_magic_number_creates_nothing():
    before = _row_counts()
    raw = build_tigertag(id_tigertag=0xDEADBEEF, color_hex="112233")
    result = _scan(raw, create=True)
    assert_httpx_success(result)
    body = result.json()

    assert body.get("created") is not True
    assert "decoded" not in body
    assert _row_counts() == before
    _assert_list_endpoints_still_work()


def test_blank_init_tag_creates_nothing():
    before = _row_counts()
    raw = build_tigertag(id_tigertag=TIGERTAG_INIT)
    result = _scan(raw, create=True)
    assert_httpx_success(result)
    body = result.json()

    assert body.get("created") is not True
    assert "decoded" not in body
    assert _row_counts() == before
    _assert_list_endpoints_still_work()


def test_unmapped_diameter_id_still_creates_using_the_default():
    """An id_diameter the codec doesn't recognize decodes as 'not set', same as OpenPrintTag.

    Create still succeeds, falling back to the 1.75mm default rather than refusing the
    whole tag.
    """
    raw = build_tigertag(id_diameter=99, weight=1000, color_hex="112233")
    result = _scan(raw, create=True)
    assert_httpx_success(result)
    body = result.json()
    try:
        assert body["created"] is True
        assert body["spool"]["filament"]["diameter"] == 1.75
    finally:
        _delete_created_spool(body["spool"])

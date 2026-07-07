"""Tests for TigerTag product pagination.

Oracle: the observable HTTP conversation — pagination follows ``nextPage`` until
the API returns None, and a misbehaving API whose ``nextPage`` never becomes None
is cut off at the ``TIGERTAG_MAX_PAGES`` safety bound with a warning instead of
spinning forever. The network boundary is mocked with respx.
"""

import logging

import pytest
import respx
from httpx import Response

from spoolman import tigertagdb
from spoolman.tigertagdb import _fetch_all_products

BASE_URL = "https://tigertag.example.test/api/"
PRODUCTS_URL = BASE_URL + "product/get/all"


@respx.mock
async def test_pagination_follows_next_page_until_none():
    route = respx.post(PRODUCTS_URL).mock(
        side_effect=[
            Response(200, json={"items": [{"id": 1}, {"id": 2}], "nextPage": 2}),
            Response(200, json={"items": [{"id": 3}], "nextPage": None}),
        ],
    )

    items = await _fetch_all_products(BASE_URL)

    assert items == [{"id": 1}, {"id": 2}, {"id": 3}]
    assert route.call_count == 2


@respx.mock
async def test_pagination_stops_at_safety_cap_on_looping_api(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
):
    """A nextPage that never becomes None must stop at the page cap, not loop forever."""
    monkeypatch.setattr(tigertagdb, "TIGERTAG_MAX_PAGES", 7)
    # nextPage always points back at page 2 — an infinite loop without the cap.
    route = respx.post(PRODUCTS_URL).mock(
        return_value=Response(200, json={"items": [{"id": 99}], "nextPage": 2}),
    )

    with caplog.at_level(logging.WARNING, logger="spoolman.tigertagdb"):
        items = await _fetch_all_products(BASE_URL)

    assert route.call_count == 7
    assert len(items) == 7
    assert any("safety limit" in record.message for record in caplog.records)

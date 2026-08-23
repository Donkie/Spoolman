"""Tests for the optional TigerTag external database add-on."""

import json
from collections.abc import Callable
from pathlib import Path
from unittest.mock import MagicMock

import httpx
import pytest

from spoolman import tigertagdb
from spoolman.tigertagdb import TigerTagProduct, _parse_weight_from_measure, _to_external_filament

# --- _parse_weight_from_measure -----------------------------------------------------


@pytest.mark.parametrize(
    ("measure", "expected"),
    [
        ("1 kg", 1000.0),
        ("1kg", 1000.0),
        ("0.75 kg", 750.0),
        ("500 g", 500.0),
        ("500g", 500.0),
        (None, 1000.0),
        ("", 1000.0),
        ("not a weight", 1000.0),
    ],
)
def test_parse_weight_from_measure(measure: str | None, expected: float) -> None:
    assert _parse_weight_from_measure(measure) == expected


# --- _to_external_filament -----------------------------------------------------------


def test_to_external_filament_full_product() -> None:
    product = TigerTagProduct(
        id=2995423176,
        brand="Rosa3D",
        title="Rosa3D PLA Starter",
        material="PLA",
        color="112233ff",
        measure="1 kg",
    )
    ext = _to_external_filament(product)

    assert ext.id == "tigertag_2995423176"
    assert ext.manufacturer == "Rosa3D"
    assert ext.name == "Rosa3D PLA Starter"
    assert ext.material == "PLA"
    assert ext.weight == 1000.0
    assert ext.diameter == 1.75
    assert ext.color_hex == "112233"  # alpha channel stripped
    assert ext.source == "tigertag"


def test_to_external_filament_strips_leading_hash_and_keeps_rgb_only_color() -> None:
    product = TigerTagProduct(id=1, color="#aabbcc")
    ext = _to_external_filament(product)
    assert ext.color_hex == "aabbcc"


def test_to_external_filament_defaults_when_fields_missing() -> None:
    product = TigerTagProduct(id=1)
    ext = _to_external_filament(product)

    assert ext.manufacturer == "Unknown"
    assert ext.material == "Unknown"
    assert ext.name == "Unknown Unknown"
    assert ext.color_hex is None
    assert ext.weight == 1000.0


# --- lookup_brand_name / lookup_material_name / lookup_material_density -------------


@pytest.fixture
def cache_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    monkeypatch.setattr(tigertagdb.filecache, "get_cache_dir", lambda: tmp_path)
    return tmp_path


def test_lookup_brand_name_hit(cache_dir: Path) -> None:
    (cache_dir / tigertagdb.TIGERTAG_BRANDS_CACHE_FILE).write_text(
        json.dumps([{"id": 19961, "name": "Rosa3D", "type_ids": [142]}]),
    )
    assert tigertagdb.lookup_brand_name(19961) == "Rosa3D"


def test_lookup_brand_name_miss_returns_none(cache_dir: Path) -> None:
    (cache_dir / tigertagdb.TIGERTAG_BRANDS_CACHE_FILE).write_text(json.dumps([{"id": 1, "name": "Other"}]))
    assert tigertagdb.lookup_brand_name(99999) is None


def test_lookup_brand_name_no_cache_file_returns_none(cache_dir: Path) -> None:
    assert not (cache_dir / tigertagdb.TIGERTAG_BRANDS_CACHE_FILE).exists()
    assert tigertagdb.lookup_brand_name(19961) is None


def test_lookup_brand_name_corrupt_cache_returns_none(cache_dir: Path) -> None:
    (cache_dir / tigertagdb.TIGERTAG_BRANDS_CACHE_FILE).write_text("not json")
    assert tigertagdb.lookup_brand_name(19961) is None


def test_lookup_material_name_hit(cache_dir: Path) -> None:
    (cache_dir / tigertagdb.TIGERTAG_MATERIALS_CACHE_FILE).write_text(
        json.dumps([{"id": 38219, "label": "PLA", "density": 1.24}]),
    )
    assert tigertagdb.lookup_material_name(38219) == "PLA"


def test_lookup_material_density_hit(cache_dir: Path) -> None:
    (cache_dir / tigertagdb.TIGERTAG_MATERIALS_CACHE_FILE).write_text(
        json.dumps([{"id": 38219, "label": "PLA", "density": 1.24}]),
    )
    assert tigertagdb.lookup_material_density(38219) == 1.24


def test_lookup_material_density_missing_density_field_returns_none(cache_dir: Path) -> None:
    (cache_dir / tigertagdb.TIGERTAG_MATERIALS_CACHE_FILE).write_text(json.dumps([{"id": 1, "label": "PLA"}]))
    assert tigertagdb.lookup_material_density(1) is None


# --- lookup_product_by_tag (real-time API) -------------------------------------------


def _mock_client(monkeypatch: pytest.MonkeyPatch, handler: Callable[[httpx.Request], httpx.Response]) -> None:
    transport = httpx.MockTransport(handler)
    # tigertagdb.httpx and this module's httpx are the same module object (Python
    # caches imports), so capture the real class before patching it -- otherwise the
    # factory below would call the patched attribute and recurse into itself.
    real_async_client = httpx.AsyncClient

    def _factory(*args: object, **kwargs: object) -> httpx.AsyncClient:
        kwargs["transport"] = transport
        return real_async_client(*args, **kwargs)  # type: ignore[arg-type]

    monkeypatch.setattr(tigertagdb.httpx, "AsyncClient", _factory)


@pytest.mark.asyncio
async def test_lookup_product_by_tag_disabled_makes_no_request(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(tigertagdb, "is_tigertag_enabled", lambda: False)

    def _handler(_request: httpx.Request) -> httpx.Response:
        pytest.fail("No HTTP request should be made when the add-on is disabled")

    _mock_client(monkeypatch, _handler)

    assert await tigertagdb.lookup_product_by_tag("04A2B3C4", 28) is None


@pytest.mark.asyncio
async def test_lookup_product_by_tag_success(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(tigertagdb, "is_tigertag_enabled", lambda: True)

    def _handler(request: httpx.Request) -> httpx.Response:
        assert request.url.params["uid"] == "04A2B3C4"
        assert request.url.params["product_id"] == "28"
        return httpx.Response(200, json={"id": 28, "brand": "Rosa3D", "material": "PLA"})

    _mock_client(monkeypatch, _handler)

    ext = await tigertagdb.lookup_product_by_tag("04A2B3C4", 28)
    assert ext is not None
    assert ext.id == "tigertag_28"
    assert ext.manufacturer == "Rosa3D"


@pytest.mark.asyncio
async def test_lookup_product_by_tag_not_found_returns_none(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(tigertagdb, "is_tigertag_enabled", lambda: True)
    _mock_client(monkeypatch, lambda _r: httpx.Response(404))

    assert await tigertagdb.lookup_product_by_tag("04A2B3C4", 28) is None


@pytest.mark.asyncio
async def test_lookup_product_by_tag_server_error_returns_none(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(tigertagdb, "is_tigertag_enabled", lambda: True)
    _mock_client(monkeypatch, lambda _r: httpx.Response(500))

    assert await tigertagdb.lookup_product_by_tag("04A2B3C4", 28) is None


@pytest.mark.asyncio
async def test_lookup_product_by_tag_malformed_body_returns_none(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(tigertagdb, "is_tigertag_enabled", lambda: True)
    _mock_client(monkeypatch, lambda _r: httpx.Response(200, content=b"not json"))

    assert await tigertagdb.lookup_product_by_tag("04A2B3C4", 28) is None


# --- _sync_tigertag end-to-end (mocked API + cache dir) -------------------------------


@pytest.mark.asyncio
async def test_sync_tigertag_writes_filaments_brands_and_materials_cache(
    cache_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def _handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("product/get/all"):
            body = json.loads(request.content)
            if body["page"] == 1:
                return httpx.Response(
                    200,
                    json={
                        "items": [{"id": 1, "brand": "Rosa3D", "material": "PLA", "measure": "1 kg"}],
                        "nextPage": 2,
                    },
                )
            return httpx.Response(200, json={"items": [{"id": 2, "brand": "Sunlu", "material": "PETG"}]})
        if request.url.path.endswith("brand/get/all"):
            return httpx.Response(200, json={"items": [{"id": 19961, "name": "Rosa3D"}]})
        if request.url.path.endswith("material/get/all"):
            return httpx.Response(200, json={"items": [{"id": 38219, "label": "PLA", "density": 1.24}]})
        pytest.fail(f"Unexpected request: {request.url}")

    _mock_client(monkeypatch, _handler)

    await tigertagdb._sync_tigertag()  # noqa: SLF001

    filaments = json.loads((cache_dir / tigertagdb.TIGERTAG_CACHE_FILE).read_bytes())
    assert {f["id"] for f in filaments} == {"tigertag_1", "tigertag_2"}

    brands = json.loads((cache_dir / tigertagdb.TIGERTAG_BRANDS_CACHE_FILE).read_bytes())
    assert brands == [{"id": 19961, "name": "Rosa3D"}]

    materials = json.loads((cache_dir / tigertagdb.TIGERTAG_MATERIALS_CACHE_FILE).read_bytes())
    assert materials == [{"id": 38219, "label": "PLA", "density": 1.24}]


@pytest.mark.asyncio
async def test_sync_tigertag_one_endpoint_failing_does_not_block_the_others(
    cache_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Cover the three-way independence of the sync steps.

    Products, brands and materials are synced independently; a broken products fetch
    (say, an API outage mid-pagination) shouldn't prevent the brand/material caches --
    which other lookups depend on -- from still being refreshed.
    """

    def _handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("product/get/all"):
            return httpx.Response(500)
        if request.url.path.endswith("brand/get/all"):
            return httpx.Response(200, json={"items": [{"id": 1, "name": "Rosa3D"}]})
        if request.url.path.endswith("material/get/all"):
            return httpx.Response(200, json={"items": [{"id": 1, "label": "PLA"}]})
        pytest.fail(f"Unexpected request: {request.url}")

    _mock_client(monkeypatch, _handler)

    await tigertagdb._sync_tigertag()  # noqa: SLF001

    assert not (cache_dir / tigertagdb.TIGERTAG_CACHE_FILE).exists()
    assert (cache_dir / tigertagdb.TIGERTAG_BRANDS_CACHE_FILE).exists()
    assert (cache_dir / tigertagdb.TIGERTAG_MATERIALS_CACHE_FILE).exists()


# --- schedule_tasks -------------------------------------------------------------------


def test_schedule_tasks_disabled_schedules_nothing(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(tigertagdb, "is_tigertag_enabled", lambda: False)
    scheduler = MagicMock()

    tigertagdb.schedule_tasks(scheduler)

    scheduler.once.assert_not_called()
    scheduler.cyclic.assert_not_called()


def test_schedule_tasks_enabled_schedules_startup_and_cyclic_sync(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(tigertagdb, "is_tigertag_enabled", lambda: True)
    monkeypatch.setattr(tigertagdb, "get_tigertag_sync_interval", lambda: 3600)
    scheduler = MagicMock()

    tigertagdb.schedule_tasks(scheduler)

    scheduler.once.assert_called_once()
    scheduler.cyclic.assert_called_once()


def test_schedule_tasks_zero_interval_skips_cyclic_sync(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(tigertagdb, "is_tigertag_enabled", lambda: True)
    monkeypatch.setattr(tigertagdb, "get_tigertag_sync_interval", lambda: 0)
    scheduler = MagicMock()

    tigertagdb.schedule_tasks(scheduler)

    scheduler.once.assert_called_once()
    scheduler.cyclic.assert_not_called()

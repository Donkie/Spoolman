"""Tests for the hishel-backed download cache (TESTING_CANDIDATES rows 99-100).

Oracle: the observable caching behavior — a cacheable response is fetched once and
the second download is served from the shared storage without hitting the network.
The network boundary is mocked with respx; the module-level cache storage is swapped
for a throwaway temp SQLite store so the real cache isn't touched.
"""

from pathlib import Path

import hishel
import pytest
import respx
from httpx import HTTPStatusError, Response

from spoolman import externaldb
from spoolman.externaldb import _download_file


@pytest.fixture
def _isolated_cache(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Point the module's cache storage at a throwaway SQLite file for the test."""
    storage = hishel.AsyncSqliteStorage(database_path=tmp_path / "hishel.sqlite")
    # _download_file resolves cache_storage from the module namespace at call time,
    # so patching the module attribute is enough even though we import the function.
    monkeypatch.setattr(externaldb, "cache_storage", storage)


@pytest.mark.usefixtures("_isolated_cache")
@respx.mock
async def test_download_file_returns_the_body():
    url = "https://db.example.test/filaments.json"
    route = respx.get(url).mock(return_value=Response(200, content=b'{"ok": true}'))
    data = await _download_file(url)
    assert data == b'{"ok": true}'
    assert route.called


@pytest.mark.usefixtures("_isolated_cache")
@respx.mock
async def test_second_download_is_served_from_cache():
    url = "https://db.example.test/materials.json"
    route = respx.get(url).mock(
        return_value=Response(200, headers={"Cache-Control": "max-age=3600"}, content=b"payload"),
    )

    first = await _download_file(url)
    second = await _download_file(url)

    assert first == second == b"payload"
    # A fresh AsyncCacheClient is created per call but they share cache_storage, so the
    # second read hits the cache and never reaches the (respx-mocked) network.
    assert route.call_count == 1


@pytest.mark.usefixtures("_isolated_cache")
@respx.mock
async def test_http_error_propagates():
    url = "https://db.example.test/missing.json"
    respx.get(url).mock(return_value=Response(404))
    with pytest.raises(HTTPStatusError, match="404"):
        await _download_file(url)

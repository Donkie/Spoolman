"""Tests for the hishel-backed download cache (TESTING_CANDIDATES rows 99-100).

Oracle: the observable caching behavior — a cacheable response is fetched once and
the second download is served from the shared storage without hitting the network.
The network boundary is mocked with respx; the module-level cache storage is swapped
for a throwaway temp SQLite store so the real cache isn't touched.
"""

import importlib
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


def _has_memory_file(root: Path) -> bool:
    """Return True if any file literally named ':memory:' was written under root."""
    return any(p.name == ":memory:" for p in root.rglob("*"))


@respx.mock
async def test_in_memory_fallback_storage_serves_downloads(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The in-memory fallback storage works and never touches disk.

    Regression: the fallback used ``AsyncSqliteStorage(database_path=":memory:")``,
    which hishel resolves to ``<cache_dir>/:memory:`` — an invalid path on Windows
    (colon not allowed in NTFS) and a stray real file on POSIX. The fix hands hishel
    a genuine in-memory connection instead.
    """
    monkeypatch.chdir(tmp_path)  # any stray cache file would land under here
    storage = externaldb._build_in_memory_cache_storage()  # noqa: SLF001
    assert storage.connection is not None
    monkeypatch.setattr(externaldb, "cache_storage", storage)

    url = "https://db.example.test/in-memory.json"
    route = respx.get(url).mock(return_value=Response(200, content=b"in-memory-ok"))

    assert await _download_file(url) == b"in-memory-ok"
    assert route.called
    assert not _has_memory_file(tmp_path)


def test_cache_setup_falls_back_to_memory_when_dir_unwritable(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Forcing the module-level except branch yields a real in-memory cache.

    A plain file standing where a directory component is expected makes
    ``mkdir(parents=True)`` raise OSError, exercising the fallback branch on import.
    """
    blocker = tmp_path / "blocker"
    blocker.write_bytes(b"")
    unwritable_cache_dir = blocker / "cache"  # blocker is a file, so mkdir here fails
    monkeypatch.setattr("spoolman.env.get_cache_dir", lambda: unwritable_cache_dir)
    monkeypatch.chdir(tmp_path)

    reloaded = importlib.reload(externaldb)
    try:
        # Storage was built from an explicit in-memory connection, not a resolved path.
        assert reloaded.cache_storage.connection is not None
        assert not _has_memory_file(tmp_path)
    finally:
        # Restore the real cache-dir helper and rebuild the module's disk-backed storage.
        monkeypatch.undo()
        importlib.reload(externaldb)

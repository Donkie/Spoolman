"""Integration tests for the SPA static file server (TESTING_CANDIDATES rows 95, 98).

Mounts SinglePageApplication over a throwaway dist directory and drives it through
httpx's ASGI transport. Oracle: the HTTP contract — a static asset returns 200 (the
Starlette 1.x FileResponse fix; the removed `method=` kwarg used to 500 every asset),
and the manifest is served with its start_url/scope rewritten to the base path.
"""

import json
from pathlib import Path

import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from spoolman.client import SinglePageApplication

MANIFEST = {
    "name": "Spoolman",
    "start_url": "/",
    "scope": "/",
    "icons": [{"src": "pwa-64x64.png", "sizes": "64x64"}],
}


def _make_dist(directory: Path) -> None:
    (directory / "assets").mkdir()
    (directory / "index.html").write_text('<html><script src="./config.js"></script></html>', encoding="utf-8")
    (directory / "assets" / "app.js").write_text("console.log('spoolman');", encoding="utf-8")
    (directory / "manifest.webmanifest").write_text(json.dumps(MANIFEST), encoding="utf-8")


def _client_for(directory: Path, base_path: str) -> AsyncClient:
    app = FastAPI()
    mount_at = base_path if base_path else "/"
    app.mount(mount_at, SinglePageApplication(directory=str(directory), base_path=base_path))
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest_asyncio.fixture
async def root_client(tmp_path: Path) -> AsyncClient:
    dist = tmp_path / "dist"
    dist.mkdir()
    _make_dist(dist)
    async with _client_for(dist, "") as client:
        yield client


async def test_static_asset_returns_200_not_500(root_client: AsyncClient):
    # Regression: the removed FileResponse `method=` kwarg used to raise TypeError → 500
    # on every static asset, blanking the UI.
    resp = await root_client.get("/assets/app.js")
    assert resp.status_code == 200
    assert "spoolman" in resp.text


async def test_manifest_served_with_correct_media_type(root_client: AsyncClient):
    resp = await root_client.get("/manifest.webmanifest")
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("application/manifest+json")


async def test_manifest_start_url_is_root_for_root_deploy(root_client: AsyncClient):
    resp = await root_client.get("/manifest.webmanifest")
    data = resp.json()
    assert data["start_url"] == "/"
    assert data["scope"] == "/"
    # Non-rewritten fields survive.
    assert data["name"] == "Spoolman"


async def test_manifest_is_rewritten_for_sub_path_deploy(tmp_path: Path):
    dist = tmp_path / "dist"
    dist.mkdir()
    _make_dist(dist)
    async with _client_for(dist, "/spoolman") as client:
        resp = await client.get("/spoolman/manifest.webmanifest")
        assert resp.status_code == 200
        data = resp.json()
        assert data["start_url"] == "/spoolman/"
        assert data["scope"] == "/spoolman/"

"""Tests for the DNS rebinding guard: which hostnames this instance answers to."""

import pytest
from fastapi import FastAPI, WebSocket
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from spoolman import env, security


@pytest.fixture(autouse=True)
def _reset_state(monkeypatch: pytest.MonkeyPatch) -> None:
    """Start every test with nothing configured and a fresh once-only warning."""
    monkeypatch.delenv("SPOOLMAN_ALLOWED_HOSTS", raising=False)
    monkeypatch.delenv("SPOOLMAN_CORS_ORIGIN", raising=False)
    monkeypatch.delenv("SPOOLMAN_DEBUG_MODE", raising=False)
    security._warn_all_origins_trusted.cache_clear()  # noqa: SLF001


# The attack this exists to stop: the attacker's page keeps its own name, so Origin and Host
# agree and the origin guard trusts them, while the address behind the name is the victim's LAN.


def test_a_public_domain_we_were_never_told_about_is_refused():
    assert security.is_allowed_host("evil.example") is False


def test_a_rebound_host_is_refused_even_though_its_origin_matches():
    """Exactly what a rebinding attack looks like to the origin guard."""
    assert security.is_trusted_origin("https://evil.example", "evil.example") is True
    assert security.is_allowed_host("evil.example") is False


# Everything a stranger cannot point at a victim's machine is allowed by default.


@pytest.mark.parametrize(
    "host",
    [
        "192.168.1.50",
        "192.168.1.50:7912",
        "10.0.0.2",
        "172.16.5.5",
        "127.0.0.1:7912",
        "169.254.10.10",
        "100.64.0.5",  # Tailscale's CGNAT range.
        "1.2.3.4",  # Public, but reachable only by connecting to it directly.
        "[::1]:7912",
        "[fd00::1]",
        "[fe80::1]:8000",
    ],
)
def test_ip_literals_are_allowed(host: str):
    """The browser connected to that address; there is no name in between to rebind."""
    assert security.is_allowed_host(host) is True


@pytest.mark.parametrize("host", ["localhost", "localhost:7912", "spoolman", "spoolman:8000", "nas"])
def test_single_label_names_are_allowed(host: str):
    """Not registrable on the public internet, so no attacker can own one."""
    assert security.is_allowed_host(host) is True


@pytest.mark.parametrize(
    "host",
    [
        "spoolman.local",
        "spoolman.local:7912",
        "SPOOLMAN.LOCAL",
        "spoolman.lan",
        "spoolman.home",
        "spoolman.home.arpa",
        "spoolman.internal",
        "spoolman.localhost",
    ],
)
def test_non_registrable_suffixes_are_allowed(host: str):
    assert security.is_allowed_host(host) is True


def test_a_trailing_root_dot_names_the_same_host():
    assert security.is_allowed_host("spoolman.local.") is True
    assert security.is_allowed_host("evil.example.") is False


def test_a_suffix_lookalike_is_refused():
    """A local suffix must sit on a real label boundary, not just be how the name happens to end."""
    assert security.is_allowed_host("notlocal") is True  # single label
    assert security.is_allowed_host("evil-local.example") is False
    assert security.is_allowed_host("mylocal.example") is False


def test_an_absent_host_is_allowed():
    """Browsers always send Host, so its absence means a non-browser client."""
    assert security.is_allowed_host("") is True


# The operator's own declarations.


def test_a_configured_host_is_allowed(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("SPOOLMAN_ALLOWED_HOSTS", "spoolman.example.com")
    assert security.is_allowed_host("spoolman.example.com") is True
    assert security.is_allowed_host("evil.example") is False


def test_a_configured_list_is_trimmed(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("SPOOLMAN_ALLOWED_HOSTS", " spoolman.example.com , SPOOLS.example.com. ")
    assert env.get_allowed_hosts() == ["spoolman.example.com", "spools.example.com"]
    assert security.is_allowed_host("spools.example.com") is True


def test_a_subdomain_wildcard_covers_the_domain_and_below(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("SPOOLMAN_ALLOWED_HOSTS", "*.example.com")
    assert security.is_allowed_host("spoolman.example.com") is True
    assert security.is_allowed_host("deep.spoolman.example.com") is True
    assert security.is_allowed_host("example.com") is True
    assert security.is_allowed_host("notexample.com") is False
    assert security.is_allowed_host("example.com.evil.example") is False


def test_a_wildcard_entry_allows_everything(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("SPOOLMAN_ALLOWED_HOSTS", "*")
    assert security.is_allowed_host("evil.example") is True


def test_a_cors_origin_declares_its_hostname_too(monkeypatch: pytest.MonkeyPatch):
    """An operator who declared an origin has necessarily declared the hostname inside it."""
    monkeypatch.setenv("SPOOLMAN_CORS_ORIGIN", "https://spoolman.example.com:8443")
    assert security.get_allowed_hostnames() == {"spoolman.example.com"}
    assert security.is_allowed_host("spoolman.example.com") is True


def test_no_configuration_declares_no_hostnames():
    assert security.get_allowed_hostnames() == set()


def test_the_wildcard_origin_disables_the_check(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("SPOOLMAN_CORS_ORIGIN", "*")
    assert security.is_allowed_host("evil.example") is True


def test_debug_mode_disables_the_check(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("SPOOLMAN_DEBUG_MODE", "TRUE")
    assert security.is_allowed_host("evil.example") is True


# X-Forwarded-Host is checked as well, because the origin guard accepts it as our identity.


def test_a_forwarded_host_is_checked_too():
    assert security.is_allowed_host("127.0.0.1:7912", forwarded_host="evil.example") is False


def test_a_configured_forwarded_host_is_allowed(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("SPOOLMAN_ALLOWED_HOSTS", "spoolman.example.com")
    assert security.is_allowed_host("127.0.0.1:7912", forwarded_host="spoolman.example.com") is True


def test_a_forwarded_host_chain_uses_its_first_entry():
    assert security.is_allowed_host("127.0.0.1:7912", forwarded_host="spoolman.local, internal.lan") is True
    assert security.is_allowed_host("127.0.0.1:7912", forwarded_host="evil.example, internal.lan") is False


def test_an_empty_forwarded_host_is_ignored():
    assert security.is_allowed_host("spoolman.local", forwarded_host="") is True


def test_the_startup_description_names_what_is_configured(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("SPOOLMAN_ALLOWED_HOSTS", "spoolman.example.com")
    description = security.describe_allowed_hosts()
    assert "spoolman.example.com" in description
    assert "*.local" in description


def _guarded_app() -> FastAPI:
    """Build a tiny app behind the middleware, so the tests exercise real ASGI dispatch."""
    app = FastAPI()
    app.add_middleware(security.TrustedHostMiddleware)

    @app.get("/thing")
    async def _read() -> dict[str, bool]:
        return {"ok": True}

    @app.post("/thing")
    async def _write() -> dict[str, bool]:
        return {"ok": True}

    @app.websocket("/thing")
    async def _listen(websocket: WebSocket) -> None:
        await websocket.accept()
        await websocket.send_json({"ok": True})
        await websocket.close()

    return app


@pytest.fixture
def client() -> TestClient:
    """Build a test client for an app sitting behind the host guard."""
    return TestClient(_guarded_app(), base_url="http://spoolman.local")


def test_middleware_allows_a_known_host(client: TestClient):
    assert client.get("/thing").status_code == 200


def test_middleware_refuses_an_unknown_host(client: TestClient):
    response = client.get("/thing", headers={"Host": "evil.example"})
    assert response.status_code == 400
    assert "SPOOLMAN_ALLOWED_HOSTS" in response.json()["message"]


def test_middleware_refuses_reads_as_well_as_writes(client: TestClient):
    """A rebound name is same-origin to the browser, so the attacker can read the response."""
    assert client.get("/thing", headers={"Host": "evil.example"}).status_code == 400
    assert client.post("/thing", headers={"Host": "evil.example"}).status_code == 400


def test_middleware_refuses_an_unknown_forwarded_host(client: TestClient):
    response = client.get("/thing", headers={"X-Forwarded-Host": "evil.example"})
    assert response.status_code == 400


def test_middleware_allows_a_configured_host(monkeypatch: pytest.MonkeyPatch, client: TestClient):
    monkeypatch.setenv("SPOOLMAN_ALLOWED_HOSTS", "spoolman.example.com")
    assert client.get("/thing", headers={"Host": "spoolman.example.com"}).status_code == 200


def test_middleware_refuses_a_rebound_websocket(client: TestClient):
    with (
        pytest.raises(WebSocketDisconnect),
        client.websocket_connect("/thing", headers={"Host": "evil.example"}),
    ):
        pass


def test_middleware_allows_a_known_websocket(client: TestClient):
    with client.websocket_connect("/thing", headers={"Host": "spoolman.local"}) as ws:
        assert ws.receive_json() == {"ok": True}


def test_middleware_is_disabled_by_the_wildcard_origin(monkeypatch: pytest.MonkeyPatch, client: TestClient):
    monkeypatch.setenv("SPOOLMAN_CORS_ORIGIN", "*")
    assert client.get("/thing", headers={"Host": "evil.example"}).status_code == 200

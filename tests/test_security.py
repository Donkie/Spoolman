"""Tests for the shared origin-trust helper."""

import pytest
from starlette.requests import HTTPConnection

from spoolman import security


def connection(**headers: str) -> HTTPConnection:
    """Build a connection carrying the given headers, for the request-level helper."""
    return HTTPConnection(
        {
            "type": "http",
            "headers": [(name.replace("_", "-").encode(), value.encode()) for name, value in headers.items()],
        },
    )


@pytest.fixture(autouse=True)
def _reset_state(monkeypatch: pytest.MonkeyPatch) -> None:
    """Start every test with no configured origins, no debug mode and a fresh once-only warning."""
    monkeypatch.delenv("SPOOLMAN_CORS_ORIGIN", raising=False)
    monkeypatch.delenv("SPOOLMAN_DEBUG_MODE", raising=False)
    security._warn_all_origins_trusted.cache_clear()  # noqa: SLF001


def test_absent_origin_is_trusted():
    """Non-browser clients such as Moonraker and OctoPrint send no Origin header."""
    assert security.is_trusted_origin(None, "spoolman.local:7912") is True


def test_empty_origin_is_trusted():
    assert security.is_trusted_origin("", "spoolman.local:7912") is True


def test_origin_matching_host_is_trusted():
    assert security.is_trusted_origin("http://spoolman.local:7912", "spoolman.local:7912") is True


def test_origin_matching_host_is_trusted_case_insensitively():
    assert security.is_trusted_origin("HTTP://Spoolman.Local:7912", "Spoolman.Local:7912") is True


def test_origin_matching_host_on_default_port_is_trusted():
    assert security.is_trusted_origin("https://spoolman.local:443", "spoolman.local") is True
    assert security.is_trusted_origin("https://spoolman.local", "spoolman.local:443") is True


def test_foreign_origin_is_not_trusted():
    assert security.is_trusted_origin("https://evil.example", "spoolman.local:7912") is False


def test_near_miss_origin_is_not_trusted():
    """A hostname that merely contains the host must not match it."""
    assert security.is_trusted_origin("https://evil-spoolman.local", "spoolman.local") is False
    assert security.is_trusted_origin("https://spoolman.local.evil.example", "spoolman.local") is False


def test_different_port_on_same_host_is_not_trusted():
    """A different port is a different origin, and on a LAN often a different service."""
    assert security.is_trusted_origin("http://spoolman.local:8080", "spoolman.local:7912") is False


def test_opaque_origin_is_not_trusted():
    """A sandboxed iframe or file:// page sends "null", which identifies nobody."""
    assert security.is_trusted_origin("null", "spoolman.local:7912") is False


def test_malformed_origin_is_not_trusted():
    assert security.is_trusted_origin("spoolman.local", "spoolman.local") is False


def test_allowlisted_origin_is_trusted(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("SPOOLMAN_CORS_ORIGIN", "https://fluidd.local")
    assert security.is_trusted_origin("https://fluidd.local", "spoolman.local:7912") is True


def test_whitespace_padded_allowlist_entry_is_trusted(monkeypatch: pytest.MonkeyPatch):
    """The space after the comma is what an operator naturally writes."""
    monkeypatch.setenv("SPOOLMAN_CORS_ORIGIN", "https://a.local, https://fluidd.local")
    assert security.is_trusted_origin("https://fluidd.local", "spoolman.local:7912") is True


def test_origin_outside_allowlist_is_not_trusted(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("SPOOLMAN_CORS_ORIGIN", "https://fluidd.local")
    assert security.is_trusted_origin("https://evil.example", "spoolman.local:7912") is False


def test_wildcard_trusts_everything(monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture):
    """An operator who writes "*" has opted out of origin checks, so honour it."""
    monkeypatch.setenv("SPOOLMAN_CORS_ORIGIN", "*")
    assert security.trusts_all_origins() is True
    assert security.is_trusted_origin("https://evil.example", "spoolman.local:7912") is True
    assert security.is_trusted_origin("null", "spoolman.local:7912") is True
    assert "origin checks are disabled" in caplog.text


def test_wildcard_alongside_other_entries_still_trusts_everything(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("SPOOLMAN_CORS_ORIGIN", "https://fluidd.local,*")
    assert security.trusts_all_origins() is True
    assert security.is_trusted_origin("https://evil.example", "spoolman.local:7912") is True


def test_debug_mode_trusts_everything(monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture):
    """Debug mode already declares that all origins are allowed for CORS."""
    monkeypatch.setenv("SPOOLMAN_DEBUG_MODE", "TRUE")
    assert security.trusts_all_origins() is True
    assert security.is_trusted_origin("https://evil.example", "spoolman.local:7912") is True
    assert "debug mode" in caplog.text.lower()


def test_opt_out_warning_is_logged_only_once(monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture):
    monkeypatch.setenv("SPOOLMAN_CORS_ORIGIN", "*")
    for _ in range(3):
        security.trusts_all_origins()
    assert caplog.text.count("origin checks are disabled") == 1


def test_no_configured_origins(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.delenv("SPOOLMAN_CORS_ORIGIN", raising=False)
    assert security.get_trusted_origins() == set()


# A reverse proxy that rewrites Host -- nginx without `proxy_set_header Host $host`, Apache
# without `ProxyPreserveHost On` -- makes Origin and Host disagree for the genuine web UI.


def test_forwarded_host_rescues_a_host_rewriting_proxy():
    assert (
        security.is_trusted_origin(
            "https://spoolman.example.com",
            "127.0.0.1:7912",
            forwarded_host="spoolman.example.com",
        )
        is True
    )


def test_forwarded_host_uses_the_first_entry_of_a_proxy_chain():
    """Each proxy appends; the first entry is the host the browser actually asked for."""
    assert (
        security.is_trusted_origin(
            "https://spoolman.example.com",
            "127.0.0.1:7912",
            forwarded_host="spoolman.example.com, internal-proxy.lan",
        )
        is True
    )


def test_forwarded_host_does_not_trust_a_foreign_origin():
    assert (
        security.is_trusted_origin(
            "https://evil.example",
            "127.0.0.1:7912",
            forwarded_host="spoolman.example.com",
        )
        is False
    )


def test_forwarded_host_near_miss_is_not_trusted():
    assert (
        security.is_trusted_origin(
            "https://evil-spoolman.example.com",
            "127.0.0.1:7912",
            forwarded_host="spoolman.example.com",
        )
        is False
    )


def test_host_still_matches_when_a_forwarded_host_is_also_present():
    """A proxy that preserves Host correctly must keep working."""
    assert (
        security.is_trusted_origin(
            "https://spoolman.example.com",
            "spoolman.example.com",
            forwarded_host="spoolman.example.com",
        )
        is True
    )


def test_empty_forwarded_host_is_ignored():
    assert security.is_trusted_origin("https://evil.example", "spoolman.local", forwarded_host="") is False
    assert security.is_trusted_origin("https://spoolman.local", "spoolman.local", forwarded_host="") is True


def test_request_helper_reads_the_headers():
    assert security.is_trusted_request(connection(host="spoolman.local", origin="https://spoolman.local")) is True
    assert security.is_trusted_request(connection(host="spoolman.local", origin="https://evil.example")) is False


def test_request_helper_without_an_origin_header():
    """Moonraker, OctoPrint and other non-browser consumers send no Origin."""
    assert security.is_trusted_request(connection(host="spoolman.local")) is True


def test_request_helper_behind_a_host_rewriting_proxy():
    assert (
        security.is_trusted_request(
            connection(
                host="127.0.0.1:7912",
                origin="https://spoolman.example.com",
                x_forwarded_host="spoolman.example.com",
            ),
        )
        is True
    )


def test_request_helper_rejects_a_foreign_origin_behind_a_proxy():
    assert (
        security.is_trusted_request(
            connection(
                host="127.0.0.1:7912",
                origin="https://evil.example",
                x_forwarded_host="spoolman.example.com",
            ),
        )
        is False
    )

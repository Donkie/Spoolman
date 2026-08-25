"""Tests for environment variable parsing."""

import pytest

from spoolman import env


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("https://spoolman.local", "https://spoolman.local"),
        ("  https://spoolman.local  ", "https://spoolman.local"),
        ("https://spoolman.local/", "https://spoolman.local"),
        ("https://spoolman.local///", "https://spoolman.local"),
        ("HTTPS://Spoolman.Local", "https://spoolman.local"),
        ("*", "*"),
    ],
)
def test_normalize_origin(raw: str, expected: str):
    assert env.normalize_origin(raw) == expected


def test_get_cors_origin_unset(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.delenv("SPOOLMAN_CORS_ORIGIN", raising=False)
    assert env.get_cors_origin() is None
    assert env.is_cors_defined() is False


def test_get_cors_origin_single(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("SPOOLMAN_CORS_ORIGIN", "https://spoolman.local")
    assert env.get_cors_origin() == ["https://spoolman.local"]
    assert env.is_cors_defined() is True


def test_get_cors_origin_trims_list_entries(monkeypatch: pytest.MonkeyPatch):
    """A space after the comma must not produce an entry no Origin header can ever match."""
    monkeypatch.setenv("SPOOLMAN_CORS_ORIGIN", "https://a.local, https://b.local/")
    assert env.get_cors_origin() == ["https://a.local", "https://b.local"]


def test_get_cors_origin_drops_empty_and_duplicate_entries(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("SPOOLMAN_CORS_ORIGIN", "https://a.local,,https://a.local/, ")
    assert env.get_cors_origin() == ["https://a.local"]


def test_get_cors_origin_raw_is_unparsed(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("SPOOLMAN_CORS_ORIGIN", " https://a.local, https://b.local ")
    assert env.get_cors_origin_raw() == " https://a.local, https://b.local "

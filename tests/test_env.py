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


def test_tag_auto_create_defaults_off(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.delenv("SPOOLMAN_TAG_AUTO_CREATE_ENABLED", raising=False)
    assert env.is_tag_auto_create_enabled() is False


@pytest.mark.parametrize("raw", ["TRUE", "true", "1"])
def test_tag_auto_create_enabled(monkeypatch: pytest.MonkeyPatch, raw: str):
    monkeypatch.setenv("SPOOLMAN_TAG_AUTO_CREATE_ENABLED", raw)
    assert env.is_tag_auto_create_enabled() is True


@pytest.mark.parametrize("raw", ["FALSE", "false", "0"])
def test_tag_auto_create_disabled(monkeypatch: pytest.MonkeyPatch, raw: str):
    monkeypatch.setenv("SPOOLMAN_TAG_AUTO_CREATE_ENABLED", raw)
    assert env.is_tag_auto_create_enabled() is False


def test_tag_auto_create_unparseable_raises(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("SPOOLMAN_TAG_AUTO_CREATE_ENABLED", "maybe")
    with pytest.raises(ValueError, match="SPOOLMAN_TAG_AUTO_CREATE_ENABLED"):
        env.is_tag_auto_create_enabled()

"""Tests for environment variable parsing."""

import os
from pathlib import Path

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


def test_can_write_to_data_dir_leaves_existing_files_alone(monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
    """The write check must not touch a file of the user's, even one named like a probe file."""
    monkeypatch.setenv("SPOOLMAN_DIR_DATA", str(tmp_path))
    (tmp_path / "test.txt").write_text("mine")
    assert env.can_write_to_data_dir() is True
    assert [p.name for p in tmp_path.iterdir()] == ["test.txt"]
    assert (tmp_path / "test.txt").read_text() == "mine"


def test_can_write_to_data_dir_read_only(monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
    if os.name == "nt" or os.geteuid() == 0:
        pytest.skip("directory permissions are not enforced here")
    monkeypatch.setenv("SPOOLMAN_DIR_DATA", str(tmp_path))
    tmp_path.chmod(0o500)
    try:
        assert env.can_write_to_data_dir() is False
    finally:
        tmp_path.chmod(0o700)

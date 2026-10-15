"""Tests for the release version comparison used by the update check."""

from spoolman.update_check import is_newer


def test_is_newer() -> None:
    assert is_newer("0.28.0", "0.27.0")
    assert is_newer("v0.27.1", "0.27.0")
    assert is_newer("1.0.0", "0.99.9")
    assert is_newer("0.10.0", "0.9.0")  # numeric, not string, compare
    assert not is_newer("0.27.0", "0.27.0")
    assert not is_newer("0.26.5", "0.27.0")
    assert not is_newer("0.28.0", "unknown")
    assert not is_newer("0.28.0-beta", "0.27.0")

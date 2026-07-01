"""Unit tests for the external-DB config helpers (TESTING_CANDIDATES row 54).

Oracle: the documented env-var contract. The sync-interval getter must tolerate a
non-integer value by warning and falling back to the default rather than crashing
startup (regression guard from PR #2). Mock only the boundary (the environment).
"""

import pytest

from spoolman import externaldb
from spoolman.externaldb import (
    DEFAULT_EXTERNAL_DB_URL,
    DEFAULT_SYNC_INTERVAL,
    get_external_db_sync_interval,
    get_external_db_url,
)


def test_sync_interval_defaults_when_unset(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.delenv("EXTERNAL_DB_SYNC_INTERVAL", raising=False)
    assert get_external_db_sync_interval() == DEFAULT_SYNC_INTERVAL


def test_sync_interval_parses_a_valid_integer(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("EXTERNAL_DB_SYNC_INTERVAL", "120")
    assert get_external_db_sync_interval() == 120


def test_sync_interval_parses_zero_to_disable(monkeypatch: pytest.MonkeyPatch):
    # 0 is a legitimate value (callers use it to disable the scheduler).
    monkeypatch.setenv("EXTERNAL_DB_SYNC_INTERVAL", "0")
    assert get_external_db_sync_interval() == 0


@pytest.mark.parametrize("bad", ["abc", "12.5", "", "10s"])
def test_sync_interval_non_integer_falls_back_without_raising(monkeypatch: pytest.MonkeyPatch, bad: str):
    monkeypatch.setenv("EXTERNAL_DB_SYNC_INTERVAL", bad)
    # Must not raise — the whole point of the fix is startup robustness.
    assert get_external_db_sync_interval() == DEFAULT_SYNC_INTERVAL


def test_sync_interval_non_integer_logs_a_warning(monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture):
    monkeypatch.setenv("EXTERNAL_DB_SYNC_INTERVAL", "not-a-number")
    with caplog.at_level("WARNING", logger=externaldb.logger.name):
        get_external_db_sync_interval()
    assert any("EXTERNAL_DB_SYNC_INTERVAL" in rec.message for rec in caplog.records)


def test_external_db_url_defaults_when_unset(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.delenv("EXTERNAL_DB_URL", raising=False)
    assert get_external_db_url() == DEFAULT_EXTERNAL_DB_URL


def test_external_db_url_uses_the_configured_url(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("EXTERNAL_DB_URL", "https://example.test/db")
    assert get_external_db_url() == "https://example.test/db"

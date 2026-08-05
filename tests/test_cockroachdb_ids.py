"""Tests for CockroachDB ID generation.

CockroachDB expands SERIAL primary keys to "DEFAULT unique_rowid()" out of the box, which
generates 64-bit IDs. JavaScript numbers are only exact up to 2^53, so the web UI silently
rounded such IDs and every follow-up request 404'd (#797). Spoolman therefore asks CockroachDB
to normalize SERIAL to an ordinary cached sequence instead. The setting only takes effect at
CREATE TABLE time, so it has to ride along on every connection the app opens -- including the
one the Alembic migrations run through, which is built by the same Database.connect().
"""

import pytest
from sqlalchemy import URL

from spoolman.database import database
from spoolman.database.database import Database


def connect_kwargs(monkeypatch: pytest.MonkeyPatch, drivername: str) -> dict[str, object]:
    """Connect a Database and capture what it passes to create_async_engine."""
    captured: dict[str, object] = {}
    real_create = database.create_async_engine

    def capture(url: URL, **kwargs: object) -> object:
        captured.update(kwargs)
        return real_create(url, **kwargs)

    monkeypatch.setattr(database, "create_async_engine", capture)
    db = Database(URL.create(drivername=drivername, host="db", database="spoolman", username="john"))
    db.connect()
    return captured


def test_cockroachdb_serial_normalization_is_sequence_backed(monkeypatch: pytest.MonkeyPatch):
    kwargs = connect_kwargs(monkeypatch, "cockroachdb+asyncpg")
    assert kwargs["connect_args"]["server_settings"] == {"serial_normalization": "sql_sequence_cached"}


def test_other_databases_get_no_server_settings(monkeypatch: pytest.MonkeyPatch):
    kwargs = connect_kwargs(monkeypatch, "postgresql+asyncpg")
    assert "server_settings" not in kwargs["connect_args"]

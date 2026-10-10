"""Tests for backup rotation.

Rotating discards the oldest restore point, so a caller that can trigger rotation repeatedly can
walk the entire history off the end and leave only snapshots of the damage it just did. The
endpoint that triggers this takes no parameters, so it used to be reachable by a bodyless
cross-origin form post.
"""

import sqlite3
from contextlib import closing
from pathlib import Path

import pytest
from sqlalchemy import URL

from spoolman.database import database
from spoolman.database.database import BACKUP_NAME, Database


@pytest.fixture
def db_path(tmp_path: Path) -> Path:
    """Create a small sqlite database to be backed up."""
    path = tmp_path / "live.db"
    with sqlite3.connect(path) as conn:
        conn.execute("CREATE TABLE spool (id INTEGER PRIMARY KEY, note TEXT)")
        conn.execute("INSERT INTO spool (note) VALUES ('original')")
    return path


@pytest.fixture
def db(db_path: Path) -> Database:
    return Database(URL.create(drivername="sqlite+aiosqlite", database=str(db_path)))


@pytest.fixture
def backups(tmp_path: Path) -> Path:
    return tmp_path / "backups"


def change(db_path: Path, note: str) -> None:
    """Make a real change, so the next backup differs from the previous one."""
    with sqlite3.connect(db_path) as conn:
        conn.execute("INSERT INTO spool (note) VALUES (?)", (note,))


def rotate(db: Database, backups: Path, num_backups: int = 5) -> database.BackupResult:
    """Back up, ignoring the rate limit -- tests drive time explicitly."""
    db._last_rotation = None  # noqa: SLF001
    return db.backup_and_rotate(backups, num_backups=num_backups)


def history(backups: Path) -> list[str]:
    """List the backup files that exist, newest first."""
    return [p.name for p in sorted(backups.glob(f"{BACKUP_NAME}*"))]


def test_first_backup_is_created(db: Database, backups: Path):
    result = db.backup_and_rotate(backups)
    assert result.created is True
    assert result.path == backups / BACKUP_NAME
    assert result.path.exists()


def test_unchanged_database_is_not_rotated(db: Database, backups: Path):
    """The core fix: with nothing to back up, the existing history must be left alone."""
    first = rotate(db, backups)
    assert first.created is True

    second = rotate(db, backups)
    assert second.created is False
    assert second.path == first.path
    assert history(backups) == [BACKUP_NAME]


def test_changed_database_is_rotated(db: Database, db_path: Path, backups: Path):
    rotate(db, backups)
    change(db_path, "second")
    result = rotate(db, backups)

    assert result.created is True
    assert history(backups) == [BACKUP_NAME, f"{BACKUP_NAME}.1"]


def test_repeated_calls_preserve_the_oldest_restore_point(db: Database, db_path: Path, backups: Path):
    """The reported attack: six rapid calls left six snapshots of the damage and nothing else."""
    # Build a real history of five distinct restore points.
    for i in range(5):
        change(db_path, f"change-{i}")
        assert rotate(db, backups).created is True

    oldest = backups / f"{BACKUP_NAME}.4"
    assert oldest.exists()
    oldest_bytes = oldest.read_bytes()

    # Now hammer it, as a malicious page would.
    for _ in range(20):
        assert rotate(db, backups).created is False

    assert oldest.exists()
    assert oldest.read_bytes() == oldest_bytes
    assert not (backups / f"{BACKUP_NAME}.5").exists()


def test_rate_limit_returns_the_existing_backup(db: Database, db_path: Path, backups: Path):
    """Even with genuine changes, rotation is refused when one just happened."""
    first = rotate(db, backups)

    change(db_path, "second")
    second = db.backup_and_rotate(backups)

    assert second.created is False
    assert second.path == first.path
    assert history(backups) == [BACKUP_NAME]


def test_rate_limit_does_not_block_the_very_first_backup(db: Database, backups: Path):
    """With no backup to fall back on, one must always be written."""
    db._last_rotation = 0.0  # noqa: SLF001
    assert db.backup_and_rotate(backups).created is True


def test_history_is_capped_at_num_backups(db: Database, db_path: Path, backups: Path):
    for i in range(6):
        change(db_path, f"change-{i}")
        rotate(db, backups, num_backups=3)

    assert history(backups) == [BACKUP_NAME, f"{BACKUP_NAME}.1", f"{BACKUP_NAME}.2", f"{BACKUP_NAME}.3"]


def test_no_pending_file_is_left_behind(db: Database, db_path: Path, backups: Path):
    rotate(db, backups)
    change(db_path, "second")
    rotate(db, backups)
    rotate(db, backups)

    assert not (backups / f"{BACKUP_NAME}.pending").exists()


def test_non_sqlite_database_is_skipped(backups: Path):
    db = Database(URL.create(drivername="postgresql+asyncpg", host="localhost", database="spoolman"))
    result = db.backup_and_rotate(backups)

    assert result == database.BackupResult(None, created=False)


def test_backup_gives_up_on_a_lock_that_never_clears(
    db: Database,
    db_path: Path,
    backups: Path,
    monkeypatch: pytest.MonkeyPatch,
):
    """sqlite3's backup() retries a locked source forever, which hung the server (#1191)."""
    monkeypatch.setattr(database, "BACKUP_LOCK_TIMEOUT_SECONDS", 0.5)
    with closing(sqlite3.connect(db_path, isolation_level=None)) as holder:
        holder.execute("BEGIN EXCLUSIVE")
        with pytest.raises(sqlite3.OperationalError, match="locked"):
            db.backup_and_rotate(backups)
        holder.execute("ROLLBACK")
    assert not (backups / f"{BACKUP_NAME}.pending").exists()


def test_backup_needs_no_lock_on_the_target(db: Database, backups: Path, monkeypatch: pytest.MonkeyPatch):
    """Backup folders on network shares often refuse file locks, which failed every backup (#1246).

    Simulate that by holding an exclusive lock on the target from the moment it is created.
    """
    monkeypatch.setattr(database, "BACKUP_LOCK_TIMEOUT_SECONDS", 0.5)
    pending = backups / f"{BACKUP_NAME}.pending"
    real_connect = sqlite3.connect
    holders: list[sqlite3.Connection] = []

    def connect(*args: object, **kwargs: object) -> sqlite3.Connection:
        conn = real_connect(*args, **kwargs)
        if pending.exists() and not holders:
            holders.append(real_connect(pending, isolation_level=None))
            holders[0].execute("BEGIN EXCLUSIVE")
        return conn

    monkeypatch.setattr(sqlite3, "connect", connect)
    try:
        result = db.backup_and_rotate(backups)
    finally:
        for holder in holders:
            holder.close()

    assert holders, "the target was never locked, so this test proves nothing"
    assert result.created is True
    with closing(real_connect(backups / BACKUP_NAME)) as conn:
        assert conn.execute("SELECT note FROM spool").fetchall() == [("original",)]

"""Tests for the SQLite vendor id auto-increment repair migration (#1131).

SQLite only auto-assigns ids to a column declared exactly as a single-column INTEGER
PRIMARY KEY. Databases that have passed through third-party export/conversion tools can
come back with e.g. a BIGINT id or a lost primary key, after which every vendor INSERT
fails with "NOT NULL constraint failed: vendor.id". The repair migration rebuilds such
a table in place; these tests drive the real alembic chain against sqlite files.
"""

import os
import sqlite3
import subprocess
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).parent.parent

# The revision just before the repair migration; upgrading to it first lets a test
# mangle the vendor table the way an external tool would, before the repair has run.
PRE_REPAIR_REVISION = "fe4970567bb3"


def upgrade(data_dir: Path, revision: str) -> None:
    """Run the real migration chain against the sqlite database in data_dir."""
    subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", revision],
        check=True,
        cwd=REPO_ROOT,
        env={**os.environ, "SPOOLMAN_DB_TYPE": "sqlite", "SPOOLMAN_DIR_DATA": str(data_dir)},
    )


def mangle_vendor_table(db_path: Path) -> None:
    """Rebuild the vendor table the way conversion tools do: a BIGINT id is not a rowid alias."""
    with sqlite3.connect(db_path) as conn:
        conn.executescript(
            """
            CREATE TABLE vendor_mangled (
                id BIGINT NOT NULL,
                registered DATETIME NOT NULL,
                name VARCHAR(64) NOT NULL,
                comment VARCHAR(1024),
                empty_spool_weight FLOAT,
                external_id VARCHAR(256),
                PRIMARY KEY (id)
            );
            INSERT INTO vendor_mangled SELECT * FROM vendor;
            DROP TABLE vendor;
            ALTER TABLE vendor_mangled RENAME TO vendor;
            """,
        )
        for i in range(1, 7):
            conn.execute(
                "INSERT INTO vendor (id, registered, name) VALUES (?, '2023-01-01 00:00:00', ?)",
                (i, f"Vendor {i}"),
            )
        conn.execute(
            "INSERT INTO filament (id, registered, vendor_id, density, diameter) "
            "VALUES (1, '2023-01-01 00:00:00', 3, 1.24, 1.75)",
        )
        conn.execute("""INSERT INTO vendor_field (vendor_id, key, value) VALUES (2, 'note', '"kept"')""")


def insert_vendor(conn: sqlite3.Connection, name: str) -> int:
    """Insert a vendor the way the ORM does: without an explicit id."""
    conn.execute("INSERT INTO vendor (registered, name) VALUES ('2026-08-31 16:47:12', ?)", (name,))
    return conn.execute("SELECT id FROM vendor WHERE name = ?", (name,)).fetchone()[0]


def test_repair_restores_autoincrement_and_data(tmp_path: Path):
    db_path = tmp_path / "spoolman.db"
    upgrade(tmp_path, PRE_REPAIR_REVISION)
    mangle_vendor_table(db_path)

    # The mangled table reproduces the reported failure.
    with sqlite3.connect(db_path) as conn, pytest.raises(sqlite3.IntegrityError, match=r"vendor\.id"):
        insert_vendor(conn, "Snapmaker")

    upgrade(tmp_path, "head")

    with sqlite3.connect(db_path) as conn:
        # id auto-increments again, continuing after the existing rows.
        assert insert_vendor(conn, "Snapmaker") == 7
        # The existing rows and everything pointing at them survived the rebuild.
        assert conn.execute("SELECT id, name FROM vendor ORDER BY id").fetchall()[:6] == [
            (i, f"Vendor {i}") for i in range(1, 7)
        ]
        assert conn.execute("SELECT vendor_id FROM filament WHERE id = 1").fetchone() == (3,)
        assert conn.execute("SELECT value FROM vendor_field WHERE vendor_id = 2").fetchone() == ('"kept"',)
        assert conn.execute("PRAGMA foreign_key_check").fetchall() == []
        index_names = [row[1] for row in conn.execute("PRAGMA index_list('vendor')").fetchall()]
        assert "ix_vendor_id" in index_names


def test_repair_leaves_healthy_databases_alone(tmp_path: Path):
    db_path = tmp_path / "spoolman.db"
    upgrade(tmp_path, PRE_REPAIR_REVISION)
    with sqlite3.connect(db_path) as conn:
        schema_before = conn.execute("SELECT sql FROM sqlite_master WHERE name = 'vendor'").fetchone()[0]

    upgrade(tmp_path, "head")

    with sqlite3.connect(db_path) as conn:
        schema_after = conn.execute("SELECT sql FROM sqlite_master WHERE name = 'vendor'").fetchone()[0]
        assert schema_after == schema_before
        assert insert_vendor(conn, "Snapmaker") == 1

#!/usr/bin/env python3
"""Repair a Spoolman SQLite DB that points to a deleted photo_url rename migration."""

from __future__ import annotations

import argparse
import sqlite3
import sys
from pathlib import Path

MISSING_REVISION = "872cfd0e5c5c"
PHOTO_REVISION = "5bd2ab9f413e"
PHOTO_TABLES = ("photo_file", "photo_file_chunk", "vendor_photo", "filament_photo", "spool_photo")
SETTING_KEYS = ("extra_fields_vendor", "extra_fields_filament", "extra_fields_spool")


def parse_args() -> argparse.Namespace:
    """Read command line arguments."""
    parser = argparse.ArgumentParser(
        description="Repair alembic_version from deleted revision 872cfd0e5c5c to 5bd2ab9f413e."
    )
    parser.add_argument(
        "db_path",
        nargs="?",
        default="/home/app/.local/share/spoolman/spoolman.db",
        help="Path to spoolman.db. Default: /home/app/.local/share/spoolman/spoolman.db",
    )
    parser.add_argument(
        "--yes",
        action="store_true",
        help="Apply changes without interactive confirmation.",
    )
    return parser.parse_args()


def fetch_scalar(conn: sqlite3.Connection, sql: str, params: tuple[object, ...] = ()) -> object | None:
    """Return the first column of the first row."""
    row = conn.execute(sql, params).fetchone()
    return None if row is None else row[0]


def table_exists(conn: sqlite3.Connection, table_name: str) -> bool:
    """Check whether a table exists."""
    return bool(
        fetch_scalar(
            conn,
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
            (table_name,),
        )
    )


def get_versions(conn: sqlite3.Connection) -> list[str]:
    """Read stored Alembic revisions."""
    if not table_exists(conn, "alembic_version"):
        raise RuntimeError("Table alembic_version was not found. This does not look like a migrated Spoolman DB.")
    return [row[0] for row in conn.execute("SELECT version_num FROM alembic_version ORDER BY version_num")]


def validate_photo_schema(conn: sqlite3.Connection) -> None:
    """Ensure the photo schema exists before marking the photo revision as current."""
    missing_tables = [table for table in PHOTO_TABLES if not table_exists(conn, table)]
    if missing_tables:
        raise RuntimeError(
            "Database points to the deleted migration, but photo tables are missing: "
            + ", ".join(missing_tables)
            + ". Do not rewrite alembic_version; run migrations on a consistent codebase instead."
        )


def repair_settings(conn: sqlite3.Connection) -> int:
    """Rename legacy image_url extra-field type values to photo_url."""
    if not table_exists(conn, "setting"):
        return 0

    changed = 0
    replacements = (
        ('"field_type":"image_url"', '"field_type":"photo_url"'),
        ('"field_type": "image_url"', '"field_type": "photo_url"'),
        ('"image_url"', '"photo_url"'),
    )
    for key in SETTING_KEYS:
        before = conn.total_changes
        for old, new in replacements:
            conn.execute(
                "UPDATE setting SET value = replace(value, ?, ?) WHERE key = ? AND value LIKE ?",
                (old, new, key, f"%{old}%"),
            )
        changed += conn.total_changes - before
    return changed


def repair_revision(conn: sqlite3.Connection) -> int:
    """Replace the deleted Alembic revision with the actual photo migration revision."""
    return conn.execute(
        "UPDATE alembic_version SET version_num = ? WHERE version_num = ?",
        (PHOTO_REVISION, MISSING_REVISION),
    ).rowcount


def main() -> int:
    """Run the one-time repair."""
    args = parse_args()
    db_path = Path(args.db_path)

    if not db_path.exists():
        print(f"ERROR: DB file not found: {db_path}", file=sys.stderr)
        return 2

    conn = sqlite3.connect(db_path)
    try:
        versions = get_versions(conn)
        print("Current alembic_version:", ", ".join(versions) or "<empty>")

        if MISSING_REVISION not in versions:
            print(f"No repair needed: {MISSING_REVISION} is not present.")
            return 0

        validate_photo_schema(conn)
        print(f"Will replace {MISSING_REVISION} -> {PHOTO_REVISION}.")
        print("Will also replace legacy image_url values in extra field settings, if present.")

        if not args.yes:
            answer = input("Apply repair? Type YES: ")
            if answer != "YES":
                print("Cancelled.")
                return 1

        revision_rows = repair_revision(conn)
        setting_rows = repair_settings(conn)
        conn.commit()

        versions_after = get_versions(conn)
        print(f"Updated alembic_version rows: {revision_rows}")
        print(f"Updated setting rows: {setting_rows}")
        print("New alembic_version:", ", ".join(versions_after) or "<empty>")
        print("Done. Now run: alembic upgrade head")
        return 0
    except Exception as exc:
        conn.rollback()
        print(f"ERROR: {exc}", file=sys.stderr)
        return 3
    finally:
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main())

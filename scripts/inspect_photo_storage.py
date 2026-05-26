#!/usr/bin/env python3
# ruff: noqa: D103,T201,S608,E501
"""Inspect Spoolman photo storage tables and entity links.

Usage:
  python3 scripts/inspect_photo_storage.py /path/to/spoolman.db

When no path is passed the script tries the common Docker/default SQLite
locations used by Spoolman.
"""

from __future__ import annotations

import sqlite3
import sys
from pathlib import Path

PHOTO_TABLES = [
    "photo_file",
    "photo_file_chunk",
    "vendor_photo",
    "filament_photo",
    "spool_photo",
]
ENTITY_TABLES = ["vendor", "filament", "spool"]


def find_default_db() -> Path | None:
    candidates = [
        Path("/home/app/.local/share/spoolman/spoolman.db"),
        Path.home() / ".local/share/spoolman/spoolman.db",
        Path("spoolman.db"),
    ]
    return next((path for path in candidates if path.exists()), None)


def print_rows(title: str, rows: list[sqlite3.Row], *, limit: int = 30) -> None:
    print(f"\n== {title} ==")
    if not rows:
        print("(empty)")
        return
    headers = rows[0].keys()
    print(" | ".join(headers))
    print("-" * 120)
    for row in rows[:limit]:
        print(" | ".join(str(row[key]) for key in headers))
    if len(rows) > limit:
        print(f"... {len(rows) - limit} more row(s)")


def table_exists(conn: sqlite3.Connection, table: str) -> bool:
    row = conn.execute("select name from sqlite_master where type='table' and name=?", (table,)).fetchone()
    return row is not None


def inspect_schema(conn: sqlite3.Connection) -> None:
    print("== Photo storage schema ==")
    for table in PHOTO_TABLES:
        if not table_exists(conn, table):
            print(f"\n{table}: missing")
            continue
        print(f"\n{table}")
        for row in conn.execute(f"pragma table_info({table})").fetchall():
            print(f"  {row['name']}: {row['type']} not_null={row['notnull']} pk={row['pk']}")
        indexes = conn.execute(f"pragma index_list({table})").fetchall()
        for index in indexes:
            print(f"  index: {index['name']} unique={index['unique']}")


def inspect_counts(conn: sqlite3.Connection) -> None:
    rows = []
    for table in [*PHOTO_TABLES, *ENTITY_TABLES]:
        if table_exists(conn, table):
            count = conn.execute(f"select count(*) as count from {table}").fetchone()["count"]
            rows.append({"table_name": table, "rows": count})
    print("\n== Table counts ==")
    for row in rows:
        print(f"{row['table_name']}: {row['rows']}")


def inspect_photo_files(conn: sqlite3.Connection) -> None:
    if not table_exists(conn, "photo_file"):
        return
    rows = conn.execute(
        """
        select
          pf.id,
          pf.registered,
          pf.filename,
          pf.content_type,
          pf.size_bytes,
          pf.original_size_bytes,
          pf.width,
          pf.height,
          pf.sha256,
          count(pfc.chunk_index) as chunks
        from photo_file pf
        left join photo_file_chunk pfc on pfc.photo_file_id = pf.id
        group by pf.id
        order by pf.id
        """,
    ).fetchall()
    print_rows("photo_file records", rows)


def inspect_links(conn: sqlite3.Connection) -> None:
    queries = {
        "Vendor photo links": """
            select vp.vendor_id, v.name as vendor_name, vp.field_key, vp.photo_file_id, vp.sort_order
            from vendor_photo vp
            left join vendor v on v.id = vp.vendor_id
            order by vp.vendor_id, vp.field_key, vp.sort_order
        """,
        "Filament photo links": """
            select fp.filament_id, f.name as filament_name, fp.field_key, fp.photo_file_id, fp.sort_order
            from filament_photo fp
            left join filament f on f.id = fp.filament_id
            order by fp.filament_id, fp.field_key, fp.sort_order
        """,
        "Spool photo links": """
            select sp.spool_id, sp.field_key, sp.photo_file_id, sp.sort_order
            from spool_photo sp
            order by sp.spool_id, sp.field_key, sp.sort_order
        """,
    }
    for title, query in queries.items():
        table = title.split()[0].lower() + "_photo"
        if table_exists(conn, table):
            print_rows(title, conn.execute(query).fetchall())


def inspect_orphans(conn: sqlite3.Connection) -> None:
    if not table_exists(conn, "photo_file"):
        return
    rows = conn.execute(
        """
        select pf.id, pf.registered, pf.filename, pf.size_bytes
        from photo_file pf
        left join vendor_photo vp on vp.photo_file_id = pf.id
        left join filament_photo fp on fp.photo_file_id = pf.id
        left join spool_photo sp on sp.photo_file_id = pf.id
        where vp.photo_file_id is null
          and fp.photo_file_id is null
          and sp.photo_file_id is null
        order by pf.registered asc, pf.id asc
        """,
    ).fetchall()
    print_rows("Orphaned photos", rows)


def inspect_entities(conn: sqlite3.Connection) -> None:
    if table_exists(conn, "vendor"):
        print_rows("Vendors", conn.execute("select id, registered, name, external_id from vendor order by id").fetchall())
    if table_exists(conn, "filament"):
        print_rows(
            "Filaments",
            conn.execute("select id, registered, vendor_id, name, material, color_hex from filament order by id").fetchall(),
        )
    if table_exists(conn, "spool"):
        print_rows(
            "Spools",
            conn.execute("select id, registered, filament_id, archived, remaining_weight, used_weight from spool order by id").fetchall(),
        )


def main() -> int:
    db_path = Path(sys.argv[1]) if len(sys.argv) > 1 else find_default_db()
    if db_path is None:
        print("Database path was not provided and default Spoolman DB was not found.", file=sys.stderr)
        return 2
    if not db_path.exists():
        print(f"Database does not exist: {db_path}", file=sys.stderr)
        return 2

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        print(f"Inspecting SQLite database: {db_path}")
        inspect_schema(conn)
        inspect_counts(conn)
        inspect_photo_files(conn)
        inspect_links(conn)
        inspect_orphans(conn)
        inspect_entities(conn)
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

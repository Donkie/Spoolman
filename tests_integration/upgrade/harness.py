"""Upgrade a database from before the CockroachDB ID fix (#797) and check that nothing was lost.

    python harness.py cockroachdb --manifest PATH
    python harness.py untouched

Works on the database Spoolman itself would use, from the usual SPOOLMAN_DB_* variables, which
has to be empty. Exits non-zero if any check fails.

cockroachdb builds the schema Spoolman had before the fix, at the revision before the ID
migrations, so every ID comes from unique_rowid(). It seeds the tables with huge, boundary and
small IDs, referencing each other in every way the models allow. It kills the upgrade at several
points, checking each time that the database is exactly as before or cleanly renumbered, then
finishes it and checks every row and reference by natural key. Rerunning the migrations, and
recovering from rows written after a downgrade, are checked too. Finally it writes a manifest for
tests_upgrade, which checks the result over the REST API once Spoolman has started up.

untouched runs the ID migrations up and down on sqlite, postgres or mariadb and checks that they
change nothing there but the alembic version.
"""

# ruff: noqa: S608, T201

import argparse
import difflib
import json
import re
import signal
import subprocess
import sys
from datetime import datetime
from decimal import Decimal
from pathlib import Path
from typing import Any, NamedTuple

import sqlalchemy as sa
from alembic.config import Config
from alembic.script import ScriptDirectory

import spoolman
from spoolman.database.database import get_connection_url

ROOT = Path(spoolman.__file__).resolve().parent.parent
RUN_ALEMBIC = Path(__file__).resolve().parent / "run_alembic.py"

# The two cockroachdb ID migrations. The harness only upgrades as far as the second one, so
# migrations added after them don't change what it checks (Spoolman's own startup takes the
# database the rest of the way). The revision before them is looked up, so this also keeps
# working when they get rechained onto a newer migration.
RENUMBER = "4e7c1b8d9f23"
SEQUENCES = "8b2f6a3c5d17"
_config = Config(str(ROOT / "alembic.ini"))
_config.set_main_option("script_location", str(ROOT / "migrations"))
PREVIOUS = ScriptDirectory.from_config(_config).get_revision(RENUMBER).down_revision

# JavaScript can't tell 2^53 apart from 2^53 + 1.
UNSAFE_ID = 2**53

# The column that tells each row of a table with IDs apart, since the IDs themselves change.
NATURAL_KEYS = {"vendor": "name", "filament": "name", "spool": "comment", "tag": "uid"}

# Small IDs an install can already have, the boundary at 2^53 and the largest INT8, by row
# number. The other rows get unique_rowid() IDs, like every row on a real install.
COCKROACHDB_IDS = {
    "vendor": {0: 1, 1: 2, 2: 7, 3: UNSAFE_ID, 4: UNSAFE_ID + 1, 5: 2**63 - 1},
    "filament": {0: 3, 1: 5, 2: UNSAFE_ID},
    "spool": {0: 4, 1: UNSAFE_ID + 1, 2: 2**63 - 1},
    "tag": {0: 1, 1: UNSAFE_ID},
}

# The other databases get one large ID per table where the column takes it. sqlite's are
# 64-bit, so its row gets one the web UI can't address either, and has to keep it.
UNTOUCHED_IDS = {"sqlite": UNSAFE_ID + 1, "postgresql": 2**31 - 1, "mysql": 2**31 - 1}

# Has a tag and an extra field but no spools, so the tester can delete it.
DELETABLE_FILAMENT = "filament without spools"

# Kill points in the upgrade from PREVIOUS: (BEFORE or AFTER, statement prefix, N), the revision
# the database must be at afterwards, and the tables that must already have their new ID default.
# The first three are in the renumbering transaction. The last two are in the sequence migration,
# after the renumbering committed, where each statement commits on its own.
KILLS = (
    (("after", "INSERT INTO vendor ", 1), PREVIOUS, ()),  # vendors copied, nothing repointed yet
    (("after", "UPDATE tag SET filament_id", 1), PREVIOUS, ()),  # halfway through the references
    (("before", "UPDATE alembic_version", 1), PREVIOUS, ()),  # renumbered, not yet stamped
    (("before", "ALTER TABLE spool ALTER COLUMN id SET DEFAULT", 1), RENUMBER, ("vendor", "filament")),
    (("before", "UPDATE alembic_version", 1), RENUMBER, ("vendor", "filament", "spool", "tag")),  # not yet stamped
)

REGISTERED = datetime(2024, 5, 4, 3, 2, 1, 123456)  # noqa: DTZ001 - the columns are naive


class Snapshot(NamedTuple):
    """Everything in the database, in two forms."""

    raw: dict[str, list[dict[str, Any]]]
    """Every row exactly as stored."""

    natural: dict[str, list[dict[str, Any]]]
    """Every row without its ID, and with references given by the natural key they point to."""

    ids: dict[str, dict[str, int]]
    """The ID of every natural key, by table."""


def seed_rows(pinned: dict[str, dict[int, int]]) -> dict[str, list[dict[str, Any]]]:
    """Get the rows to seed in FK order, with references by natural key and the pinned IDs."""

    def row(table: str, n: int, **values: Any) -> dict[str, Any]:  # noqa: ANN401
        if n in pinned.get(table, {}):
            values["id"] = pinned[table][n]
        return values

    def tag(n: int, target_type: str, **target: str) -> dict[str, Any]:
        return row(
            "tag",
            n,
            **({"spool_id": None, "filament_id": None, "target_value": None} | target),
            uid=f"04A2B3C4D5E6{n:02X}",
            target_type=target_type,
            format="ntag" if n % 2 else None,
            added=REGISTERED,
        )

    # filament n -> vendor: safe to huge, safe to safe, 2^53 to 2^53, huge to safe, none, then
    # huge to huge. Vendor 11 has no filaments.
    vendor_of = {0: 6, 1: 0, 2: 3, 3: 1, 4: None} | {n: 6 + n % 5 for n in range(5, 23)}
    # spool n -> filament: safe to huge, huge to safe, max to 2^53, then all over.
    filament_of = {0: 3, 1: 1, 2: 2} | {n: n % 23 for n in range(3, 300)}
    extra_fields = {
        entity: [{"name": key, "order": 0, "field_type": "text", "key": key, "entity_type": entity}]
        for entity, key in (("vendor", "supplier"), ("filament", "batch"), ("spool", "slot"))
    }
    return {
        "vendor": [
            row("vendor", n, name=f"vendor {n}", registered=REGISTERED, comment=f"#{n}", empty_spool_weight=150.5 + n)
            for n in range(12)
        ],
        "filament": [
            row(
                "filament",
                n,
                name=f"filament {n}" if n < 23 else DELETABLE_FILAMENT,
                registered=REGISTERED,
                vendor_id=None if vendor_of.get(n) is None else f"vendor {vendor_of[n]}",
                density=1.24,
                diameter=1.75,
                weight=1000.0,
                color_hex=f"{n:06X}",
            )
            for n in range(24)
        ],
        "spool": [
            row(
                "spool",
                n,
                comment=f"spool {n}",
                registered=REGISTERED,
                filament_id=f"filament {filament_of[n]}",
                used_weight=n / 4,
                location=f"shelf {n % 7}",
                archived=n == 3,
            )
            for n in range(300)
        ],
        "setting": [
            {"key": f"extra_fields_{entity}", "value": json.dumps(fields), "last_updated": REGISTERED}
            for entity, fields in extra_fields.items()
        ],
        "vendor_field": [
            {"vendor_id": f"vendor {n}", "key": "supplier", "value": json.dumps(f"supplier {n}")} for n in (0, 3, 6)
        ],
        "filament_field": [
            {"filament_id": key, "key": "batch", "value": json.dumps(key)}
            for key in ("filament 0", "filament 5", DELETABLE_FILAMENT)
        ],
        "spool_field": [{"spool_id": f"spool {n}", "key": "slot", "value": json.dumps(n)} for n in (0, 2, 5)],
        "tag": [
            tag(0, "filament", filament_id="filament 0"),
            tag(1, "spool", spool_id="spool 0"),
            tag(2, "spool", spool_id="spool 5"),
            tag(3, "spool", spool_id="spool 1"),
            tag(4, "filament", filament_id="filament 5"),
            tag(5, "filament", filament_id=DELETABLE_FILAMENT),
            tag(6, "location", target_value="Shelf A"),
            tag(7, "spool", spool_id="spool 3"),
        ],
    }


def tables(conn: sa.Connection) -> dict[str, sa.TableClause]:
    """Get every table except alembic's own, with its columns as they are in the database."""
    inspector = sa.inspect(conn)
    return {
        name: sa.table(name, *(sa.column(column["name"], column["type"]) for column in inspector.get_columns(name)))
        for name in sorted(inspector.get_table_names())
        if name != "alembic_version"
    }


def references(conn: sa.Connection) -> dict[str, dict[str, str]]:
    """Get the table each foreign key column points to, by table."""
    inspector = sa.inspect(conn)
    return {
        name: {fk["constrained_columns"][0]: fk["referred_table"] for fk in inspector.get_foreign_keys(name)}
        for name in inspector.get_table_names()
    }


def seed(conn: sa.Connection, pinned: dict[str, dict[int, int]]) -> None:
    """Fill the database, rows with a pinned ID after the others so they can't collide."""
    table_of = tables(conn)
    reference_of = references(conn)
    ids: dict[str, dict[str, int]] = {}
    for name, rows in seed_rows(pinned).items():
        resolved = [
            {
                column: ids[reference_of[name][column]][value] if column in reference_of[name] and value else value
                for column, value in row.items()
            }
            for row in rows
        ]
        for group in ([row for row in resolved if "id" not in row], [row for row in resolved if "id" in row]):
            if group:
                conn.execute(table_of[name].insert(), group)
        if name in NATURAL_KEYS:
            ids[name] = {key: id_ for id_, key in conn.execute(sa.text(f"SELECT id, {NATURAL_KEYS[name]} FROM {name}"))}


def plain(value: Any) -> Any:  # noqa: ANN401
    """Make a column value JSON friendly."""
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    return value


def snapshot(conn: sa.Connection) -> Snapshot:
    """Read every row of every table."""
    reference_of = references(conn)
    keys = {
        name: dict(conn.execute(sa.text(f"SELECT id, {column} FROM {name}")).all())
        for name, column in NATURAL_KEYS.items()
    }
    raw = {}
    natural = {}
    for name, table in tables(conn).items():
        rows = [
            {column: plain(value) for column, value in row.items()} for row in conn.execute(sa.select(table)).mappings()
        ]
        raw[name] = sorted(rows, key=lambda row: json.dumps(row, sort_keys=True))
        natural_rows = []
        for row in rows:
            natural_row = {column: value for column, value in row.items() if column != "id"}
            for column, parent in reference_of[name].items():
                if row[column] is not None:
                    natural_row[column] = keys[parent][row[column]]
            natural_rows.append(natural_row)
        natural[name] = sorted(natural_rows, key=lambda row: json.dumps(row, sort_keys=True))
    ids = {name: {key: id_ for id_, key in by_id.items()} for name, by_id in keys.items()}
    return Snapshot(raw, natural, ids)


def renumbered(ids: dict[str, dict[str, int]]) -> dict[str, dict[str, int]]:
    """Get the IDs the upgrade should end with: unsafe ones go after the largest safe one, in order."""
    result = {}
    for name, id_of in ids.items():
        first_id = max((id_ for id_ in id_of.values() if id_ < UNSAFE_ID), default=0) + 1
        new_ids = {old: first_id + n for n, old in enumerate(sorted(id_ for id_ in id_of.values() if id_ >= UNSAFE_ID))}
        result[name] = {key: new_ids.get(id_, id_) for key, id_ in id_of.items()}
    return result


def same(actual: Any, expected: Any, what: str) -> None:  # noqa: ANN401
    """Fail with a readable diff unless actual equals expected."""
    if actual != expected:
        diff = difflib.unified_diff(
            json.dumps(expected, indent=1, sort_keys=True, default=str).splitlines(),
            json.dumps(actual, indent=1, sort_keys=True, default=str).splitlines(),
            "expected",
            "actual",
            lineterm="",
        )
        raise AssertionError(f"{what}:\n" + "\n".join(list(diff)[:60]))


def version(conn: sa.Connection) -> str:
    """Get the revision the database is at."""
    return conn.execute(sa.text("SELECT version_num FROM alembic_version")).scalar_one()


def id_defaults(conn: sa.Connection) -> dict[str, str]:
    """Get the default of every id column, by table. Looked up so new tables with IDs get checked too."""
    return dict(
        conn.execute(
            sa.text(
                "SELECT table_name, column_default FROM information_schema.columns "
                "WHERE table_schema = current_schema() AND column_name = 'id'",
            ),
        ).all(),
    )


def sequence_default(name: str) -> str:
    """Get the ID default a table has once it is sequence-backed."""
    return f"nextval('public.{name}_id_seq'::REGCLASS)"


def cockroachdb_schema(conn: sa.Connection) -> list[str]:
    """Get the DDL of every table, with the ID defaults and the sequences behind them left out."""
    return sorted(
        re.sub(r"DEFAULT (unique_rowid\(\)|nextval\('public\.\w+_id_seq'::REGCLASS\))", "DEFAULT <id>", statement)
        for (statement,) in conn.execute(sa.text("SHOW CREATE ALL TABLES"))
        if not statement.startswith("CREATE SEQUENCE")
    )


def alembic(*args: str, legacy: bool = False, kill: tuple[str, str, int] | None = None, exit_code: int = 0) -> str:
    """Run alembic in its own process like Spoolman does, check how it exited and return its output."""
    options = ["--legacy-schema"] if legacy else []
    if kill:
        options += ["--kill", kill[0], kill[1], str(kill[2])]
    command = " ".join(["alembic", *options, *args])
    print(f"harness: {command}", flush=True)
    result = subprocess.run(
        [sys.executable, str(RUN_ALEMBIC), *options, *args],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != exit_code:
        raise AssertionError(f"{command} exited with {result.returncode}, not {exit_code}:\n{result.stderr}")
    return result.stderr


def check_upgraded(engine: sa.Engine, before: Snapshot, schema: list[str]) -> None:
    """Check that an upgrade from `before` is complete and lost nothing."""
    with engine.connect() as conn:
        same(version(conn), SEQUENCES, "revision")
        after = snapshot(conn)
        same(after.natural, before.natural, "rows and references by natural key")
        same(after.ids, renumbered(before.ids), "IDs")
        same(cockroachdb_schema(conn), schema, "schema apart from the ID defaults")
        for name, default in id_defaults(conn).items():
            same(default, sequence_default(name), f"{name}.id default")
            max_id = conn.execute(sa.text(f"SELECT coalesce(max(id), 0) FROM {name}")).scalar_one()
            last_id = conn.execute(sa.text(f"SELECT last_value FROM {name}_id_seq")).scalar_one()
            if not max_id <= last_id < UNSAFE_ID - 1:
                raise AssertionError(f"{name}_id_seq is at {last_id}, it must be safe and at least {max_id}")


def build_old_install(engine: sa.Engine) -> tuple[Snapshot, list[str]]:
    """Build and seed the schema Spoolman had before the fix, at the revision before the ID migrations."""
    if sa.inspect(engine).get_table_names():
        raise RuntimeError("The harness needs an empty database.")
    alembic("upgrade", PREVIOUS, legacy=True)
    with engine.connect() as conn:
        # If this stops reproducing an old install, everything below would pass for nothing.
        same(set(id_defaults(conn).values()), {"unique_rowid()"}, "ID defaults before the upgrade")
        same(conn.execute(sa.text("SELECT sequence_name FROM information_schema.sequences")).all(), [], "sequences")
        seed(conn, COCKROACHDB_IDS)
        conn.commit()
        return snapshot(conn), cockroachdb_schema(conn)


def check_no_room_left(engine: sa.Engine, before: Snapshot) -> None:
    """Check the upgrade refuses when a table holds 2^53 - 1, the largest safe ID, leaving no room for the rest."""
    print("harness: no room below 2^53 left for the spools", flush=True)
    with engine.begin() as conn:
        conn.execute(
            sa.text("INSERT INTO spool (id, registered, filament_id, used_weight) VALUES (:id, :at, :filament, 0)"),
            {"id": UNSAFE_ID - 1, "at": REGISTERED, "filament": before.ids["filament"]["filament 0"]},
        )
    output = alembic("upgrade", SEQUENCES, exit_code=1)
    if "no free IDs left below 2^53" not in output:
        raise AssertionError(f"the upgrade failed, but not because it ran out of safe spool IDs:\n{output}")
    with engine.begin() as conn:
        conn.execute(sa.text("DELETE FROM spool WHERE id = :id"), {"id": UNSAFE_ID - 1})
        same(version(conn), PREVIOUS, "revision after the refused upgrade")
        # Vendors and filaments were renumbered before the spools, in the same transaction.
        same(snapshot(conn).raw, before.raw, "rows after the refused upgrade")


def check_kills(engine: sa.Engine, before: Snapshot) -> None:
    """Kill the upgrade at each kill point, and check what it left is safe to upgrade again."""
    for kill, rolled_back_to, changed in KILLS:
        # Exiting any other way means the kill point was never reached and needs updating.
        alembic("upgrade", SEQUENCES, kill=kill, exit_code=-signal.SIGKILL)
        with engine.connect() as conn:
            same(version(conn), rolled_back_to, f"revision after a kill {kill}")
            defaults = id_defaults(conn)
            expected = {name: sequence_default(name) if name in changed else "unique_rowid()" for name in defaults}
            same(defaults, expected, f"ID defaults after a kill {kill}")
            current = snapshot(conn)
            if rolled_back_to == PREVIOUS:
                same(current.raw, before.raw, f"rows after a kill {kill}")
            else:
                same(current.natural, before.natural, f"rows and references after a kill {kill}")
                same(current.ids, renumbered(before.ids), f"IDs after a kill {kill}")


def check_late_rows(engine: sa.Engine, schema: list[str]) -> Snapshot:
    """Rows written while the unique_rowid() default is back must not end up seeding the sequence."""
    print("harness: a row written after a downgrade by one revision", flush=True)
    alembic("downgrade", RENUMBER)
    with engine.begin() as conn:
        conn.execute(sa.text("INSERT INTO vendor (registered, name) VALUES (:at, 'late vendor')"), {"at": REGISTERED})
        late = snapshot(conn)
    output = alembic("upgrade", SEQUENCES, exit_code=1)
    if "renumbered first" not in output:
        raise AssertionError(f"the upgrade failed, but not because of the unsafe vendor ID:\n{output}")
    with engine.connect() as conn:
        same(version(conn), RENUMBER, "revision after the refused upgrade")
        same(snapshot(conn).raw, late.raw, "rows after the refused upgrade")
    alembic("downgrade", f"{RENUMBER}-1")  # what the error message says to do
    alembic("upgrade", SEQUENCES)
    check_upgraded(engine, late, schema)
    return late


def cockroachdb(manifest: Path) -> None:
    """Upgrade a pre-#797 CockroachDB through every interruption and check the result."""
    engine = sa.create_engine(get_connection_url().set(drivername="cockroachdb+psycopg2"))
    before, schema = build_old_install(engine)
    check_no_room_left(engine, before)
    check_kills(engine, before)

    alembic("upgrade", SEQUENCES)
    check_upgraded(engine, before, schema)

    print("harness: rerunning both migrations on the upgraded database", flush=True)
    alembic("stamp", PREVIOUS)
    alembic("upgrade", SEQUENCES)
    check_upgraded(engine, before, schema)

    late = check_late_rows(engine, schema)

    with engine.connect() as conn:
        final = snapshot(conn)
    manifest.write_text(
        json.dumps(
            {
                "old_ids": {name: late.ids[name] | before.ids[name] for name in NATURAL_KEYS},
                "ids": final.ids,
                "rows": final.natural,
                "deletable_filament": DELETABLE_FILAMENT,
            },
        ),
    )
    print(f"harness: all checks passed, wrote {manifest}", flush=True)


def untouched_snapshot(conn: sa.Connection) -> dict[str, Any]:
    """Get every row and everything about the schema that an upgrade could change."""
    inspector = sa.inspect(conn)
    schema = {
        name: {
            "columns": [
                [column["name"], str(column["type"]), column["nullable"], column["default"]]
                for column in inspector.get_columns(name)
            ],
            "primary key": inspector.get_pk_constraint(name)["constrained_columns"],
            "foreign keys": sorted(
                json.dumps(fk, sort_keys=True, default=str) for fk in inspector.get_foreign_keys(name)
            ),
            "indexes": sorted(json.dumps(index, sort_keys=True, default=str) for index in inspector.get_indexes(name)),
        }
        for name in inspector.get_table_names()
    }
    queries = {
        "postgresql": "SELECT sequencename, last_value FROM pg_sequences ORDER BY 1",
        "mysql": "SELECT table_name, auto_increment FROM information_schema.tables WHERE table_schema = DATABASE()",
        "sqlite": "SELECT type, name, sql FROM sqlite_master",
    }
    counters = sorted([list(row) for row in conn.execute(sa.text(queries[conn.dialect.name]))], key=str)
    return {"rows": snapshot(conn).raw, "schema": schema, "counters": counters}


def untouched() -> None:
    """Check that the upgrade and the downgrade change nothing but the revision outside cockroachdb."""
    url = get_connection_url()
    drivers = {
        "sqlite+aiosqlite": "sqlite",
        "postgresql+asyncpg": "postgresql+psycopg2",
        "mysql+aiomysql": "mysql+pymysql",
    }
    engine = sa.create_engine(url.set(drivername=drivers[url.drivername]))
    if sa.inspect(engine).get_table_names():
        raise RuntimeError("The harness needs an empty database.")

    alembic("upgrade", PREVIOUS)
    with engine.begin() as conn:
        seed(conn, {name: {1: UNTOUCHED_IDS[engine.dialect.name]} for name in NATURAL_KEYS})
    with engine.connect() as conn:
        before = untouched_snapshot(conn)

    for args, revision in ((("upgrade", SEQUENCES), SEQUENCES), (("downgrade", PREVIOUS), PREVIOUS)):
        alembic(*args)
        with engine.connect() as conn:
            same(version(conn), revision, "revision")
            same(untouched_snapshot(conn), before, f"database after alembic {' '.join(args)}")
    print(f"harness: {engine.dialect.name} is untouched apart from the revision", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("mode", choices=["cockroachdb", "untouched"])
    parser.add_argument("--manifest", type=Path, default=Path("/manifest/manifest.json"))
    args = parser.parse_args()
    if args.mode == "cockroachdb":
        cockroachdb(args.manifest)
    else:
        untouched()

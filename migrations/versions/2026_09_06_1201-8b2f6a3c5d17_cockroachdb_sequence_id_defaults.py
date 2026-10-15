"""cockroachdb sequence id defaults.

Revision ID: 8b2f6a3c5d17
Revises: 4e7c1b8d9f23
Create Date: 2026-09-06 12:01:00.000000
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "8b2f6a3c5d17"
down_revision = "4e7c1b8d9f23"
branch_labels = None
depends_on = None

TABLES = ("vendor", "filament", "spool", "tag")

# See 4e7c1b8d9f23.
UNSAFE_ID = 2**53


def max_ids() -> dict[str, int]:
    """Get the largest ID of each table, refusing to go on if any of them is unsafe."""
    connection = op.get_bind()
    result = {}
    for table_name in TABLES:
        max_id = connection.execute(sa.text(f"SELECT coalesce(max(id), 0) FROM {table_name}")).scalar_one()  # noqa: S608
        if max_id >= UNSAFE_ID:
            # Rows written while the default was still unique_rowid(), for example after a downgrade
            # by one revision. A sequence can't start above them without handing out unsafe IDs too.
            raise RuntimeError(
                f"{table_name} has IDs of 2^53 and up, which the web UI cannot address (#797). They have to be "
                f"renumbered first: run 'alembic downgrade {down_revision}-1' and start Spoolman again.",
            )
        result[table_name] = max_id
    return result


def upgrade() -> None:
    """Give existing CockroachDB tables sequence-backed ID defaults."""
    """New installs already get these via serial_normalization=sql_sequence, but"""
    """tables created before that still default to unique_rowid(), which generates"""
    """64-bit IDs the web UI cannot represent (#797). This is kept separate from the"""
    """renumbering migration because of cockroachdb's execution of alembic migrations"""
    """(see 304a32906234)."""
    if op.get_bind().dialect.name != "cockroachdb":
        return

    start_ids = {table_name: max_id + 1 for table_name, max_id in max_ids().items()}

    # Each DDL statement commits on its own, as cockroachdb recommends, instead of sharing a
    # transaction with the version stamp. A schema change that fails at commit then fails this
    # migration rather than leaving it stamped without the change. Every statement is safe to
    # repeat, so an interrupted upgrade just runs them all again.
    with op.get_context().autocommit_block():
        for table_name, start_id in start_ids.items():
            op.execute(f"CREATE SEQUENCE IF NOT EXISTS {table_name}_id_seq START WITH {start_id}")
            # The sequence may already exist (serial_normalization=sql_sequence created it at
            # CREATE TABLE time), so make sure it continues above the current IDs either way.
            op.execute(f"SELECT setval('{table_name}_id_seq', {start_id}, false)")
            op.execute(f"ALTER TABLE {table_name} ALTER COLUMN id SET DEFAULT nextval('{table_name}_id_seq')")

    # Only stamp the revision once every table has its new default and no unsafe ID got in meanwhile.
    max_ids()
    connection = op.get_bind()
    for table_name in TABLES:
        default = connection.execute(
            sa.text(
                "SELECT column_default FROM information_schema.columns "
                "WHERE table_schema = current_schema() AND table_name = :table_name AND column_name = 'id'",
            ),
            {"table_name": table_name},
        ).scalar_one()
        if f"{table_name}_id_seq" not in str(default):
            raise RuntimeError(f"Setting the {table_name} ID default failed, it is still {default}.")


def downgrade() -> None:
    """Restore the unique_rowid() ID defaults."""
    if op.get_bind().dialect.name != "cockroachdb":
        return

    with op.get_context().autocommit_block():
        for table_name in TABLES:
            op.execute(f"ALTER TABLE {table_name} ALTER COLUMN id SET DEFAULT unique_rowid()")

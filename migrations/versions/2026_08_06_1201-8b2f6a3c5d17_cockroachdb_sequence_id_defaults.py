"""cockroachdb sequence id defaults.

Revision ID: 8b2f6a3c5d17
Revises: 4e7c1b8d9f23
Create Date: 2026-08-06 12:01:00.000000
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "8b2f6a3c5d17"
down_revision = "4e7c1b8d9f23"
branch_labels = None
depends_on = None

TABLES = ("vendor", "filament", "spool")


def upgrade() -> None:
    """Give existing CockroachDB tables sequence-backed ID defaults."""
    """New installs already get these via serial_normalization=sql_sequence, but"""
    """tables created before that still default to unique_rowid(), which generates"""
    """64-bit IDs the web UI cannot represent (#797). This is kept separate from the"""
    """renumbering migration because of cockroachdb's execution of alembic migrations"""
    """(see 304a32906234)."""
    connection = op.get_bind()
    if connection.dialect.name != "cockroachdb":
        return

    for table_name in TABLES:
        max_id = connection.execute(
            sa.text(f"SELECT coalesce(max(id), 0) FROM {table_name}"),  # noqa: S608
        ).scalar_one()
        connection.execute(
            sa.text(f"CREATE SEQUENCE IF NOT EXISTS {table_name}_id_seq START WITH {max_id + 1}"),
        )
        # The sequence may already exist (serial_normalization=sql_sequence created it at
        # CREATE TABLE time), so make sure it continues above the current IDs either way.
        connection.execute(
            sa.text(f"SELECT setval('{table_name}_id_seq', {max_id + 1}, false)"),
        )
        connection.execute(
            sa.text(f"ALTER TABLE {table_name} ALTER COLUMN id SET DEFAULT nextval('{table_name}_id_seq')"),
        )


def downgrade() -> None:
    """Restore the unique_rowid() ID defaults."""
    connection = op.get_bind()
    if connection.dialect.name != "cockroachdb":
        return

    for table_name in TABLES:
        connection.execute(
            sa.text(f"ALTER TABLE {table_name} ALTER COLUMN id SET DEFAULT unique_rowid()"),
        )

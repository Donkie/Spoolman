"""repair vendor id autoincrement.

Revision ID: 7b9f3d1c5a24
Revises: fe4970567bb3
Create Date: 2026-09-02 09:00:00.000000
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "7b9f3d1c5a24"
down_revision = "fe4970567bb3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Rebuild the vendor table on SQLite if its id column cannot auto-increment.

    SQLite only auto-assigns ids to a column declared exactly as a single-column
    INTEGER PRIMARY KEY (a rowid alias). Databases that have passed through
    third-party export/conversion tools can come back with e.g. a BIGINT id or a
    lost primary key; such a table then rejects every INSERT that does not carry
    an explicit id with "NOT NULL constraint failed: vendor.id" (#1131). Tables
    created by our own migrations are detected as healthy and left untouched.
    """
    conn = op.get_bind()
    if conn.dialect.name != "sqlite":
        return

    # PRAGMA table_info rows are (cid, name, type, notnull, dflt_value, pk), where
    # pk is the 1-based position of the column in the primary key, or 0.
    info = conn.exec_driver_sql("PRAGMA table_info('vendor')").fetchall()
    if not info:
        return
    pk_columns = [row for row in info if row[5] > 0]
    id_is_rowid_alias = (
        len(pk_columns) == 1 and pk_columns[0][1] == "id" and (pk_columns[0][2] or "").upper() == "INTEGER"
    )
    if id_is_rowid_alias:
        return

    vendor = sa.Table(
        "vendor",
        sa.MetaData(),
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("registered", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("name", sa.String(length=64), nullable=False),
        sa.Column("comment", sa.String(length=1024), nullable=True),
        sa.Column("empty_spool_weight", sa.Float(), nullable=True),
        sa.Column("external_id", sa.String(length=256), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("vendor", copy_from=vendor, recreate="always"):
        pass
    # The old table's indexes went down with it; restore the one the initial
    # migration created.
    op.create_index(op.f("ix_vendor_id"), "vendor", ["id"], unique=False)


def downgrade() -> None:
    """Perform the downgrade."""
    # Nothing to undo: the upgrade only normalizes the table back to the schema
    # the initial migration always intended.

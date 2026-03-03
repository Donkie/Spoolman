"""spool_search_indexes.

Revision ID: f1a3d9c2c4e1
Revises: b76f1b4c3f5a
Create Date: 2026-02-11 17:10:00.000000
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "f1a3d9c2c4e1"
down_revision = "b76f1b4c3f5a"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Perform the upgrade."""
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    # Match the filament-index migration's idempotent behavior so rebuilding a PR
    # against an already-used SQLite file does not fail on duplicate indexes.
    spool_indexes = {index["name"] for index in inspector.get_indexes("spool")}

    if "ix_spool_location" not in spool_indexes:
        op.create_index("ix_spool_location", "spool", ["location"], unique=False)
    if "ix_spool_lot_nr" not in spool_indexes:
        op.create_index("ix_spool_lot_nr", "spool", ["lot_nr"], unique=False)


def downgrade() -> None:
    """Perform the downgrade."""
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    spool_indexes = {index["name"] for index in inspector.get_indexes("spool")}

    if "ix_spool_lot_nr" in spool_indexes:
        op.drop_index("ix_spool_lot_nr", table_name="spool")
    if "ix_spool_location" in spool_indexes:
        op.drop_index("ix_spool_location", table_name="spool")

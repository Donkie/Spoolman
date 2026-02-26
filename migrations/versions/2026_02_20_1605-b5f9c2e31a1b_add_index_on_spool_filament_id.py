"""add index on spool.filament_id.

Revision ID: b5f9c2e31a1b
Revises: 415a8f855e14
Create Date: 2026-02-20 16:05:00.000000
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "b5f9c2e31a1b"
down_revision = "415a8f855e14"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Perform the upgrade."""
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    index_names = {index["name"] for index in inspector.get_indexes("spool")}
    if "ix_spool_filament_id" not in index_names:
        op.create_index("ix_spool_filament_id", "spool", ["filament_id"], unique=False)


def downgrade() -> None:
    """Perform the downgrade."""
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    index_names = {index["name"] for index in inspector.get_indexes("spool")}
    if "ix_spool_filament_id" in index_names:
        op.drop_index("ix_spool_filament_id", table_name="spool")

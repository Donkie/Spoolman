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
    op.create_index("ix_spool_location", "spool", ["location"], unique=False)
    op.create_index("ix_spool_lot_nr", "spool", ["lot_nr"], unique=False)


def downgrade() -> None:
    """Perform the downgrade."""
    op.drop_index("ix_spool_lot_nr", table_name="spool")
    op.drop_index("ix_spool_location", table_name="spool")

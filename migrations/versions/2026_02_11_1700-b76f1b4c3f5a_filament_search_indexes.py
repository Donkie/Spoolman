"""filament_search_indexes.

Revision ID: b76f1b4c3f5a
Revises: 415a8f855e14
Create Date: 2026-02-11 17:00:00.000000
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "b76f1b4c3f5a"
down_revision = "415a8f855e14"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Perform the upgrade."""
    op.create_index("ix_vendor_name", "vendor", ["name"], unique=False)
    op.create_index("ix_filament_name", "filament", ["name"], unique=False)
    op.create_index("ix_filament_material", "filament", ["material"], unique=False)
    op.create_index("ix_filament_article_number", "filament", ["article_number"], unique=False)
    op.create_index("ix_filament_external_id", "filament", ["external_id"], unique=False)
    op.create_index("ix_filament_vendor_id", "filament", ["vendor_id"], unique=False)


def downgrade() -> None:
    """Perform the downgrade."""
    op.drop_index("ix_filament_vendor_id", table_name="filament")
    op.drop_index("ix_filament_external_id", table_name="filament")
    op.drop_index("ix_filament_article_number", table_name="filament")
    op.drop_index("ix_filament_material", table_name="filament")
    op.drop_index("ix_filament_name", table_name="filament")
    op.drop_index("ix_vendor_name", table_name="vendor")

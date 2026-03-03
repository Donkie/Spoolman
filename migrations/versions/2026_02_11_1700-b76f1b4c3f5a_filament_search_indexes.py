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
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    # These guards let local PR/test databases be reused safely even when a branch
    # is rebuilt against a file that already picked up some of the same indexes.
    vendor_indexes = {index["name"] for index in inspector.get_indexes("vendor")}
    filament_indexes = {index["name"] for index in inspector.get_indexes("filament")}

    if "ix_vendor_name" not in vendor_indexes:
        op.create_index("ix_vendor_name", "vendor", ["name"], unique=False)
    if "ix_filament_name" not in filament_indexes:
        op.create_index("ix_filament_name", "filament", ["name"], unique=False)
    if "ix_filament_material" not in filament_indexes:
        op.create_index("ix_filament_material", "filament", ["material"], unique=False)
    if "ix_filament_article_number" not in filament_indexes:
        op.create_index("ix_filament_article_number", "filament", ["article_number"], unique=False)
    if "ix_filament_external_id" not in filament_indexes:
        op.create_index("ix_filament_external_id", "filament", ["external_id"], unique=False)
    if "ix_filament_vendor_id" not in filament_indexes:
        op.create_index("ix_filament_vendor_id", "filament", ["vendor_id"], unique=False)


def downgrade() -> None:
    """Perform the downgrade."""
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    vendor_indexes = {index["name"] for index in inspector.get_indexes("vendor")}
    filament_indexes = {index["name"] for index in inspector.get_indexes("filament")}

    if "ix_filament_vendor_id" in filament_indexes:
        op.drop_index("ix_filament_vendor_id", table_name="filament")
    if "ix_filament_external_id" in filament_indexes:
        op.drop_index("ix_filament_external_id", table_name="filament")
    if "ix_filament_article_number" in filament_indexes:
        op.drop_index("ix_filament_article_number", table_name="filament")
    if "ix_filament_material" in filament_indexes:
        op.drop_index("ix_filament_material", table_name="filament")
    if "ix_filament_name" in filament_indexes:
        op.drop_index("ix_filament_name", table_name="filament")
    if "ix_vendor_name" in vendor_indexes:
        op.drop_index("ix_vendor_name", table_name="vendor")

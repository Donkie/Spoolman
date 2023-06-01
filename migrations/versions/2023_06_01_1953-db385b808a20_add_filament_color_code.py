"""add filament color code.

Revision ID: db385b808a20
Revises: b47376d60c6d
Create Date: 2023-06-01 19:53:44.440616
"""
import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "db385b808a20"
down_revision = "b47376d60c6d"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Perform the upgrade."""
    op.add_column("filament", sa.Column("color_hex", sa.String(length=6), nullable=True))


def downgrade() -> None:
    """Perform the downgrade."""
    op.drop_column("filament", "color_hex")

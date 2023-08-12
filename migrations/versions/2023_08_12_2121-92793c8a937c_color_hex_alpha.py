"""color_hex alpha.

Revision ID: 92793c8a937c
Revises: 92186a5f7b0f
Create Date: 2023-08-12 21:21:08.536216
"""
import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "92793c8a937c"
down_revision = "92186a5f7b0f"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Perform the upgrade."""
    op.alter_column("filament", "color_hex", type_=sa.String(length=8), existing_nullable=True)


def downgrade() -> None:
    """Perform the downgrade."""
    op.alter_column("filament", "color_hex", type_=sa.String(length=6), existing_nullable=True)

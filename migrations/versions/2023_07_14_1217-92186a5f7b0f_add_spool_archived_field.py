"""add spool archived field.

Revision ID: 92186a5f7b0f
Revises: db385b808a20
Create Date: 2023-07-14 12:17:13.162618
"""
import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "92186a5f7b0f"
down_revision = "db385b808a20"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Perform the upgrade."""
    op.add_column("spool", sa.Column("archived", sa.Boolean(), nullable=True))


def downgrade() -> None:
    """Perform the downgrade."""
    op.drop_column("spool", "archived")

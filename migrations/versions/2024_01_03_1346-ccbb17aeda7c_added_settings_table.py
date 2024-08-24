"""Added Settings table.

Revision ID: ccbb17aeda7c
Revises: b82cd9e2aa6f
Create Date: 2024-01-03 13:46:41.362341
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "ccbb17aeda7c"
down_revision = "b82cd9e2aa6f"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Perform the upgrade."""
    op.create_table(
        "setting",
        sa.Column("key", sa.String(length=64), nullable=False),
        sa.Column("value", sa.Text(), nullable=False),
        sa.Column("last_updated", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("key"),
    )
    op.create_index(op.f("ix_setting_key"), "setting", ["key"], unique=False)


def downgrade() -> None:
    """Perform the downgrade."""
    op.drop_index(op.f("ix_setting_key"), table_name="setting")
    op.drop_table("setting")

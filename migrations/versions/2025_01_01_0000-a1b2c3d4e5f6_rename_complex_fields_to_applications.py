"""rename_complex_fields_to_applications.

Revision ID: a1b2c3d4e5f6
Revises: 415a8f855e14
Create Date: 2025-01-01 00:00:00.000000
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "a1b2c3d4e5f6"
down_revision = "415a8f855e14"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Rename complex_fields_* setting keys to applications_* keys."""
    connection = op.get_bind()
    connection.execute(sa.text("UPDATE setting SET key = 'applications_vendor' WHERE key = 'complex_fields_vendor'"))
    connection.execute(
        sa.text("UPDATE setting SET key = 'applications_filament' WHERE key = 'complex_fields_filament'")
    )
    connection.execute(sa.text("UPDATE setting SET key = 'applications_spool' WHERE key = 'complex_fields_spool'"))


def downgrade() -> None:
    """Revert applications_* setting keys back to complex_fields_* keys."""
    connection = op.get_bind()
    connection.execute(sa.text("UPDATE setting SET key = 'complex_fields_vendor' WHERE key = 'applications_vendor'"))
    connection.execute(
        sa.text("UPDATE setting SET key = 'complex_fields_filament' WHERE key = 'applications_filament'")
    )
    connection.execute(sa.text("UPDATE setting SET key = 'complex_fields_spool' WHERE key = 'applications_spool'"))

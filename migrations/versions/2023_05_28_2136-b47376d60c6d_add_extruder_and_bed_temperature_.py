"""add extruder and bed temperature override.

Revision ID: b47376d60c6d
Revises: 684d32cf7e4d
Create Date: 2023-05-28 21:36:53.452067
"""
import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "b47376d60c6d"
down_revision = "684d32cf7e4d"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Perform the upgrade."""
    op.add_column(
        "filament",
        sa.Column("settings_extruder_temp", sa.Integer(), nullable=True, comment="Overridden extruder temperature."),
    )
    op.add_column(
        "filament",
        sa.Column("settings_bed_temp", sa.Integer(), nullable=True, comment="Overridden bed temperature."),
    )


def downgrade() -> None:
    """Perform the downgrade."""
    op.drop_column("filament", "settings_bed_temp")
    op.drop_column("filament", "settings_extruder_temp")

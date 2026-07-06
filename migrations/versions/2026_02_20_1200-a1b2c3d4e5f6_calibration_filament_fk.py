"""calibration_filament_fk: move CalibrationSession FK from spool to filament.

Revision ID: a1b2c3d4e5f6
Revises: c3a7f2e8b091
Create Date: 2026-02-20 12:00:00.000000
"""

import sqlalchemy as sa
from alembic import op

revision = "a1b2c3d4e5f6"
down_revision = "c3a7f2e8b091"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Move spool_id -> filament_id on calibration_session."""
    connection = op.get_bind()

    # 1. Add filament_id as nullable so we can populate it before constraining
    with op.batch_alter_table("calibration_session") as batch_op:
        batch_op.add_column(sa.Column("filament_id", sa.Integer(), nullable=True))

    # 2. Populate filament_id from the related spool row
    connection.execute(
        sa.text(
            "UPDATE calibration_session "
            "SET filament_id = (SELECT filament_id FROM spool WHERE spool.id = calibration_session.spool_id)"
        )
    )

    # 3. Recreate the table: drop spool_id, make filament_id NOT NULL with FK
    with op.batch_alter_table("calibration_session", recreate="always") as batch_op:
        batch_op.drop_column("spool_id")
        batch_op.alter_column("filament_id", existing_type=sa.Integer(), nullable=False)
        batch_op.create_foreign_key(
            "fk_calibration_session_filament_id",
            "filament",
            ["filament_id"],
            ["id"],
            ondelete="CASCADE",
        )


def downgrade() -> None:
    """Move filament_id -> spool_id (data cannot be recovered; spool_id will be NULL)."""
    with op.batch_alter_table("calibration_session") as batch_op:
        batch_op.add_column(sa.Column("spool_id", sa.Integer(), nullable=True))

    with op.batch_alter_table("calibration_session", recreate="always") as batch_op:
        batch_op.drop_column("filament_id")
        batch_op.create_foreign_key(
            "fk_calibration_session_spool_id",
            "spool",
            ["spool_id"],
            ["id"],
            ondelete="CASCADE",
        )

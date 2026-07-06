"""calibration_tables.

Revision ID: c3a7f2e8b091
Revises: 415a8f855e14
Create Date: 2025-02-19 12:00:00.000000
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "c3a7f2e8b091"
down_revision = "415a8f855e14"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Perform the upgrade."""
    op.create_table(
        "calibration_session",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("registered", sa.DateTime(), nullable=False),
        sa.Column("spool_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("printer_name", sa.String(length=256), nullable=True),
        sa.Column("nozzle_diameter", sa.Float(), nullable=True),
        sa.Column("notes", sa.String(length=1024), nullable=True),
        sa.ForeignKeyConstraint(["spool_id"], ["spool.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_calibration_session_id"), "calibration_session", ["id"], unique=False)

    op.create_table(
        "calibration_step_result",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("session_id", sa.Integer(), nullable=False),
        sa.Column("step_type", sa.String(length=64), nullable=False),
        sa.Column("inputs", sa.Text(), nullable=True),
        sa.Column("outputs", sa.Text(), nullable=True),
        sa.Column("selected_values", sa.Text(), nullable=True),
        sa.Column("notes", sa.String(length=1024), nullable=True),
        sa.Column("confidence", sa.String(length=32), nullable=True),
        sa.Column("recorded_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["session_id"], ["calibration_session.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_calibration_step_result_id"), "calibration_step_result", ["id"], unique=False)


def downgrade() -> None:
    """Perform the downgrade."""
    op.drop_index(op.f("ix_calibration_step_result_id"), table_name="calibration_step_result")
    op.drop_table("calibration_step_result")
    op.drop_index(op.f("ix_calibration_session_id"), table_name="calibration_session")
    op.drop_table("calibration_session")

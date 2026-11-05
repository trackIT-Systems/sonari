"""Add the GUANO backfill status per annotation project.

Revision ID: c9e5a1f3b7d4
Revises: b8d4f0e2a6c3
Create Date: 2026-11-04

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c9e5a1f3b7d4"
down_revision: Union[str, None] = "b8d4f0e2a6c3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "prediction_backfill",
        sa.Column("annotation_project_id", sa.Integer(), nullable=False),
        sa.Column("state", sa.String(), nullable=False),
        sa.Column("started_on", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_on", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_on", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reviewed_tasks", sa.Integer(), nullable=False),
        sa.Column("recordings", sa.Integer(), nullable=False),
        sa.Column("recordings_with_source", sa.Integer(), nullable=False),
        sa.Column("match_rate", sa.Float(), nullable=True),
        sa.Column("originals_created", sa.Integer(), nullable=False),
        sa.Column("error", sa.String(), nullable=True),
        sa.Column("created_on", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["annotation_project_id"],
            ["annotation_project.id"],
            name="fk_prediction_backfill_annotation_project_id_annotation_project",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("annotation_project_id", name="pk_prediction_backfill"),
    )


def downgrade() -> None:
    op.drop_table("prediction_backfill")

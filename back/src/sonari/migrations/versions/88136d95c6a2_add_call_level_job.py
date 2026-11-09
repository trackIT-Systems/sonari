"""Add the status of call level measurements per annotation project and tag.

Revision ID: 88136d95c6a2
Revises: c9e5a1f3b7d4
Create Date: 2026-11-06

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "88136d95c6a2"
down_revision: Union[str, None] = "c9e5a1f3b7d4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "call_level_job",
        sa.Column("annotation_project_id", sa.Integer(), nullable=False),
        sa.Column("tag_id", sa.Integer(), nullable=False),
        sa.Column("state", sa.String(), nullable=False),
        sa.Column("started_on", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_on", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_on", sa.DateTime(timezone=True), nullable=True),
        sa.Column("total", sa.Integer(), nullable=False),
        sa.Column("done", sa.Integer(), nullable=False),
        sa.Column("failed", sa.Integer(), nullable=False),
        sa.Column("error", sa.String(), nullable=True),
        sa.Column("created_on", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["annotation_project_id"],
            ["annotation_project.id"],
            name="fk_call_level_job_annotation_project_id_annotation_project",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["tag_id"],
            ["tag.id"],
            name="fk_call_level_job_tag_id_tag",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("annotation_project_id", "tag_id", name="pk_call_level_job"),
    )


def downgrade() -> None:
    op.drop_table("call_level_job")

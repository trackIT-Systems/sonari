"""Add guided tour fields to annotation_project.

Revision ID: a7b8c9d0e1f2
Revises: e5f6a7b8c9d0
Create Date: 2026-10-12

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a7b8c9d0e1f2"
down_revision: Union[str, None] = "e5f6a7b8c9d0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("annotation_project", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                "is_guided_tour",
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            ),
        )
        batch_op.add_column(
            sa.Column("guided_tour_owner_user_id", sa.Uuid(), nullable=True),
        )
        batch_op.create_foreign_key(
            "fk_annotation_project_guided_tour_owner_user_id_user",
            "user",
            ["guided_tour_owner_user_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch_op.create_index(
            "ix_annotation_project_guided_tour_owner_user_id",
            ["guided_tour_owner_user_id"],
            unique=False,
        )

    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute(
            """
            CREATE UNIQUE INDEX uq_annotation_project_guided_tour_owner
            ON annotation_project (guided_tour_owner_user_id)
            WHERE is_guided_tour IS TRUE AND guided_tour_owner_user_id IS NOT NULL
            """
        )
    else:
        op.execute(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS uq_annotation_project_guided_tour_owner
            ON annotation_project (guided_tour_owner_user_id)
            WHERE is_guided_tour = 1 AND guided_tour_owner_user_id IS NOT NULL
            """
        )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_annotation_project_guided_tour_owner")
    with op.batch_alter_table("annotation_project", schema=None) as batch_op:
        batch_op.drop_index("ix_annotation_project_guided_tour_owner_user_id")
        batch_op.drop_constraint(
            "fk_annotation_project_guided_tour_owner_user_id_user",
            type_="foreignkey",
        )
        batch_op.drop_column("guided_tour_owner_user_id")
        batch_op.drop_column("is_guided_tour")

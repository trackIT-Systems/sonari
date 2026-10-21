"""Add guided_tour_variant and per-variant uniqueness.

Revision ID: b8c9d0e1f3
Revises: a7b8c9d0e1f2
Create Date: 2026-10-12

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b8c9d0e1f3"
down_revision: Union[str, None] = "a7b8c9d0e1f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("annotation_project", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("guided_tour_variant", sa.String(length=16), nullable=True),
        )

    op.execute("DROP INDEX IF EXISTS uq_annotation_project_guided_tour_owner")

    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute(
            """
            CREATE UNIQUE INDEX uq_annotation_project_guided_tour_owner_variant
            ON annotation_project (guided_tour_owner_user_id, guided_tour_variant)
            WHERE is_guided_tour IS TRUE
              AND guided_tour_owner_user_id IS NOT NULL
              AND guided_tour_variant IS NOT NULL
            """
        )
        op.execute(
            """
            CREATE UNIQUE INDEX uq_annotation_project_guided_tour_template_variant
            ON annotation_project (guided_tour_variant)
            WHERE is_guided_tour IS TRUE
              AND guided_tour_owner_user_id IS NULL
              AND guided_tour_variant IS NOT NULL
            """
        )
    else:
        op.execute(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS uq_annotation_project_guided_tour_owner_variant
            ON annotation_project (guided_tour_owner_user_id, guided_tour_variant)
            WHERE is_guided_tour = 1
              AND guided_tour_owner_user_id IS NOT NULL
              AND guided_tour_variant IS NOT NULL
            """
        )
        op.execute(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS uq_annotation_project_guided_tour_template_variant
            ON annotation_project (guided_tour_variant)
            WHERE is_guided_tour = 1
              AND guided_tour_owner_user_id IS NULL
              AND guided_tour_variant IS NOT NULL
            """
        )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_annotation_project_guided_tour_template_variant")
    op.execute("DROP INDEX IF EXISTS uq_annotation_project_guided_tour_owner_variant")

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

    with op.batch_alter_table("annotation_project", schema=None) as batch_op:
        batch_op.drop_column("guided_tour_variant")

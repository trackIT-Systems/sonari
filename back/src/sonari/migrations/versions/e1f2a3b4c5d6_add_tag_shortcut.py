"""Add keyboard shortcuts (keys 0-9) to tags.

Revision ID: e1f2a3b4c5d6
Revises: d0e1f2a3b4c5
Create Date: 2026-10-19

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e1f2a3b4c5d6"
down_revision: Union[str, None] = "d0e1f2a3b4c5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Plain ADD COLUMN (no batch mode), see c9d0e1f2a3b4.
    op.add_column("tag", sa.Column("shortcut", sa.String(length=1), nullable=True))
    op.create_index("ix_tag_shortcut", "tag", ["shortcut"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_tag_shortcut", table_name="tag")
    op.drop_column("tag", "shortcut")

"""Add index on sound_event_annotation_tag.sound_event_annotation_id.

Revision ID: d4e5f6a7b8c9
Revises: f0e1d2c3b4a5
Create Date: 2026-08-13 09:00:00.000000
"""

from typing import Sequence, Union

from alembic import op

revision: str = "d4e5f6a7b8c9"
down_revision: Union[str, None] = "f0e1d2c3b4a5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("sound_event_annotation_tag", schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f("ix_sound_event_annotation_tag_sound_event_annotation_id"),
            ["sound_event_annotation_id"],
            unique=False,
        )


def downgrade() -> None:
    with op.batch_alter_table("sound_event_annotation_tag", schema=None) as batch_op:
        batch_op.drop_index(
            batch_op.f("ix_sound_event_annotation_tag_sound_event_annotation_id"),
        )

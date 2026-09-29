"""Add indexes for annotation task filtering and sorting.

Revision ID: e5f6a7b8c9d0
Revises: c7d8e9f0a1b2
Create Date: 2026-09-29 09:00:00.000000
"""

from typing import Sequence, Union

from alembic import op

revision: str = "e5f6a7b8c9d0"
down_revision: Union[str, None] = "c7d8e9f0a1b2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index("ix_recording_date_time", "recording", ["date", "time"], unique=False)
    op.create_index(
        "ix_sound_event_annotation_tag_tag_id_sea_id",
        "sound_event_annotation_tag",
        ["tag_id", "sound_event_annotation_id"],
        unique=False,
    )
    op.execute("ANALYZE")


def downgrade() -> None:
    op.drop_index("ix_sound_event_annotation_tag_tag_id_sea_id", table_name="sound_event_annotation_tag")
    op.drop_index("ix_recording_date_time", table_name="recording")

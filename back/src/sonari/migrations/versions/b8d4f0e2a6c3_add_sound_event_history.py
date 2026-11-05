"""Add the original state and edit history of sound events.

Only new tables on Postgres. On SQLite, sound_event_annotation is rebuilt once with
AUTOINCREMENT so event ids are never reused.

Revision ID: b8d4f0e2a6c3
Revises: a7c3e9d1f5b2
Create Date: 2026-11-04

"""

from typing import Sequence, Union

import fastapi_users_db_sqlalchemy.generics
import sqlalchemy as sa
from alembic import op

revision: str = "b8d4f0e2a6c3"
down_revision: Union[str, None] = "a7c3e9d1f5b2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _bounds(prefix: str = "") -> list[sa.Column]:
    return [
        sa.Column(f"{prefix}{name}", sa.Float(), nullable=True)
        for name in ("start_time", "end_time", "low_freq", "high_freq")
    ]


def upgrade() -> None:
    guid = fastapi_users_db_sqlalchemy.generics.GUID

    if op.get_bind().dialect.name == "sqlite":
        # The history keys rows by event id, so ids must never be reused. Postgres sequences
        # never do; SQLite reuses the highest id after a delete unless the table uses
        # AUTOINCREMENT, which needs a table rebuild.
        with op.batch_alter_table(
            "sound_event_annotation",
            recreate="always",
            table_kwargs={"sqlite_autoincrement": True},
        ):
            pass

    op.create_table(
        "sound_event_original",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("annotation_task_id", sa.Integer(), nullable=False),
        sa.Column("sound_event_annotation_id", sa.Integer(), nullable=True),
        sa.Column("created_by_id", guid(), nullable=True),
        sa.Column("source", sa.String(), nullable=False),
        sa.Column("geometry_type", sa.String(), nullable=False),
        sa.Column("start_time", sa.Float(), nullable=False),
        sa.Column("end_time", sa.Float(), nullable=False),
        sa.Column("low_freq", sa.Float(), nullable=True),
        sa.Column("high_freq", sa.Float(), nullable=True),
        sa.Column("created_on", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["annotation_task_id"],
            ["annotation_task.id"],
            name="fk_sound_event_original_annotation_task_id_annotation_task",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_id"],
            ["user.id"],
            name="fk_sound_event_original_created_by_id_user",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_sound_event_original"),
        sa.UniqueConstraint("sound_event_annotation_id", name="uq_sound_event_original_sound_event_annotation_id"),
    )
    op.create_index("ix_sound_event_original_annotation_task_id", "sound_event_original", ["annotation_task_id"])

    op.create_table(
        "sound_event_original_tag",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("original_id", sa.Integer(), nullable=False),
        sa.Column("tag_id", sa.Integer(), nullable=True),
        sa.Column("tag_key", sa.String(), nullable=False),
        sa.Column("tag_value", sa.String(), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("created_on", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["original_id"],
            ["sound_event_original.id"],
            name="fk_sound_event_original_tag_original_id_sound_event_original",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["tag_id"],
            ["tag.id"],
            name="fk_sound_event_original_tag_tag_id_tag",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_sound_event_original_tag"),
        sa.UniqueConstraint("original_id", "tag_key", "tag_value", name="uq_sound_event_original_tag_original_id"),
    )
    op.create_index("ix_sound_event_original_tag_tag_id", "sound_event_original_tag", ["tag_id"])

    op.create_table(
        "sound_event_change",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("annotation_task_id", sa.Integer(), nullable=False),
        sa.Column("sound_event_annotation_id", sa.Integer(), nullable=False),
        sa.Column("user_id", guid(), nullable=True),
        sa.Column("edit_id", guid(), nullable=False),
        sa.Column("action", sa.String(), nullable=False),
        sa.Column("old_tag_id", sa.Integer(), nullable=True),
        sa.Column("old_tag_key", sa.String(), nullable=True),
        sa.Column("old_tag_value", sa.String(), nullable=True),
        sa.Column("new_tag_id", sa.Integer(), nullable=True),
        sa.Column("new_tag_key", sa.String(), nullable=True),
        sa.Column("new_tag_value", sa.String(), nullable=True),
        *_bounds("old_"),
        *_bounds("new_"),
        sa.Column("updated_on", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_on", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["annotation_task_id"],
            ["annotation_task.id"],
            name="fk_sound_event_change_annotation_task_id_annotation_task",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["user.id"], name="fk_sound_event_change_user_id_user", ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["old_tag_id"], ["tag.id"], name="fk_sound_event_change_old_tag_id_tag", ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["new_tag_id"], ["tag.id"], name="fk_sound_event_change_new_tag_id_tag", ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id", name="pk_sound_event_change"),
    )
    op.create_index(
        "ix_sound_event_change_annotation_task_id_created_on",
        "sound_event_change",
        ["annotation_task_id", "created_on"],
    )
    op.create_index(
        "ix_sound_event_change_sound_event_annotation_id", "sound_event_change", ["sound_event_annotation_id"]
    )
    op.create_index("ix_sound_event_change_edit_id", "sound_event_change", ["edit_id"])
    op.create_index("ix_sound_event_change_old_tag_id", "sound_event_change", ["old_tag_id"])
    op.create_index("ix_sound_event_change_new_tag_id", "sound_event_change", ["new_tag_id"])


def downgrade() -> None:
    op.drop_table("sound_event_change")
    op.drop_table("sound_event_original_tag")
    op.drop_table("sound_event_original")

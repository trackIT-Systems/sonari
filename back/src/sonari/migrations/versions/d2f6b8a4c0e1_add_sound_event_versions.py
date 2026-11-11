"""Keep old states of edited sound events as versions in sound_event_annotation.

Before an edit changes or deletes a sound event, its row, tags and features are copied
into a new row: a version, with ``superseded_on`` set. Live events have it NULL; the ORM
hides versions from ordinary queries (sonari.models.sound_event_versions).

New nullable columns, all NULL on existing rows:

- ``edit_id``: edit session that produced the state.
- ``version_of_id``: on versions, the live event's id (no foreign key: versions outlive it).
- ``superseded_on``, ``superseded_by_id``, ``superseded_edit_id``: when, by whom and in
  which session the state was replaced.
- ``version_reason``: edited, deleted or guano.

On Postgres only columns are added (no table rewrite). On SQLite the table is rebuilt
once with AUTOINCREMENT, so event ids are never reused.

Revision ID: d2f6b8a4c0e1
Revises: a7c3e9d1f5b2
Create Date: 2026-11-05

"""

from typing import Sequence, Union

import fastapi_users_db_sqlalchemy.generics
import sqlalchemy as sa
from alembic import op

revision: str = "d2f6b8a4c0e1"
down_revision: Union[str, None] = "a7c3e9d1f5b2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_FK = "fk_sound_event_annotation_superseded_by_id_user"
_INDEX = "ix_sound_event_annotation_version_of_id"


def _columns() -> list[sa.Column]:
    guid = fastapi_users_db_sqlalchemy.generics.GUID
    return [
        sa.Column("edit_id", guid(), nullable=True),
        sa.Column("version_of_id", sa.Integer(), nullable=True),
        # Same type as created_on, so the two compare without time zone surprises.
        sa.Column("superseded_on", sa.DateTime(), nullable=True),
        sa.Column("superseded_by_id", guid(), nullable=True),
        sa.Column("superseded_edit_id", guid(), nullable=True),
        sa.Column("version_reason", sa.String(), nullable=True),
    ]


def upgrade() -> None:
    if op.get_bind().dialect.name == "sqlite":
        with op.batch_alter_table(
            "sound_event_annotation",
            recreate="always",
            table_kwargs={"sqlite_autoincrement": True},
        ) as batch:
            for column in _columns():
                batch.add_column(column)
            batch.create_foreign_key(_FK, "user", ["superseded_by_id"], ["id"], ondelete="SET NULL")
            batch.create_index(_INDEX, ["version_of_id"])
        return

    for column in _columns():
        op.add_column("sound_event_annotation", column)
    op.create_foreign_key(_FK, "sound_event_annotation", "user", ["superseded_by_id"], ["id"], ondelete="SET NULL")
    op.create_index(_INDEX, "sound_event_annotation", ["version_of_id"])


def downgrade() -> None:
    versions = "SELECT id FROM sound_event_annotation WHERE superseded_on IS NOT NULL"
    op.execute(f"DELETE FROM sound_event_annotation_tag WHERE sound_event_annotation_id IN ({versions})")
    op.execute(f"DELETE FROM sound_event_annotation_feature WHERE sound_event_annotation_id IN ({versions})")
    op.execute("DELETE FROM sound_event_annotation WHERE superseded_on IS NOT NULL")

    if op.get_bind().dialect.name == "sqlite":
        with op.batch_alter_table("sound_event_annotation") as batch:
            batch.drop_index(_INDEX)
            batch.drop_constraint(_FK, type_="foreignkey")
            for column in reversed(_columns()):
                batch.drop_column(column.name)
        return

    op.drop_index(_INDEX, table_name="sound_event_annotation")
    op.drop_constraint(_FK, "sound_event_annotation", type_="foreignkey")
    for column in reversed(_columns()):
        op.drop_column("sound_event_annotation", column.name)

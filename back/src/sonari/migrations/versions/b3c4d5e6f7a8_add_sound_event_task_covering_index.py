"""Add a covering index of sound events by task.

Tag filters on annotation tasks look up the ids of a task's sound events and
join them to their tags. The (annotation_task_id, created_by_id) index finds
the rows but not their ids, so every lookup also reads the table; with tens of
millions of sound events the planner then prefers a full scan. This index
carries the id, so the lookup is an index-only scan.

On PostgreSQL the index is built CONCURRENTLY, so writes to sound events are
not blocked while it builds.

Revision ID: b3c4d5e6f7a8
Revises: 88136d95c6a2
Create Date: 2026-11-23

"""

from typing import Sequence, Union

from alembic import op

revision: str = "b3c4d5e6f7a8"
down_revision: Union[str, None] = "88136d95c6a2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

INDEX_NAME = "ix_sound_event_annotation_task_id_id"


def _is_postgresql() -> bool:
    return op.get_bind().dialect.name == "postgresql"


def upgrade() -> None:
    if _is_postgresql():
        # CREATE INDEX CONCURRENTLY cannot run inside a transaction.
        with op.get_context().autocommit_block():
            op.execute(
                f"CREATE INDEX CONCURRENTLY IF NOT EXISTS {INDEX_NAME} "
                "ON sound_event_annotation (annotation_task_id) INCLUDE (id)"
            )
    else:
        # SQLite: id is the rowid, which every index already carries.
        op.create_index(INDEX_NAME, "sound_event_annotation", ["annotation_task_id"], unique=False)


def downgrade() -> None:
    if _is_postgresql():
        with op.get_context().autocommit_block():
            op.execute(f"DROP INDEX CONCURRENTLY IF EXISTS {INDEX_NAME}")
    else:
        op.drop_index(INDEX_NAME, table_name="sound_event_annotation")

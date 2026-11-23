"""Add a covering index of the live sound events by task.

Tag filters on annotation tasks look up the ids of a task's sound events and
join them to their tags. The (annotation_task_id, created_by_id) index finds
the rows but not their ids, so every lookup also reads the table; with tens of
millions of sound events the planner then prefers a full scan. This index
carries the id, and holds only live events (superseded_on IS NULL, which every
ORM query on sound events adds), so the lookup is an index-only scan.

On PostgreSQL the index is built CONCURRENTLY, so writes to sound events are
not blocked while it builds.

Revision ID: b3c4d5e6f7a8
Revises: 88136d95c6a2
Create Date: 2026-11-23

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b3c4d5e6f7a8"
down_revision: Union[str, None] = "88136d95c6a2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

INDEX_NAME = "ix_sound_event_annotation_task_id_id"
LIVE = "superseded_on IS NULL"


def _is_postgresql() -> bool:
    return op.get_bind().dialect.name == "postgresql"


def upgrade() -> None:
    if _is_postgresql():
        # CREATE INDEX CONCURRENTLY cannot run inside a transaction.
        with op.get_context().autocommit_block():
            # Drop an index of this name that IF NOT EXISTS would keep although it
            # is unusable: invalid (an interrupted concurrent build) or not partial
            # (an earlier version of this migration, which still read the table).
            op.execute(
                "DO $$ BEGIN "
                "IF EXISTS (SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid "
                f"WHERE c.relname = '{INDEX_NAME}' AND (NOT i.indisvalid OR i.indpred IS NULL)) "
                f"THEN DROP INDEX {INDEX_NAME}; END IF; END $$"
            )
            op.execute(
                f"CREATE INDEX CONCURRENTLY IF NOT EXISTS {INDEX_NAME} "
                f"ON sound_event_annotation (annotation_task_id) INCLUDE (id) WHERE {LIVE}"
            )
    else:
        # SQLite: id is the rowid, which every index already carries.
        op.create_index(
            INDEX_NAME,
            "sound_event_annotation",
            ["annotation_task_id"],
            unique=False,
            sqlite_where=sa.text(LIVE),
        )


def downgrade() -> None:
    if _is_postgresql():
        with op.get_context().autocommit_block():
            op.execute(f"DROP INDEX CONCURRENTLY IF EXISTS {INDEX_NAME}")
    else:
        op.drop_index(INDEX_NAME, table_name="sound_event_annotation")

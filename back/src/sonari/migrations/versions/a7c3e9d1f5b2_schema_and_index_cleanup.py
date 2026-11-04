"""Recording time and task duration as columns, drop redundant indexes.

- ``recording.recorded_at``: date + time (midnight without a time), indexed with the id.
  Replaces the (date, time) index.
- ``annotation_task.duration``: end_time - start_time. Replaces the ``duration`` rows in
  ``annotation_task_feature``, which are deleted. The table itself stays until ecohub runs
  on a Sonari version that no longer writes to it.
- Drops indexes that duplicate another index or are covered by a primary key, unique
  constraint or longer index. Index names differ between instances (renamed tables), so
  on Postgres they are found by their columns.
- Adds (annotation_task_id, created_by_id) on sound_event_annotation for ecohub's
  re-import delete. It replaces the index on annotation_task_id alone.
- Adds a trigram index for recording path search, if pg_trgm can be installed.
- Lets autovacuum run earlier on the large tables.

Revision ID: a7c3e9d1f5b2
Revises: e1f2a3b4c5d6
Create Date: 2026-11-04

"""

import logging
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a7c3e9d1f5b2"
down_revision: Union[str, None] = "e1f2a3b4c5d6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

logger = logging.getLogger(__name__)

# (table, columns): plain indexes on exactly these columns are dropped.
_COVERED_INDEXES = [
    ("annotation_task_tag", ["annotation_task_id"]),  # unique (annotation_task_id, tag_id, created_by_id)
    ("sound_event_annotation_tag", ["sound_event_annotation_id"]),  # unique (sea_id, tag_id, created_by_id)
    ("sound_event_annotation_tag", ["tag_id"]),  # ix (tag_id, sound_event_annotation_id)
    ("sound_event_annotation_feature", ["sound_event_annotation_id"]),  # primary key (sea_id, name)
    ("recording_feature", ["recording_id"]),  # primary key (recording_id, name)
    ("annotation_task", ["annotation_project_id"]),  # unique (project_id, recording_id, start, end)
    ("annotation_status_badge", ["annotation_task_id"]),  # unique (task_id, user_id, state)
    ("dataset_recording", ["dataset_id"]),  # primary key (dataset_id, recording_id)
    ("recording", ["date", "time"]),  # ix_recording_recorded_at
    ("sound_event_annotation", ["annotation_task_id"]),  # ix (annotation_task_id, created_by_id)
]

# (table, columns, name to keep): duplicates left over from table renames.
_DUPLICATE_INDEXES = [
    ("annotation_task_tag", ["tag_id"], "ix_annotation_task_tag_tag_id"),
    ("annotation_task_tag", ["created_by_id"], "ix_annotation_task_tag_created_by_id"),
]

_AUTOVACUUM_TABLES = [
    "sound_event_annotation",
    "sound_event_annotation_tag",
    "sound_event_annotation_feature",
    "annotation_task",
]


def _convention_name(table: str, columns: list[str]) -> str:
    """Index name from the models' naming convention (first column only)."""
    return f"ix_{table}_{columns[0]}"


def _plain_indexes(conn, table: str, columns: list[str]) -> list[str]:
    """Names of non-unique, non-partial btree indexes on exactly these columns, in order."""
    rows = conn.execute(
        sa.text(
            """
            SELECT i.relname
            FROM pg_index x
            JOIN pg_class i ON i.oid = x.indexrelid
            JOIN pg_class t ON t.oid = x.indrelid
            JOIN pg_namespace n ON n.oid = t.relnamespace
            JOIN pg_am am ON am.oid = i.relam
            WHERE n.nspname = current_schema()
              AND t.relname = :table
              AND am.amname = 'btree'
              AND NOT x.indisunique
              AND NOT x.indisprimary
              AND x.indpred IS NULL
              AND x.indexprs IS NULL
              AND ARRAY(
                    SELECT a.attname::text
                    FROM unnest(x.indkey) WITH ORDINALITY AS k(attnum, ord)
                    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
                    ORDER BY k.ord
                  ) = CAST(:columns AS text[])
            ORDER BY i.relname
            """
        ),
        {"table": table, "columns": columns},
    )
    return [row[0] for row in rows]


def _drop_index(name: str) -> None:
    op.execute(sa.text(f'DROP INDEX IF EXISTS "{name}"'))


def _can_use_pg_trgm(conn) -> bool:
    installed = conn.execute(sa.text("SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm'")).first()
    if installed:
        return True
    available = conn.execute(sa.text("SELECT 1 FROM pg_available_extensions WHERE name = 'pg_trgm'")).first()
    # pg_trgm is a trusted extension: the database owner can install it without superuser.
    allowed = conn.execute(
        sa.text(
            "SELECT rolsuper OR has_database_privilege(current_database(), 'CREATE') "
            "FROM pg_roles WHERE rolname = current_user"
        )
    ).scalar()
    return bool(available and allowed)


def _upgrade_postgresql(conn) -> None:
    op.execute(
        "ALTER TABLE recording ADD COLUMN recorded_at timestamp "
        """GENERATED ALWAYS AS (date + coalesce("time", '00:00'::time)) STORED"""
    )
    op.create_index("ix_recording_recorded_at", "recording", ["recorded_at", "id"])

    op.execute(
        "ALTER TABLE annotation_task ADD COLUMN duration double precision "
        "GENERATED ALWAYS AS (end_time - start_time) STORED"
    )
    op.execute("DELETE FROM annotation_task_feature")

    op.create_index(
        "ix_sound_event_annotation_task_id_created_by_id",
        "sound_event_annotation",
        ["annotation_task_id", "created_by_id"],
    )

    for table, columns in _COVERED_INDEXES:
        for name in _plain_indexes(conn, table, columns):
            _drop_index(name)

    for table, columns, keep in _DUPLICATE_INDEXES:
        names = _plain_indexes(conn, table, columns)
        if keep not in names:
            keep = names[0] if names else keep
        for name in names:
            if name != keep:
                _drop_index(name)

    if _can_use_pg_trgm(conn):
        op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
        op.create_index(
            "ix_recording_path_trgm",
            "recording",
            ["path"],
            postgresql_using="gin",
            postgresql_ops={"path": "gin_trgm_ops"},
        )
    else:
        logger.warning("pg_trgm is not available; recording path search stays without a trigram index.")

    for table in _AUTOVACUUM_TABLES:
        op.execute(
            f"ALTER TABLE {table} SET (autovacuum_vacuum_scale_factor = 0.01, autovacuum_analyze_scale_factor = 0.005)"
        )


def _upgrade_sqlite() -> None:
    # SQLite can't add stored generated columns to an existing table; virtual ones can be indexed.
    # The text matches SQLAlchemy's date, time and datetime storage formats, so comparisons
    # with bound datetimes work.
    op.execute(
        "ALTER TABLE recording ADD COLUMN recorded_at DATETIME "
        "GENERATED ALWAYS AS (date || ' ' || coalesce(time, '00:00:00.000000')) VIRTUAL"
    )
    op.create_index("ix_recording_recorded_at", "recording", ["recorded_at", "id"])

    op.execute(
        "ALTER TABLE annotation_task ADD COLUMN duration FLOAT GENERATED ALWAYS AS (end_time - start_time) VIRTUAL"
    )
    op.execute("DELETE FROM annotation_task_feature")

    op.create_index(
        "ix_sound_event_annotation_task_id_created_by_id",
        "sound_event_annotation",
        ["annotation_task_id", "created_by_id"],
    )

    for table, columns in _COVERED_INDEXES:
        if columns == ["date", "time"]:
            _drop_index("ix_recording_date_time")
        else:
            _drop_index(_convention_name(table, columns))
    # The duplicates from table renames exist only on old Postgres instances.


def upgrade() -> None:
    conn = op.get_bind()
    if conn.dialect.name == "postgresql":
        _upgrade_postgresql(conn)
    else:
        _upgrade_sqlite()


def downgrade() -> None:
    conn = op.get_bind()
    is_postgresql = conn.dialect.name == "postgresql"

    if is_postgresql:
        for table in _AUTOVACUUM_TABLES:
            op.execute(f"ALTER TABLE {table} RESET (autovacuum_vacuum_scale_factor, autovacuum_analyze_scale_factor)")
        _drop_index("ix_recording_path_trgm")

    for table, columns in _COVERED_INDEXES:
        if columns == ["date", "time"]:
            op.create_index("ix_recording_date_time", "recording", ["date", "time"])
        else:
            op.create_index(_convention_name(table, columns), table, columns)
    op.drop_index("ix_sound_event_annotation_task_id_created_by_id", table_name="sound_event_annotation")

    op.execute(
        "INSERT INTO annotation_task_feature (annotation_task_id, name, value, created_on) "
        "SELECT id, 'duration', end_time - start_time, CURRENT_TIMESTAMP FROM annotation_task "
        "WHERE id NOT IN (SELECT annotation_task_id FROM annotation_task_feature WHERE name = 'duration')"
    )
    op.execute("ALTER TABLE annotation_task DROP COLUMN duration")

    op.drop_index("ix_recording_recorded_at", table_name="recording")
    op.execute("ALTER TABLE recording DROP COLUMN recorded_at")

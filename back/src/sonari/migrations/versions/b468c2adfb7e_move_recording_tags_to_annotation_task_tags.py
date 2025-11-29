"""move_recording_tags_to_annotation_task_tags.

Revision ID: b468c2adfb7e
Revises: 5a5ba50701f7
Create Date: 2025-11-26 10:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b468c2adfb7e"
down_revision: Union[str, None] = "5a5ba50701f7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Move all recording tags to annotation task tags.

    For each recording_tag, creates annotation_task_tag entries for all
    annotation_tasks associated with that recording.

    This allows tags to be more granular (per-task) rather than per-recording.
    """
    # Get database dialect for conditional logic
    bind = op.get_bind()
    dialect = bind.dialect.name
    print(f"Running migration on {dialect} database...", flush=True)

    print("Moving recording tags to annotation task tags...", flush=True)

    # Count existing recording tags
    result = bind.execute(sa.text("SELECT COUNT(*) FROM recording_tag"))
    recording_tag_count = result.scalar()
    print(f"  Found {recording_tag_count} recording tags to migrate", flush=True)

    # Count how many annotation_task_tags will be created
    result = bind.execute(
        sa.text("""
        SELECT COUNT(*)
        FROM recording_tag rt
        JOIN annotation_task at ON rt.recording_id = at.recording_id
        LEFT JOIN annotation_task_tag att ON (
            att.annotation_task_id = at.id 
            AND att.tag_id = rt.tag_id
            AND (att.created_by_id = rt.created_by_id OR (att.created_by_id IS NULL AND rt.created_by_id IS NULL))
        )
        WHERE att.id IS NULL
    """)
    )
    new_tags_count = result.scalar()
    print(f"  Will create {new_tags_count} annotation_task_tag entries", flush=True)

    # Insert annotation_task_tags for each recording_tag × annotation_task combination
    # Skip if the annotation_task_tag already exists (same task, tag, and creator)
    if dialect == "sqlite":
        # SQLite doesn't support RETURNING, so we can't get the new IDs easily
        # Just insert with NULL id and let SQLite auto-increment
        op.execute("""
            INSERT INTO annotation_task_tag (annotation_task_id, tag_id, created_by_id, created_on)
            SELECT 
                at.id as annotation_task_id,
                rt.tag_id,
                rt.created_by_id,
                CURRENT_TIMESTAMP
            FROM recording_tag rt
            JOIN annotation_task at ON rt.recording_id = at.recording_id
            WHERE NOT EXISTS (
                SELECT 1 FROM annotation_task_tag att
                WHERE att.annotation_task_id = at.id
                  AND att.tag_id = rt.tag_id
                  AND (att.created_by_id = rt.created_by_id OR (att.created_by_id IS NULL AND rt.created_by_id IS NULL))
            )
        """)
    else:
        # PostgreSQL: Same approach but can use more efficient syntax
        op.execute("""
            INSERT INTO annotation_task_tag (annotation_task_id, tag_id, created_by_id, created_on)
            SELECT 
                at.id as annotation_task_id,
                rt.tag_id,
                rt.created_by_id,
                CURRENT_TIMESTAMP
            FROM recording_tag rt
            JOIN annotation_task at ON rt.recording_id = at.recording_id
            WHERE NOT EXISTS (
                SELECT 1 FROM annotation_task_tag att
                WHERE att.annotation_task_id = at.id
                  AND att.tag_id = rt.tag_id
                  AND (att.created_by_id = rt.created_by_id OR (att.created_by_id IS NULL AND rt.created_by_id IS NULL))
            )
            ON CONFLICT DO NOTHING
        """)

    # Count results
    result = bind.execute(sa.text("SELECT COUNT(*) FROM annotation_task_tag"))
    total_task_tags = result.scalar()
    print("  Successfully created annotation_task_tag entries", flush=True)
    print(f"  Total annotation_task_tags now: {total_task_tags}", flush=True)

    # Now drop the recording_tag table
    print("Dropping recording_tag table...", flush=True)
    op.drop_table("recording_tag")

    print("Migration complete!", flush=True)
    print("✓  All recording tags have been moved to annotation task tags")
    print("⚠️  WARNING: recording_tag table has been dropped")


def downgrade() -> None:
    """Recreate recording_tag table and attempt to recover data.

    WARNING: This is lossy! Multiple annotation_task_tags from the same recording
    will be deduplicated back into single recording_tags.
    """
    # Get database dialect
    bind = op.get_bind()
    dialect = bind.dialect.name
    print(f"Running downgrade on {dialect} database...", flush=True)

    print("Recreating recording_tag table...", flush=True)

    # Recreate recording_tag table with its original structure
    op.create_table(
        "recording_tag",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("recording_id", sa.Integer(), nullable=False),
        sa.Column("tag_id", sa.Integer(), nullable=False),
        sa.Column("created_by_id", sa.LargeBinary(), nullable=True),  # GUID type
        sa.Column("created_on", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["recording_id"],
            ["recording.id"],
            name=op.f("fk_recording_tag_recording_id_recording"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["tag_id"],
            ["tag.id"],
            name=op.f("fk_recording_tag_tag_id_tag"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_id"],
            ["user.id"],
            name=op.f("fk_recording_tag_created_by_id_user"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_recording_tag")),
        sa.UniqueConstraint("recording_id", "tag_id", "created_by_id", name=op.f("uq_recording_tag_recording_id")),
    )

    with op.batch_alter_table("recording_tag", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_recording_tag_recording_id"), ["recording_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_recording_tag_tag_id"), ["tag_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_recording_tag_created_by_id"), ["created_by_id"], unique=False)

    print("Migrating annotation_task_tags back to recording_tags...", flush=True)
    print("⚠️  WARNING: Deduplicating tags - multiple task tags per recording will become one recording tag", flush=True)

    # Migrate annotation_task_tags back to recording_tags
    # Use DISTINCT to deduplicate when multiple tasks have the same tag
    if dialect == "sqlite":
        op.execute("""
            INSERT INTO recording_tag (recording_id, tag_id, created_by_id, created_on)
            SELECT DISTINCT
                at.recording_id,
                att.tag_id,
                att.created_by_id,
                MIN(att.created_on) as created_on
            FROM annotation_task_tag att
            JOIN annotation_task at ON att.annotation_task_id = at.id
            GROUP BY at.recording_id, att.tag_id, att.created_by_id
        """)
    else:
        op.execute("""
            INSERT INTO recording_tag (recording_id, tag_id, created_by_id, created_on)
            SELECT DISTINCT ON (at.recording_id, att.tag_id, att.created_by_id)
                at.recording_id,
                att.tag_id,
                att.created_by_id,
                att.created_on
            FROM annotation_task_tag att
            JOIN annotation_task at ON att.annotation_task_id = at.id
            ORDER BY at.recording_id, att.tag_id, att.created_by_id, att.created_on
            ON CONFLICT DO NOTHING
        """)

    result = bind.execute(sa.text("SELECT COUNT(*) FROM recording_tag"))
    recording_tag_count = result.scalar()
    print(f"  Recreated {recording_tag_count} recording tags", flush=True)

    print("Downgrade complete!", flush=True)
    print("⚠️  Data loss may have occurred due to deduplication")

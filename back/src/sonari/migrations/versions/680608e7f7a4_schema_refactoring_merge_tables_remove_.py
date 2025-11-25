"""schema_refactoring_merge_tables_remove_uuids.

Revision ID: 680608e7f7a4
Revises: c3e86f9738ac
Create Date: 2025-10-28 13:54:48.761173
"""

from typing import Sequence, Union

import fastapi_users_db_sqlalchemy.generics
import sqlalchemy as sa
from alembic import op

import sonari.models.base

# revision identifiers, used by Alembic.
revision: str = "680608e7f7a4"
down_revision: Union[str, None] = "c3e86f9738ac"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Major schema refactoring migration.

    Changes:
    - Clean up orphaned clip_annotations that have no annotation_task (deletes associated sound_event_annotations)
    - Merge clip, clip_annotation, and annotation_task into single annotation_task table
    - Merge sound_event and sound_event_annotation into single sound_event_annotation table
    - Denormalize features (remove feature_name lookup table)
    - Simplify notes (only attach to annotation_tasks)
    - Remove UUID columns from recording, annotation_project, dataset
    - Update tag tables to track creators

    See DATABASE_MIGRATION_GUIDE.md for complete documentation.

    Compatible with both SQLite and PostgreSQL.
    """
    # Get database dialect for conditional logic
    bind = op.get_bind()
    dialect = bind.dialect.name
    print(f"Running migration on {dialect} database...",flush=True)

    # ==========================================================================
    # PHASE 1: ADD NEW COLUMNS TO EXISTING TABLES
    # ==========================================================================

    print("Phase 1: Adding new columns to existing tables...",flush=True)

    # Add new columns to annotation_task (will be populated from clip data)
    with op.batch_alter_table("annotation_task", schema=None) as batch_op:
        batch_op.add_column(sa.Column("recording_id", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("start_time", sa.Float(), nullable=True))
        batch_op.add_column(sa.Column("end_time", sa.Float(), nullable=True))

    # Add new columns to sound_event_annotation (will be populated from sound_event)
    with op.batch_alter_table("sound_event_annotation", schema=None) as batch_op:
        batch_op.add_column(sa.Column("annotation_task_id", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("recording_id", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("geometry_type", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("geometry", sonari.models.base.GeometryType(), nullable=True))

    # Add created_by_id to tag table
    with op.batch_alter_table("tag", schema=None) as batch_op:
        batch_op.add_column(sa.Column("created_by_id", fastapi_users_db_sqlalchemy.generics.GUID(), nullable=True))
        batch_op.create_index(batch_op.f("ix_tag_created_by_id"), ["created_by_id"], unique=False)
        batch_op.create_foreign_key(
            batch_op.f("fk_tag_created_by_id_user"),
            "user",
            ["created_by_id"],
            ["id"],
        )

    # Add created_by_id to recording_tag (change from just having recording_id, tag_id)
    with op.batch_alter_table("recording_tag", schema=None) as batch_op:
        batch_op.add_column(sa.Column("id", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("created_by_id", fastapi_users_db_sqlalchemy.generics.GUID(), nullable=True))

    # Populate the id column for recording_tag (dialect-aware)
    if dialect == "sqlite":
        # SQLite: use rowid
        op.execute("UPDATE recording_tag SET id = rowid WHERE id IS NULL")
    else:
        # PostgreSQL: use row_number() window function
        op.execute("""
            UPDATE recording_tag
            SET id = subquery.row_num
            FROM (
                SELECT recording_id, tag_id, ROW_NUMBER() OVER (ORDER BY recording_id, tag_id) as row_num
                FROM recording_tag
            ) AS subquery
            WHERE recording_tag.recording_id = subquery.recording_id 
              AND recording_tag.tag_id = subquery.tag_id
              AND recording_tag.id IS NULL
        """)

    with op.batch_alter_table("recording_tag", schema=None) as batch_op:
        batch_op.alter_column("id", nullable=False)
        # Drop old composite primary key and create new one on id
        batch_op.drop_constraint("pk_recording_tag", type_="primary")
        batch_op.create_primary_key("pk_recording_tag", ["id"])
        batch_op.create_index(batch_op.f("ix_recording_tag_created_by_id"), ["created_by_id"], unique=False)
        batch_op.create_foreign_key(
            batch_op.f("fk_recording_tag_created_by_id_user"),
            "user",
            ["created_by_id"],
            ["id"],
        )

    # Add annotation_task_id to note table
    with op.batch_alter_table("note", schema=None) as batch_op:
        batch_op.add_column(sa.Column("annotation_task_id", sa.Integer(), nullable=True))

    # ==========================================================================
    # PHASE 1.5: CLEAN UP ORPHANED DATA
    # ==========================================================================

    print("Phase 1.5: Cleaning up orphaned clip_annotations...",flush=True)

    # Count orphaned data before deletion
    bind = op.get_bind()
    result = bind.execute(
        sa.text("""
        SELECT COUNT(*) 
        FROM clip_annotation ca
        LEFT JOIN annotation_task at ON at.clip_annotation_id = ca.id
        WHERE at.id IS NULL
    """)
    )
    orphaned_clip_annotations = result.scalar()

    result = bind.execute(
        sa.text("""
        SELECT COUNT(*) 
        FROM sound_event_annotation sea
        WHERE EXISTS (
            SELECT 1 FROM clip_annotation ca
            LEFT JOIN annotation_task at ON at.clip_annotation_id = ca.id
            WHERE ca.id = sea.clip_annotation_id AND at.id IS NULL
        )
    """)
    )
    orphaned_sound_events = result.scalar()

    print(f"  Found {orphaned_clip_annotations} orphaned clip_annotations",flush=True)
    print(f"  Found {orphaned_sound_events} sound_event_annotations that will be deleted",flush=True)

    # Delete clip_annotations that have no annotation_task
    # This will CASCADE delete their sound_event_annotations
    op.execute("""
        DELETE FROM clip_annotation
        WHERE NOT EXISTS (
            SELECT 1 FROM annotation_task 
            WHERE annotation_task.clip_annotation_id = clip_annotation.id
        )
    """)

    # Log remaining counts
    result = bind.execute(sa.text("SELECT COUNT(*) FROM clip_annotation"))
    remaining_clip_annotations = result.scalar()
    result = bind.execute(sa.text("SELECT COUNT(*) FROM sound_event_annotation"))
    remaining_sound_events = result.scalar()

    print(f"  Deleted {orphaned_clip_annotations} orphaned clip_annotations",flush=True)
    print(f"  Deleted {orphaned_sound_events} orphaned sound_event_annotations",flush=True)
    print(
        f"  Remaining: {remaining_clip_annotations} clip_annotations, {remaining_sound_events} sound_event_annotations",flush=True
    )

    # ==========================================================================
    # PHASE 2: MIGRATE DATA FROM OLD STRUCTURE TO NEW
    # ==========================================================================

    print("Phase 2: Migrating data to new structure...",flush=True)

    # 2.1: Populate annotation_task fields from clip via clip_annotation
    print("  - Migrating clip data into annotation_task...",flush=True)
    if dialect == "sqlite":
        # SQLite: use subqueries (works in all versions)
        op.execute("""
            UPDATE annotation_task
            SET recording_id = (
                    SELECT clip.recording_id
                    FROM clip_annotation
                    JOIN clip ON clip_annotation.clip_id = clip.id
                    WHERE annotation_task.clip_annotation_id = clip_annotation.id
                ),
                start_time = (
                    SELECT clip.start_time
                    FROM clip_annotation
                    JOIN clip ON clip_annotation.clip_id = clip.id
                    WHERE annotation_task.clip_annotation_id = clip_annotation.id
                ),
                end_time = (
                    SELECT clip.end_time
                    FROM clip_annotation
                    JOIN clip ON clip_annotation.clip_id = clip.id
                    WHERE annotation_task.clip_annotation_id = clip_annotation.id
                )
        """)
    else:
        # PostgreSQL: use UPDATE...FROM
        op.execute("""
            UPDATE annotation_task
            SET recording_id = clip.recording_id,
                start_time = clip.start_time,
                end_time = clip.end_time
            FROM clip_annotation
            JOIN clip ON clip_annotation.clip_id = clip.id
            WHERE annotation_task.clip_annotation_id = clip_annotation.id
        """)

    # 2.2: Populate sound_event_annotation.annotation_task_id from clip_annotation
    print("  - Linking sound_event_annotations to annotation_tasks...",flush=True)
    if dialect == "sqlite":
        op.execute("""
            UPDATE sound_event_annotation
            SET annotation_task_id = (
                SELECT annotation_task.id
                FROM annotation_task
                WHERE sound_event_annotation.clip_annotation_id = annotation_task.clip_annotation_id
            )
        """)
    else:
        op.execute("""
            UPDATE sound_event_annotation
            SET annotation_task_id = annotation_task.id
            FROM annotation_task
            WHERE sound_event_annotation.clip_annotation_id = annotation_task.clip_annotation_id
        """)

    # 2.3: Populate sound_event_annotation geometry fields from sound_event
    print("  - Migrating sound_event geometry into sound_event_annotation...",flush=True)
    if dialect == "sqlite":
        op.execute("""
            UPDATE sound_event_annotation
            SET geometry_type = (
                    SELECT sound_event.geometry_type
                    FROM sound_event
                    WHERE sound_event_annotation.sound_event_id = sound_event.id
                ),
                geometry = (
                    SELECT sound_event.geometry
                    FROM sound_event
                    WHERE sound_event_annotation.sound_event_id = sound_event.id
                ),
                recording_id = (
                    SELECT sound_event.recording_id
                    FROM sound_event
                    WHERE sound_event_annotation.sound_event_id = sound_event.id
                )
        """)
    else:
        op.execute("""
            UPDATE sound_event_annotation
            SET geometry_type = sound_event.geometry_type,
                geometry = sound_event.geometry,
                recording_id = sound_event.recording_id
            FROM sound_event
            WHERE sound_event_annotation.sound_event_id = sound_event.id
        """)

    # 2.4: Migrate notes from clip_annotation_note to note.annotation_task_id
    print("  - Migrating clip_annotation notes to annotation_tasks...",flush=True)
    if dialect == "sqlite":
        op.execute("""
            UPDATE note
            SET annotation_task_id = (
                SELECT annotation_task.id
                FROM clip_annotation_note
                JOIN annotation_task ON annotation_task.clip_annotation_id = clip_annotation_note.clip_annotation_id
                WHERE note.id = clip_annotation_note.note_id
            )
        """)
    else:
        op.execute("""
            UPDATE note
            SET annotation_task_id = annotation_task.id
            FROM clip_annotation_note
            JOIN annotation_task ON annotation_task.clip_annotation_id = clip_annotation_note.clip_annotation_id
            WHERE note.id = clip_annotation_note.note_id
        """)

    # ==========================================================================
    # PHASE 3: CREATE NEW DENORMALIZED FEATURE TABLES
    # ==========================================================================

    print("Phase 3: Creating denormalized feature tables...",flush=True)

    # 3.1: Create new annotation_task_feature table (denormalized with name inline)
    op.create_table(
        "annotation_task_feature_new",
        sa.Column("annotation_task_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("value", sa.Float(), nullable=False),
        sa.Column("created_on", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["annotation_task_id"],
            ["annotation_task.id"],
            name=op.f("fk_annotation_task_feature_new_annotation_task_id_annotation_task"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("annotation_task_id", "name", name=op.f("pk_annotation_task_feature_new")),
        sa.UniqueConstraint(
            "annotation_task_id", "name", name=op.f("uq_annotation_task_feature_new_annotation_task_id")
        ),
    )

    with op.batch_alter_table("annotation_task_feature_new", schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f("ix_annotation_task_feature_new_annotation_task_id"),
            ["annotation_task_id"],
            unique=False,
        )

    # 3.2: Migrate clip_feature data to annotation_task_feature_new (denormalize feature names)
    print("  - Migrating clip features to annotation_task features...",flush=True)
    op.execute("""
        INSERT INTO annotation_task_feature_new (annotation_task_id, name, value, created_on)
        SELECT 
            annotation_task.id,
            feature_name.name,
            clip_feature.value,
            clip_feature.created_on
        FROM clip_feature
        JOIN feature_name ON clip_feature.feature_name_id = feature_name.id
        JOIN clip ON clip_feature.clip_id = clip.id
        JOIN clip_annotation ON clip_annotation.clip_id = clip.id
        JOIN annotation_task ON annotation_task.clip_annotation_id = clip_annotation.id
    """)

    # 3.3: Create new sound_event_annotation_feature table (denormalized)
    op.create_table(
        "sound_event_annotation_feature_new",
        sa.Column("sound_event_annotation_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("value", sa.Float(), nullable=False),
        sa.Column("created_on", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["sound_event_annotation_id"],
            ["sound_event_annotation.id"],
            name=op.f("fk_sound_event_annotation_feature_new_sound_event_annotation_id_sound_event_annotation"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint(
            "sound_event_annotation_id",
            "name",
            name=op.f("pk_sound_event_annotation_feature_new"),
        ),
        sa.UniqueConstraint(
            "sound_event_annotation_id",
            "name",
            name=op.f("uq_sound_event_annotation_feature_new_sound_event_annotation_id"),
        ),
    )

    with op.batch_alter_table("sound_event_annotation_feature_new", schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f("ix_sound_event_annotation_feature_new_sound_event_annotation_id"),
            ["sound_event_annotation_id"],
            unique=False,
        )

    # 3.4: Migrate sound_event_feature data (denormalize feature names)
    print("  - Migrating sound_event features to sound_event_annotation features...",flush=True)
    op.execute("""
        INSERT INTO sound_event_annotation_feature_new (sound_event_annotation_id, name, value, created_on)
        SELECT 
            sound_event_annotation.id,
            feature_name.name,
            sound_event_feature.value,
            sound_event_feature.created_on
        FROM sound_event_feature
        JOIN feature_name ON sound_event_feature.feature_name_id = feature_name.id
        JOIN sound_event_annotation ON sound_event_annotation.sound_event_id = sound_event_feature.sound_event_id
    """)

    # 3.5: Create new recording_feature table (denormalized)
    op.create_table(
        "recording_feature_new",
        sa.Column("recording_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("value", sa.Float(), nullable=False),
        sa.Column("created_on", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["recording_id"],
            ["recording.id"],
            name=op.f("fk_recording_feature_new_recording_id_recording"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("recording_id", "name", name=op.f("pk_recording_feature_new")),
        sa.UniqueConstraint("recording_id", "name", name=op.f("uq_recording_feature_new_recording_id")),
    )

    with op.batch_alter_table("recording_feature_new", schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f("ix_recording_feature_new_recording_id"),
            ["recording_id"],
            unique=False,
        )

    # 3.6: Migrate recording_feature data (denormalize feature names)
    print("  - Migrating recording features...",flush=True)
    op.execute("""
        INSERT INTO recording_feature_new (recording_id, name, value, created_on)
        SELECT 
            recording_feature.recording_id,
            feature_name.name,
            recording_feature.value,
            recording_feature.created_on
        FROM recording_feature
        JOIN feature_name ON recording_feature.feature_name_id = feature_name.id
    """)

    # ==========================================================================
    # PHASE 4: DROP FOREIGN KEY CONSTRAINTS TO TABLES WE'RE ABOUT TO DROP
    # ==========================================================================

    print("Phase 4: Dropping foreign key constraints to old tables...",flush=True)

    # Drop FK constraints from annotation_task to clip/clip_annotation
    with op.batch_alter_table("annotation_task", schema=None) as batch_op:
        batch_op.drop_constraint("fk_annotation_task_clip_annotation_id_clip_annotation", type_="foreignkey")
        batch_op.drop_constraint("fk_annotation_task_clip_id_clip", type_="foreignkey")
        batch_op.drop_index("ix_annotation_task_clip_annotation_id")
        batch_op.drop_index("ix_annotation_task_clip_id")

    # Drop FK constraints from sound_event_annotation to clip_annotation/sound_event
    with op.batch_alter_table("sound_event_annotation", schema=None) as batch_op:
        batch_op.drop_constraint("fk_sound_event_annotation_clip_annotation_id_clip_annotation", type_="foreignkey")
        batch_op.drop_constraint("fk_sound_event_annotation_sound_event_id_sound_event", type_="foreignkey")
        batch_op.drop_index("ix_sound_event_annotation_clip_annotation_id")
        batch_op.drop_index("ix_sound_event_annotation_sound_event_id")

    # Drop FK constraints from clip_annotation_tag to clip_annotation
    with op.batch_alter_table("clip_annotation_tag", schema=None) as batch_op:
        batch_op.drop_constraint("fk_clip_annotation_tag_clip_annotation_id_clip_annotation", type_="foreignkey")
        batch_op.drop_index("ix_clip_annotation_tag_clip_annotation_id")

    # ==========================================================================
    # PHASE 5: DROP OLD TABLES AND ASSOCIATION TABLES
    # ==========================================================================

    print("Phase 5: Dropping old tables...",flush=True)

    # Drop note association tables (recording_note and sound_event_annotation_note data is LOST)
    op.drop_table("sound_event_annotation_note")
    op.drop_table("recording_note")
    op.drop_table("clip_annotation_note")

    # Drop old feature tables
    op.drop_table("sound_event_feature")
    op.drop_table("clip_feature")
    op.drop_table("recording_feature")
    op.drop_table("feature_name")  # No longer needed after denormalization

    # Drop sound_event table (data migrated into sound_event_annotation)
    op.drop_table("sound_event")

    # Drop clip and clip_annotation tables (data migrated into annotation_task)
    op.drop_table("clip_annotation")
    op.drop_table("clip")

    # ==========================================================================
    # PHASE 6: RENAME NEW FEATURE TABLES TO FINAL NAMES
    # ==========================================================================

    print("Phase 6: Renaming tables...",flush=True)

    op.rename_table("annotation_task_feature_new", "annotation_task_feature")
    op.rename_table("sound_event_annotation_feature_new", "sound_event_annotation_feature")
    op.rename_table("recording_feature_new", "recording_feature")

    # Rename clip_annotation_tag to annotation_task_tag
    op.rename_table("clip_annotation_tag", "annotation_task_tag")

    # ==========================================================================
    # PHASE 6.5: UPDATE ANNOTATION_TASK_TAG TABLE (BEFORE dropping clip_annotation_id)
    # ==========================================================================

    print("Phase 6.5: Updating annotation_task_tag structure...",flush=True)

    # CRITICAL: This must happen BEFORE Phase 7 drops annotation_task.clip_annotation_id
    # After renaming clip_annotation_tag to annotation_task_tag,
    # we need to update the clip_annotation_id values to reference annotation_task.id
    # and then rename the column to annotation_task_id

    # First, clean up any orphaned annotation_task_tag entries
    # (tags that reference clip_annotations with no corresponding annotation_task)
    print("  - Cleaning up orphaned annotation_task_tag entries...",flush=True)
    bind = op.get_bind()
    result = bind.execute(
        sa.text("""
        SELECT COUNT(*) 
        FROM annotation_task_tag
        WHERE NOT EXISTS (
            SELECT 1 FROM annotation_task 
            WHERE annotation_task.clip_annotation_id = annotation_task_tag.clip_annotation_id
        )
    """)
    )
    orphaned_tags = result.scalar()
    if orphaned_tags > 0:
        print(f"    Found {orphaned_tags} orphaned annotation_task_tag entries (will be deleted)",flush=True)
        op.execute("""
            DELETE FROM annotation_task_tag
            WHERE NOT EXISTS (
                SELECT 1 FROM annotation_task 
                WHERE annotation_task.clip_annotation_id = annotation_task_tag.clip_annotation_id
            )
        """)

    if dialect == "sqlite":
        # SQLite: Recreate table with correct column names
        # Drop old unique constraint (FK and index already dropped in Phase 4)
        with op.batch_alter_table("annotation_task_tag", schema=None) as batch_op:
            batch_op.drop_constraint("uq_clip_annotation_tag_clip_annotation_id", type_="unique")

        # Create new table with correct column names
        op.execute("""
            CREATE TABLE annotation_task_tag_new (
                id INTEGER NOT NULL,
                annotation_task_id INTEGER NOT NULL,
                tag_id INTEGER NOT NULL,
                created_by_id BLOB,
                created_on DATETIME NOT NULL,
                PRIMARY KEY (id),
                FOREIGN KEY(annotation_task_id) REFERENCES annotation_task (id) ON DELETE CASCADE,
                FOREIGN KEY(tag_id) REFERENCES tag (id) ON DELETE CASCADE,
                FOREIGN KEY(created_by_id) REFERENCES user (id),
                UNIQUE (annotation_task_id, tag_id, created_by_id)
            )
        """)

        # Copy data with column rename and ID mapping
        # Map clip_annotation.id -> annotation_task.id using the annotation_task.clip_annotation_id
        print("  - Updating annotation_task_tag IDs to reference annotation_task instead of clip_annotation...",flush=True)
        op.execute("""
            INSERT INTO annotation_task_tag_new (id, annotation_task_id, tag_id, created_by_id, created_on)
            SELECT 
                annotation_task_tag.id, 
                annotation_task.id,
                annotation_task_tag.tag_id, 
                annotation_task_tag.created_by_id, 
                annotation_task_tag.created_on
            FROM annotation_task_tag
            JOIN annotation_task ON annotation_task.clip_annotation_id = annotation_task_tag.clip_annotation_id
        """)

        # Drop old table and rename new one
        op.drop_table("annotation_task_tag")
        op.rename_table("annotation_task_tag_new", "annotation_task_tag")

        # Create indexes
        with op.batch_alter_table("annotation_task_tag", schema=None) as batch_op:
            batch_op.create_index(
                batch_op.f("ix_annotation_task_tag_annotation_task_id"), ["annotation_task_id"], unique=False
            )
            batch_op.create_index(batch_op.f("ix_annotation_task_tag_tag_id"), ["tag_id"], unique=False)
            batch_op.create_index(batch_op.f("ix_annotation_task_tag_created_by_id"), ["created_by_id"], unique=False)
    else:
        # PostgreSQL: Can use ALTER TABLE RENAME COLUMN safely
        with op.batch_alter_table("annotation_task_tag", schema=None) as batch_op:
            # Drop old unique constraint (FK and index already dropped in Phase 4)
            batch_op.drop_constraint("uq_clip_annotation_tag_clip_annotation_id", type_="unique")

        # CRITICAL: Update clip_annotation_id values to be annotation_task.id values
        # Before renaming, we need to map clip_annotation.id -> annotation_task.id
        print("  - Updating annotation_task_tag IDs to reference annotation_task instead of clip_annotation...",flush=True)
        op.execute("""
            UPDATE annotation_task_tag
            SET clip_annotation_id = annotation_task.id
            FROM annotation_task
            WHERE annotation_task_tag.clip_annotation_id = annotation_task.clip_annotation_id
        """)

        # Rename column
        op.execute("ALTER TABLE annotation_task_tag RENAME COLUMN clip_annotation_id TO annotation_task_id")

        # Add new constraints
        with op.batch_alter_table("annotation_task_tag", schema=None) as batch_op:
            batch_op.create_foreign_key(
                batch_op.f("fk_annotation_task_tag_annotation_task_id_annotation_task"),
                "annotation_task",
                ["annotation_task_id"],
                ["id"],
                ondelete="CASCADE",
            )
            batch_op.create_index(
                batch_op.f("ix_annotation_task_tag_annotation_task_id"),
                ["annotation_task_id"],
                unique=False,
            )
            batch_op.create_index(batch_op.f("ix_annotation_task_tag_tag_id"), ["tag_id"], unique=False)
            batch_op.create_index(batch_op.f("ix_annotation_task_tag_created_by_id"), ["created_by_id"], unique=False)
            batch_op.create_unique_constraint(
                batch_op.f("uq_annotation_task_tag_annotation_task_id"),
                ["annotation_task_id", "tag_id", "created_by_id"],
            )

    # ==========================================================================
    # PHASE 7: UPDATE ANNOTATION_TASK TABLE STRUCTURE
    # ==========================================================================

    print("Phase 7: Finalizing annotation_task structure...",flush=True)

    # Now that data is migrated and FKs dropped, finalize the table structure
    with op.batch_alter_table("annotation_task", schema=None) as batch_op:
        # Make new columns NOT NULL
        batch_op.alter_column("recording_id", nullable=False)
        batch_op.alter_column("start_time", nullable=False)
        batch_op.alter_column("end_time", nullable=False)

        # Update unique constraint (must happen before dropping columns it references)
        batch_op.drop_constraint("uq_annotation_task_annotation_project_id", type_="unique")
        batch_op.create_unique_constraint(
            batch_op.f("uq_annotation_task_annotation_project_id"),
            ["annotation_project_id", "recording_id", "start_time", "end_time"],
        )

        # Drop old columns (FKs and indexes already dropped in Phase 4)
        batch_op.drop_column("clip_annotation_id")
        batch_op.drop_column("clip_id")
        batch_op.drop_column("uuid")

        # Add new foreign key to recording
        batch_op.create_foreign_key(
            batch_op.f("fk_annotation_task_recording_id_recording"),
            "recording",
            ["recording_id"],
            ["id"],
            ondelete="CASCADE",
        )
        batch_op.create_index(batch_op.f("ix_annotation_task_recording_id"), ["recording_id"], unique=False)

    # ==========================================================================
    # PHASE 8: UPDATE SOUND_EVENT_ANNOTATION TABLE STRUCTURE
    # ==========================================================================

    print("Phase 8: Finalizing sound_event_annotation structure...",flush=True)

    with op.batch_alter_table("sound_event_annotation", schema=None) as batch_op:
        # Make new columns NOT NULL
        batch_op.alter_column("annotation_task_id", nullable=False)
        batch_op.alter_column("recording_id", nullable=False)
        batch_op.alter_column("geometry_type", nullable=False)
        batch_op.alter_column("geometry", nullable=False)

        # Drop old columns (FKs and indexes already dropped in Phase 4)
        batch_op.drop_column("clip_annotation_id")
        batch_op.drop_column("sound_event_id")
        batch_op.drop_column("uuid")

        # Add new foreign keys
        batch_op.create_foreign_key(
            batch_op.f("fk_sound_event_annotation_annotation_task_id_annotation_task"),
            "annotation_task",
            ["annotation_task_id"],
            ["id"],
            ondelete="CASCADE",
        )
        batch_op.create_foreign_key(
            batch_op.f("fk_sound_event_annotation_recording_id_recording"),
            "recording",
            ["recording_id"],
            ["id"],
            ondelete="CASCADE",
        )
        batch_op.create_index(
            batch_op.f("ix_sound_event_annotation_annotation_task_id"),
            ["annotation_task_id"],
            unique=False,
        )
        batch_op.create_index(
            batch_op.f("ix_sound_event_annotation_recording_id"),
            ["recording_id"],
            unique=False,
        )

    # ==========================================================================
    # PHASE 9: UPDATE NOTE TABLE STRUCTURE
    # ==========================================================================

    print("Phase 9: Finalizing note structure...",flush=True)

    # Delete notes that couldn't be migrated (from recording_note and sound_event_annotation_note)
    print("  - Cleaning up notes that couldn't be migrated...",flush=True)
    bind = op.get_bind()
    result = bind.execute(sa.text("SELECT COUNT(*) FROM note WHERE annotation_task_id IS NULL"))
    orphaned_notes = result.scalar()
    print(f"    Found {orphaned_notes} notes without annotation_task (will be deleted)",flush=True)

    op.execute("DELETE FROM note WHERE annotation_task_id IS NULL")

    with op.batch_alter_table("note", schema=None) as batch_op:
        # Make annotation_task_id NOT NULL
        batch_op.alter_column("annotation_task_id", nullable=False)

        # Drop uuid column
        batch_op.drop_column("uuid")

        # Add foreign key constraint
        batch_op.create_foreign_key(
            batch_op.f("fk_note_annotation_task_id_annotation_task"),
            "annotation_task",
            ["annotation_task_id"],
            ["id"],
            ondelete="CASCADE",
        )
        batch_op.create_index(batch_op.f("ix_note_annotation_task_id"), ["annotation_task_id"], unique=False)

    # ==========================================================================
    # PHASE 10: REMOVE UUID COLUMNS FROM OTHER TABLES
    # ==========================================================================

    print("Phase 10: Removing UUID columns...",flush=True)

    # Remove uuid from recording
    with op.batch_alter_table("recording", schema=None) as batch_op:
        batch_op.drop_constraint("uq_recording_uuid", type_="unique")
        batch_op.drop_column("uuid")

    # Remove uuid from annotation_project
    with op.batch_alter_table("annotation_project", schema=None) as batch_op:
        batch_op.drop_constraint("uq_annotation_project_uuid", type_="unique")
        batch_op.drop_column("uuid")

    # Remove uuid from dataset
    with op.batch_alter_table("dataset", schema=None) as batch_op:
        batch_op.drop_constraint("uq_dataset_uuid", type_="unique")
        batch_op.drop_column("uuid")

    print("Migration complete!",flush=True)
    print("⚠️  WARNING: The following data has been lost:")
    print("   - Notes attached to recordings and sound_event_annotations")
    print("   - Orphaned clip_annotations (and their sound_event_annotations) that had no annotation_task")
    print("✓  All other data has been migrated successfully.")


def downgrade() -> None:
    """Downgrade is NOT SUPPORTED for this migration due to data loss.

    The following data is deleted during upgrade and cannot be recovered:
    - Notes attached to recordings and sound_event_annotations
    - Orphaned clip_annotations (and their sound_event_annotations) that had no annotation_task

    To rollback, restore from backup using:
        cp sonari_backup_pre_migration_YYYYMMDD_HHMMSS.db sonari.db

    See DATABASE_MIGRATION_GUIDE.md for complete rollback procedures.
    """
    raise NotImplementedError(
        "Downgrade is not supported for this migration due to data loss. "
        "Restore from backup instead. See DATABASE_MIGRATION_GUIDE.md for procedures."
    )

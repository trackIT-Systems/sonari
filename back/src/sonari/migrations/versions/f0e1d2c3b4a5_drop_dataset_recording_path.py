"""Drop the unused dataset_recording.path column.

The ``dataset_recording.path`` column was never read for file access (audio
loading uses ``recording.path`` + the root audio directory) and is no longer
written by the application. It is dropped entirely. The
``uq_dataset_recording_dataset_id`` unique constraint on
``(dataset_id, recording_id, path)`` is redundant with the composite primary
key ``pk_dataset_recording`` on ``(dataset_id, recording_id)`` and is dropped
first (it references the column being removed).

This migration is idempotent: it inspects the live schema and only drops the
constraint / column when they are still present. Databases that were created
via ``metadata.create_all()`` with the current model (which already lacks
both) are already in the target state and the migration is a no-op that only
advances the Alembic stamp.

Revision ID: f0e1d2c3b4a5
Revises: a1b2c3d4e5f6
Create Date: 2026-07-27

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

import sonari.models.base

# revision identifiers, used by Alembic.
revision: str = "f0e1d2c3b4a5"
down_revision: Union[str, None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    # Find the actual unique constraint covering
    # (dataset_id, recording_id, path), regardless of how it was named when
    # the table was created (naming convention vs. auto-generated name).
    target_cols = {"dataset_id", "recording_id", "path"}
    uq_to_drop = None
    for c in inspector.get_unique_constraints("dataset_recording"):
        if set(c.get("column_names") or []) == target_cols:
            uq_to_drop = c["name"]
            break

    # Only drop the path column if it still exists.
    has_path = any(
        col["name"] == "path"
        for col in inspector.get_columns("dataset_recording")
    )

    with op.batch_alter_table("dataset_recording", schema=None) as batch_op:
        if uq_to_drop is not None:
            batch_op.drop_constraint(uq_to_drop, type_="unique")
        if has_path:
            batch_op.drop_column("path")


def downgrade() -> None:
    # Restore the path column as NOT NULL. A server_default is required so the
    # column can be added on a non-empty table; it is cleared afterwards so
    # future inserts must supply a path, matching the original schema.
    with op.batch_alter_table("dataset_recording", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                "path",
                sonari.models.base.PathType(),
                nullable=False,
                server_default="",
            )
        )
        batch_op.create_unique_constraint(
            "uq_dataset_recording_dataset_id",
            ["dataset_id", "recording_id", "path"],
        )
    with op.batch_alter_table("dataset_recording", schema=None) as batch_op:
        batch_op.alter_column(
            "path",
            existing_type=sonari.models.base.PathType(),
            server_default=None,
            nullable=False,
        )

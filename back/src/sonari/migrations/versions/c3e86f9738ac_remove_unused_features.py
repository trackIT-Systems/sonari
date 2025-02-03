"""Remove unused features.

Revision ID: c3e86f9738ac
Revises: cc574886f726
Create Date: 2025-01-31 10:30:48.847658
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c3e86f9738ac"
down_revision: Union[str, None] = "cc574886f726"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Drop tables in order of dependencies (most dependent first)

    # First, drop metrics tables
    with op.batch_alter_table("sound_event_evaluation_metric", schema=None) as batch_op:
        batch_op.drop_index("ix_sound_event_evaluation_metric_feature_name_id")
        batch_op.drop_index("ix_sound_event_evaluation_metric_sound_event_evaluation_id")
    op.drop_table("sound_event_evaluation_metric")

    with op.batch_alter_table("clip_evaluation_metric", schema=None) as batch_op:
        batch_op.drop_index("ix_clip_evaluation_metric_clip_evaluation_id")
        batch_op.drop_index("ix_clip_evaluation_metric_feature_name_id")
    op.drop_table("clip_evaluation_metric")

    with op.batch_alter_table("evaluation_metric", schema=None) as batch_op:
        batch_op.drop_index("ix_evaluation_metric_evaluation_id")
        batch_op.drop_index("ix_evaluation_metric_feature_name_id")
    op.drop_table("evaluation_metric")

    # Drop prediction related tables
    with op.batch_alter_table("sound_event_prediction_tag", schema=None) as batch_op:
        batch_op.drop_index("ix_sound_event_prediction_tag_tag_id")
    op.drop_table("sound_event_prediction_tag")

    with op.batch_alter_table("clip_prediction_tag", schema=None) as batch_op:
        batch_op.drop_index("ix_clip_prediction_tag_clip_prediction_id")
        batch_op.drop_index("ix_clip_prediction_tag_tag_id")
    op.drop_table("clip_prediction_tag")

    with op.batch_alter_table("sound_event_evaluation", schema=None) as batch_op:
        batch_op.drop_index("ix_sound_event_evaluation_clip_evaluation_id")
        batch_op.drop_index("ix_sound_event_evaluation_source_id")
        batch_op.drop_index("ix_sound_event_evaluation_target_id")
    op.drop_table("sound_event_evaluation")

    # Drop evaluation related tables
    with op.batch_alter_table("clip_evaluation", schema=None) as batch_op:
        batch_op.drop_index("ix_clip_evaluation_clip_prediction_id")
        batch_op.drop_index("ix_clip_evaluation_clip_annotation_id")
        batch_op.drop_index("ix_clip_evaluation_evaluation_id")
    op.drop_table("clip_evaluation")

    # Drop prediction relationship tables
    with op.batch_alter_table("model_run_prediction", schema=None) as batch_op:
        batch_op.drop_index("ix_model_run_prediction_clip_prediction_id")
        batch_op.drop_index("ix_model_run_prediction_model_run_id")
    op.drop_table("model_run_prediction")

    with op.batch_alter_table("user_run_prediction", schema=None) as batch_op:
        batch_op.drop_index("ix_user_run_prediction_clip_prediction_id")
        batch_op.drop_index("ix_user_run_prediction_user_run_id")
    op.drop_table("user_run_prediction")

    with op.batch_alter_table("sound_event_prediction", schema=None) as batch_op:
        batch_op.drop_index("ix_sound_event_prediction_clip_prediction_id")
        batch_op.drop_index("ix_sound_event_prediction_score")
        batch_op.drop_index("ix_sound_event_prediction_sound_event_id")
    op.drop_table("sound_event_prediction")

    # Now we can safely drop clip_prediction
    with op.batch_alter_table("clip_prediction", schema=None) as batch_op:
        batch_op.drop_index("ix_clip_prediction_clip_id")
    op.drop_table("clip_prediction")

    # Drop evaluation relationships
    with op.batch_alter_table("model_run_evaluation", schema=None) as batch_op:
        batch_op.drop_index("ix_model_run_evaluation_evaluation_id")
        batch_op.drop_index("ix_model_run_evaluation_evaluation_set_id")
        batch_op.drop_index("ix_model_run_evaluation_model_run_id")
    op.drop_table("model_run_evaluation")

    with op.batch_alter_table("user_run_evaluation", schema=None) as batch_op:
        batch_op.drop_index("ix_user_run_evaluation_evaluation_id")
        batch_op.drop_index("ix_user_run_evaluation_evaluation_set_id")
        batch_op.drop_index("ix_user_run_evaluation_user_run_id")
    op.drop_table("user_run_evaluation")

    # Drop dataset and evaluation set relationships
    with op.batch_alter_table("dataset_recording", schema=None) as batch_op:
        batch_op.drop_index("ix_dataset_recording_dataset_id")
        batch_op.drop_index("ix_dataset_recording_recording_id")
    op.drop_table("dataset_recording")

    with op.batch_alter_table("evaluation_set_tag", schema=None) as batch_op:
        batch_op.drop_index("ix_evaluation_set_tag_evaluation_set_id")
        batch_op.drop_index("ix_evaluation_set_tag_tag_id")
    op.drop_table("evaluation_set_tag")

    with op.batch_alter_table("evaluation_set_annotation", schema=None) as batch_op:
        batch_op.drop_index("ix_evaluation_set_annotation_clip_annotation_id")
        batch_op.drop_index("ix_evaluation_set_annotation_evaluation_set_id")
    op.drop_table("evaluation_set_annotation")

    with op.batch_alter_table("evaluation_set_model_run", schema=None) as batch_op:
        batch_op.drop_index("ix_evaluation_set_model_run_evaluation_set_id")
        batch_op.drop_index("ix_evaluation_set_model_run_model_run_id")
    op.drop_table("evaluation_set_model_run")

    with op.batch_alter_table("evaluation_set_user_run", schema=None) as batch_op:
        batch_op.drop_index("ix_evaluation_set_user_run_evaluation_set_id")
        batch_op.drop_index("ix_evaluation_set_user_run_user_run_id")
    op.drop_table("evaluation_set_user_run")

    # Drop main tables
    op.drop_table("evaluation")
    op.drop_table("model_run")
    op.drop_table("user_run")
    op.drop_table("dataset")
    op.drop_table("evaluation_set")

    # Update annotation_task foreign key
    with op.batch_alter_table("annotation_task", schema=None) as batch_op:
        batch_op.drop_constraint(
            "fk_annotation_task_clip_annotation_id_clip_annotation",
            type_="foreignkey",
        )
        batch_op.create_foreign_key(
            batch_op.f("fk_annotation_task_clip_annotation_id_clip_annotation"),
            "clip_annotation",
            ["clip_annotation_id"],
            ["id"],
            ondelete="CASCADE",
        )


def downgrade() -> None:
    # ### commands auto generated by Alembic - please adjust! ###
    with op.batch_alter_table("annotation_task", schema=None) as batch_op:
        batch_op.drop_constraint(
            batch_op.f("fk_annotation_task_clip_annotation_id_clip_annotation"),
            type_="foreignkey",
        )
        batch_op.create_foreign_key(
            "fk_annotation_task_clip_annotation_id_clip_annotation",
            "clip_annotation",
            ["clip_annotation_id"],
            ["id"],
        )

    op.create_table(
        "evaluation_set_user_run",
        sa.Column("evaluation_set_id", sa.INTEGER(), nullable=False),
        sa.Column("user_run_id", sa.INTEGER(), nullable=False),
        sa.Column("created_on", sa.DATETIME(), nullable=False),
        sa.ForeignKeyConstraint(
            ["evaluation_set_id"],
            ["evaluation_set.id"],
            name="fk_evaluation_set_user_run_evaluation_set_id_evaluation_set",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_run_id"],
            ["user_run.id"],
            name="fk_evaluation_set_user_run_user_run_id_user_run",
        ),
        sa.PrimaryKeyConstraint(
            "evaluation_set_id",
            "user_run_id",
            name="pk_evaluation_set_user_run",
        ),
        sa.UniqueConstraint(
            "evaluation_set_id",
            "user_run_id",
            name="uq_evaluation_set_user_run_evaluation_set_id",
        ),
    )
    with op.batch_alter_table("evaluation_set_user_run", schema=None) as batch_op:
        batch_op.create_index(
            "ix_evaluation_set_user_run_user_run_id",
            ["user_run_id"],
            unique=False,
        )
        batch_op.create_index(
            "ix_evaluation_set_user_run_evaluation_set_id",
            ["evaluation_set_id"],
            unique=False,
        )

    op.create_table(
        "model_run",
        sa.Column("id", sa.INTEGER(), nullable=False),
        sa.Column("uuid", sa.CHAR(length=36), nullable=False),
        sa.Column("name", sa.VARCHAR(), nullable=False),
        sa.Column("version", sa.VARCHAR(), nullable=False),
        sa.Column("description", sa.VARCHAR(), nullable=False),
        sa.Column("created_on", sa.DATETIME(), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_model_run"),
        sa.UniqueConstraint("name", "version", name="uq_model_run_name"),
        sa.UniqueConstraint("uuid", name="uq_model_run_uuid"),
    )
    op.create_table(
        "clip_evaluation_metric",
        sa.Column("id", sa.INTEGER(), nullable=False),
        sa.Column("clip_evaluation_id", sa.INTEGER(), nullable=False),
        sa.Column("feature_name_id", sa.INTEGER(), nullable=False),
        sa.Column("value", sa.FLOAT(), nullable=False),
        sa.Column("created_on", sa.DATETIME(), nullable=False),
        sa.ForeignKeyConstraint(
            ["clip_evaluation_id"],
            ["clip_evaluation.id"],
            name="fk_clip_evaluation_metric_clip_evaluation_id_clip_evaluation",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["feature_name_id"],
            ["feature_name.id"],
            name="fk_clip_evaluation_metric_feature_name_id_feature_name",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_clip_evaluation_metric"),
        sa.UniqueConstraint(
            "clip_evaluation_id",
            "feature_name_id",
            name="uq_clip_evaluation_metric_clip_evaluation_id",
        ),
    )
    with op.batch_alter_table("clip_evaluation_metric", schema=None) as batch_op:
        batch_op.create_index(
            "ix_clip_evaluation_metric_feature_name_id",
            ["feature_name_id"],
            unique=False,
        )
        batch_op.create_index(
            "ix_clip_evaluation_metric_clip_evaluation_id",
            ["clip_evaluation_id"],
            unique=False,
        )

    op.create_table(
        "sound_event_prediction",
        sa.Column("id", sa.INTEGER(), nullable=False),
        sa.Column("uuid", sa.CHAR(length=36), nullable=False),
        sa.Column("sound_event_id", sa.INTEGER(), nullable=False),
        sa.Column("clip_prediction_id", sa.INTEGER(), nullable=False),
        sa.Column("score", sa.FLOAT(), nullable=False),
        sa.Column("created_on", sa.DATETIME(), nullable=False),
        sa.ForeignKeyConstraint(
            ["clip_prediction_id"],
            ["clip_prediction.id"],
            name="fk_sound_event_prediction_clip_prediction_id_clip_prediction",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["sound_event_id"],
            ["sound_event.id"],
            name="fk_sound_event_prediction_sound_event_id_sound_event",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_sound_event_prediction"),
        sa.UniqueConstraint(
            "sound_event_id",
            "clip_prediction_id",
            name="uq_sound_event_prediction_sound_event_id",
        ),
        sa.UniqueConstraint("uuid", name="uq_sound_event_prediction_uuid"),
    )
    with op.batch_alter_table("sound_event_prediction", schema=None) as batch_op:
        batch_op.create_index(
            "ix_sound_event_prediction_sound_event_id",
            ["sound_event_id"],
            unique=False,
        )
        batch_op.create_index("ix_sound_event_prediction_score", ["score"], unique=False)
        batch_op.create_index(
            "ix_sound_event_prediction_clip_prediction_id",
            ["clip_prediction_id"],
            unique=False,
        )

    op.create_table(
        "clip_prediction_tag",
        sa.Column("id", sa.INTEGER(), nullable=False),
        sa.Column("clip_prediction_id", sa.INTEGER(), nullable=False),
        sa.Column("tag_id", sa.INTEGER(), nullable=False),
        sa.Column("score", sa.FLOAT(), nullable=False),
        sa.Column("created_on", sa.DATETIME(), nullable=False),
        sa.ForeignKeyConstraint(
            ["clip_prediction_id"],
            ["clip_prediction.id"],
            name="fk_clip_prediction_tag_clip_prediction_id_clip_prediction",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["tag_id"],
            ["tag.id"],
            name="fk_clip_prediction_tag_tag_id_tag",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", "clip_prediction_id", "tag_id", name="pk_clip_prediction_tag"),
        sa.UniqueConstraint(
            "clip_prediction_id",
            "tag_id",
            name="uq_clip_prediction_tag_clip_prediction_id",
        ),
    )
    with op.batch_alter_table("clip_prediction_tag", schema=None) as batch_op:
        batch_op.create_index("ix_clip_prediction_tag_tag_id", ["tag_id"], unique=False)
        batch_op.create_index(
            "ix_clip_prediction_tag_clip_prediction_id",
            ["clip_prediction_id"],
            unique=False,
        )

    op.create_table(
        "user_run_evaluation",
        sa.Column("user_run_id", sa.INTEGER(), nullable=False),
        sa.Column("evaluation_set_id", sa.INTEGER(), nullable=False),
        sa.Column("evaluation_id", sa.INTEGER(), nullable=False),
        sa.Column("created_on", sa.DATETIME(), nullable=False),
        sa.ForeignKeyConstraint(
            ["evaluation_id"],
            ["evaluation.id"],
            name="fk_user_run_evaluation_evaluation_id_evaluation",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["evaluation_set_id"],
            ["evaluation_set.id"],
            name="fk_user_run_evaluation_evaluation_set_id_evaluation_set",
        ),
        sa.ForeignKeyConstraint(
            ["user_run_id"],
            ["user_run.id"],
            name="fk_user_run_evaluation_user_run_id_user_run",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint(
            "user_run_id",
            "evaluation_set_id",
            "evaluation_id",
            name="pk_user_run_evaluation",
        ),
        sa.UniqueConstraint(
            "user_run_id",
            "evaluation_set_id",
            name="uq_user_run_evaluation_user_run_id",
        ),
    )
    with op.batch_alter_table("user_run_evaluation", schema=None) as batch_op:
        batch_op.create_index("ix_user_run_evaluation_user_run_id", ["user_run_id"], unique=False)
        batch_op.create_index(
            "ix_user_run_evaluation_evaluation_set_id",
            ["evaluation_set_id"],
            unique=False,
        )
        batch_op.create_index(
            "ix_user_run_evaluation_evaluation_id",
            ["evaluation_id"],
            unique=False,
        )

    op.create_table(
        "evaluation_set_model_run",
        sa.Column("evaluation_set_id", sa.INTEGER(), nullable=False),
        sa.Column("model_run_id", sa.INTEGER(), nullable=False),
        sa.Column("created_on", sa.DATETIME(), nullable=False),
        sa.ForeignKeyConstraint(
            ["evaluation_set_id"],
            ["evaluation_set.id"],
            name="fk_evaluation_set_model_run_evaluation_set_id_evaluation_set",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["model_run_id"],
            ["model_run.id"],
            name="fk_evaluation_set_model_run_model_run_id_model_run",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint(
            "evaluation_set_id",
            "model_run_id",
            name="pk_evaluation_set_model_run",
        ),
        sa.UniqueConstraint(
            "evaluation_set_id",
            "model_run_id",
            name="uq_evaluation_set_model_run_evaluation_set_id",
        ),
    )
    with op.batch_alter_table("evaluation_set_model_run", schema=None) as batch_op:
        batch_op.create_index(
            "ix_evaluation_set_model_run_model_run_id",
            ["model_run_id"],
            unique=False,
        )
        batch_op.create_index(
            "ix_evaluation_set_model_run_evaluation_set_id",
            ["evaluation_set_id"],
            unique=False,
        )

    op.create_table(
        "user_run_prediction",
        sa.Column("user_run_id", sa.INTEGER(), nullable=False),
        sa.Column("clip_prediction_id", sa.INTEGER(), nullable=False),
        sa.Column("created_on", sa.DATETIME(), nullable=False),
        sa.ForeignKeyConstraint(
            ["clip_prediction_id"],
            ["clip_prediction.id"],
            name="fk_user_run_prediction_clip_prediction_id_clip_prediction",
        ),
        sa.ForeignKeyConstraint(
            ["user_run_id"],
            ["user_run.id"],
            name="fk_user_run_prediction_user_run_id_user_run",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("user_run_id", "clip_prediction_id", name="pk_user_run_prediction"),
        sa.UniqueConstraint(
            "user_run_id",
            "clip_prediction_id",
            name="uq_user_run_prediction_user_run_id",
        ),
    )
    with op.batch_alter_table("user_run_prediction", schema=None) as batch_op:
        batch_op.create_index("ix_user_run_prediction_user_run_id", ["user_run_id"], unique=False)
        batch_op.create_index(
            "ix_user_run_prediction_clip_prediction_id",
            ["clip_prediction_id"],
            unique=False,
        )

    op.create_table(
        "evaluation_set_annotation",
        sa.Column("evaluation_set_id", sa.INTEGER(), nullable=False),
        sa.Column("clip_annotation_id", sa.INTEGER(), nullable=False),
        sa.Column("created_on", sa.DATETIME(), nullable=False),
        sa.ForeignKeyConstraint(
            ["clip_annotation_id"],
            ["clip_annotation.id"],
            name="fk_evaluation_set_annotation_clip_annotation_id_clip_annotation",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["evaluation_set_id"],
            ["evaluation_set.id"],
            name="fk_evaluation_set_annotation_evaluation_set_id_evaluation_set",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint(
            "evaluation_set_id",
            "clip_annotation_id",
            name="pk_evaluation_set_annotation",
        ),
        sa.UniqueConstraint(
            "evaluation_set_id",
            "clip_annotation_id",
            name="uq_evaluation_set_annotation_evaluation_set_id",
        ),
    )
    with op.batch_alter_table("evaluation_set_annotation", schema=None) as batch_op:
        batch_op.create_index(
            "ix_evaluation_set_annotation_evaluation_set_id",
            ["evaluation_set_id"],
            unique=False,
        )
        batch_op.create_index(
            "ix_evaluation_set_annotation_clip_annotation_id",
            ["clip_annotation_id"],
            unique=False,
        )

    op.create_table(
        "sound_event_prediction_tag",
        sa.Column("sound_event_prediction_id", sa.INTEGER(), nullable=False),
        sa.Column("tag_id", sa.INTEGER(), nullable=False),
        sa.Column("score", sa.FLOAT(), nullable=False),
        sa.Column("created_on", sa.DATETIME(), nullable=False),
        sa.ForeignKeyConstraint(
            ["sound_event_prediction_id"],
            ["sound_event_prediction.id"],
            name="fk_sound_event_prediction_tag_sound_event_prediction_id_sound_event_prediction",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["tag_id"],
            ["tag.id"],
            name="fk_sound_event_prediction_tag_tag_id_tag",
        ),
        sa.PrimaryKeyConstraint(
            "sound_event_prediction_id",
            "tag_id",
            name="pk_sound_event_prediction_tag",
        ),
        sa.UniqueConstraint(
            "sound_event_prediction_id",
            "tag_id",
            name="uq_sound_event_prediction_tag_sound_event_prediction_id",
        ),
    )
    with op.batch_alter_table("sound_event_prediction_tag", schema=None) as batch_op:
        batch_op.create_index("ix_sound_event_prediction_tag_tag_id", ["tag_id"], unique=False)

    op.create_table(
        "evaluation_metric",
        sa.Column("id", sa.INTEGER(), nullable=False),
        sa.Column("evaluation_id", sa.INTEGER(), nullable=False),
        sa.Column("feature_name_id", sa.INTEGER(), nullable=False),
        sa.Column("value", sa.FLOAT(), nullable=False),
        sa.Column("created_on", sa.DATETIME(), nullable=False),
        sa.ForeignKeyConstraint(
            ["evaluation_id"],
            ["evaluation.id"],
            name="fk_evaluation_metric_evaluation_id_evaluation",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["feature_name_id"],
            ["feature_name.id"],
            name="fk_evaluation_metric_feature_name_id_feature_name",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_evaluation_metric"),
        sa.UniqueConstraint(
            "evaluation_id",
            "feature_name_id",
            name="uq_evaluation_metric_evaluation_id",
        ),
    )
    with op.batch_alter_table("evaluation_metric", schema=None) as batch_op:
        batch_op.create_index(
            "ix_evaluation_metric_feature_name_id",
            ["feature_name_id"],
            unique=False,
        )
        batch_op.create_index(
            "ix_evaluation_metric_evaluation_id",
            ["evaluation_id"],
            unique=False,
        )

    op.create_table(
        "clip_evaluation",
        sa.Column("id", sa.INTEGER(), nullable=False),
        sa.Column("uuid", sa.CHAR(length=36), nullable=False),
        sa.Column("evaluation_id", sa.INTEGER(), nullable=False),
        sa.Column("clip_annotation_id", sa.INTEGER(), nullable=False),
        sa.Column("clip_prediction_id", sa.INTEGER(), nullable=False),
        sa.Column("score", sa.FLOAT(), nullable=False),
        sa.Column("created_on", sa.DATETIME(), nullable=False),
        sa.ForeignKeyConstraint(
            ["clip_annotation_id"],
            ["clip_annotation.id"],
            name="fk_clip_evaluation_clip_annotation_id_clip_annotation",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["clip_prediction_id"],
            ["clip_prediction.id"],
            name="fk_clip_evaluation_clip_prediction_id_clip_prediction",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["evaluation_id"],
            ["evaluation.id"],
            name="fk_clip_evaluation_evaluation_id_evaluation",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_clip_evaluation"),
        sa.UniqueConstraint(
            "clip_annotation_id",
            "clip_prediction_id",
            "evaluation_id",
            name="uq_clip_evaluation_clip_annotation_id",
        ),
        sa.UniqueConstraint("uuid", name="uq_clip_evaluation_uuid"),
    )
    with op.batch_alter_table("clip_evaluation", schema=None) as batch_op:
        batch_op.create_index("ix_clip_evaluation_evaluation_id", ["evaluation_id"], unique=False)
        batch_op.create_index(
            "ix_clip_evaluation_clip_prediction_id",
            ["clip_prediction_id"],
            unique=False,
        )
        batch_op.create_index(
            "ix_clip_evaluation_clip_annotation_id",
            ["clip_annotation_id"],
            unique=False,
        )

    op.create_table(
        "model_run_prediction",
        sa.Column("model_run_id", sa.INTEGER(), nullable=False),
        sa.Column("clip_prediction_id", sa.INTEGER(), nullable=False),
        sa.Column("created_on", sa.DATETIME(), nullable=False),
        sa.ForeignKeyConstraint(
            ["clip_prediction_id"],
            ["clip_prediction.id"],
            name="fk_model_run_prediction_clip_prediction_id_clip_prediction",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["model_run_id"],
            ["model_run.id"],
            name="fk_model_run_prediction_model_run_id_model_run",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint(
            "model_run_id",
            "clip_prediction_id",
            name="pk_model_run_prediction",
        ),
        sa.UniqueConstraint(
            "model_run_id",
            "clip_prediction_id",
            name="uq_model_run_prediction_model_run_id",
        ),
    )
    with op.batch_alter_table("model_run_prediction", schema=None) as batch_op:
        batch_op.create_index(
            "ix_model_run_prediction_model_run_id",
            ["model_run_id"],
            unique=False,
        )
        batch_op.create_index(
            "ix_model_run_prediction_clip_prediction_id",
            ["clip_prediction_id"],
            unique=False,
        )

    op.create_table(
        "model_run_evaluation",
        sa.Column("model_run_id", sa.INTEGER(), nullable=False),
        sa.Column("evaluation_set_id", sa.INTEGER(), nullable=False),
        sa.Column("evaluation_id", sa.INTEGER(), nullable=False),
        sa.Column("created_on", sa.DATETIME(), nullable=False),
        sa.ForeignKeyConstraint(
            ["evaluation_id"],
            ["evaluation.id"],
            name="fk_model_run_evaluation_evaluation_id_evaluation",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["evaluation_set_id"],
            ["evaluation_set.id"],
            name="fk_model_run_evaluation_evaluation_set_id_evaluation_set",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["model_run_id"],
            ["model_run.id"],
            name="fk_model_run_evaluation_model_run_id_model_run",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint(
            "model_run_id",
            "evaluation_set_id",
            "evaluation_id",
            name="pk_model_run_evaluation",
        ),
        sa.UniqueConstraint(
            "model_run_id",
            "evaluation_set_id",
            name="uq_model_run_evaluation_model_run_id",
        ),
    )
    with op.batch_alter_table("model_run_evaluation", schema=None) as batch_op:
        batch_op.create_index(
            "ix_model_run_evaluation_model_run_id",
            ["model_run_id"],
            unique=False,
        )
        batch_op.create_index(
            "ix_model_run_evaluation_evaluation_set_id",
            ["evaluation_set_id"],
            unique=False,
        )
        batch_op.create_index(
            "ix_model_run_evaluation_evaluation_id",
            ["evaluation_id"],
            unique=False,
        )

    op.create_table(
        "user_run",
        sa.Column("id", sa.INTEGER(), nullable=False),
        sa.Column("uuid", sa.CHAR(length=36), nullable=False),
        sa.Column("user_id", sa.CHAR(length=36), nullable=False),
        sa.Column("created_on", sa.DATETIME(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], name="fk_user_run_user_id_user"),
        sa.PrimaryKeyConstraint("id", name="pk_user_run"),
        sa.UniqueConstraint("uuid", name="uq_user_run_uuid"),
    )
    with op.batch_alter_table("user_run", schema=None) as batch_op:
        batch_op.create_index("ix_user_run_user_id", ["user_id"], unique=False)

    op.create_table(
        "sound_event_evaluation",
        sa.Column("id", sa.INTEGER(), nullable=False),
        sa.Column("uuid", sa.CHAR(length=36), nullable=False),
        sa.Column("clip_evaluation_id", sa.INTEGER(), nullable=False),
        sa.Column("source_id", sa.INTEGER(), nullable=True),
        sa.Column("target_id", sa.INTEGER(), nullable=True),
        sa.Column("affinity", sa.FLOAT(), nullable=False),
        sa.Column("score", sa.FLOAT(), nullable=False),
        sa.Column("created_on", sa.DATETIME(), nullable=False),
        sa.ForeignKeyConstraint(
            ["clip_evaluation_id"],
            ["clip_evaluation.id"],
            name="fk_sound_event_evaluation_clip_evaluation_id_clip_evaluation",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["source_id"],
            ["sound_event_prediction.id"],
            name="fk_sound_event_evaluation_source_id_sound_event_prediction",
        ),
        sa.ForeignKeyConstraint(
            ["target_id"],
            ["sound_event_annotation.id"],
            name="fk_sound_event_evaluation_target_id_sound_event_annotation",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_sound_event_evaluation"),
        sa.UniqueConstraint("uuid", name="uq_sound_event_evaluation_uuid"),
    )
    with op.batch_alter_table("sound_event_evaluation", schema=None) as batch_op:
        batch_op.create_index("ix_sound_event_evaluation_target_id", ["target_id"], unique=False)
        batch_op.create_index("ix_sound_event_evaluation_source_id", ["source_id"], unique=False)
        batch_op.create_index(
            "ix_sound_event_evaluation_clip_evaluation_id",
            ["clip_evaluation_id"],
            unique=False,
        )

    op.create_table(
        "evaluation_set",
        sa.Column("id", sa.INTEGER(), nullable=False),
        sa.Column("uuid", sa.CHAR(length=36), nullable=False),
        sa.Column("name", sa.VARCHAR(), nullable=False),
        sa.Column("description", sa.VARCHAR(), nullable=False),
        sa.Column("task", sa.VARCHAR(), nullable=False),
        sa.Column("created_on", sa.DATETIME(), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_evaluation_set"),
        sa.UniqueConstraint("name", name="uq_evaluation_set_name"),
        sa.UniqueConstraint("uuid", name="uq_evaluation_set_uuid"),
    )
    op.create_table(
        "dataset",
        sa.Column("id", sa.INTEGER(), nullable=False),
        sa.Column("uuid", sa.CHAR(length=36), nullable=False),
        sa.Column("name", sa.VARCHAR(), nullable=False),
        sa.Column("description", sa.VARCHAR(), nullable=True),
        sa.Column("audio_dir", sa.VARCHAR(), nullable=False),
        sa.Column("created_on", sa.DATETIME(), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_dataset"),
        sa.UniqueConstraint("audio_dir", name="uq_dataset_audio_dir"),
        sa.UniqueConstraint("name", name="uq_dataset_name"),
        sa.UniqueConstraint("uuid", name="uq_dataset_uuid"),
    )
    op.create_table(
        "evaluation",
        sa.Column("id", sa.INTEGER(), nullable=False),
        sa.Column("uuid", sa.CHAR(length=36), nullable=False),
        sa.Column("task", sa.VARCHAR(), nullable=False),
        sa.Column("score", sa.FLOAT(), nullable=False),
        sa.Column("created_on", sa.DATETIME(), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_evaluation"),
        sa.UniqueConstraint("uuid", name="uq_evaluation_uuid"),
    )
    op.create_table(
        "dataset_recording",
        sa.Column("dataset_id", sa.INTEGER(), nullable=False),
        sa.Column("recording_id", sa.INTEGER(), nullable=False),
        sa.Column("path", sa.VARCHAR(), nullable=False),
        sa.Column("created_on", sa.DATETIME(), nullable=False),
        sa.ForeignKeyConstraint(
            ["dataset_id"],
            ["dataset.id"],
            name="fk_dataset_recording_dataset_id_dataset",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["recording_id"],
            ["recording.id"],
            name="fk_dataset_recording_recording_id_recording",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("dataset_id", "recording_id", name="pk_dataset_recording"),
        sa.UniqueConstraint(
            "dataset_id",
            "recording_id",
            "path",
            name="uq_dataset_recording_dataset_id",
        ),
    )
    with op.batch_alter_table("dataset_recording", schema=None) as batch_op:
        batch_op.create_index("ix_dataset_recording_recording_id", ["recording_id"], unique=False)
        batch_op.create_index("ix_dataset_recording_dataset_id", ["dataset_id"], unique=False)

    op.create_table(
        "evaluation_set_tag",
        sa.Column("evaluation_set_id", sa.INTEGER(), nullable=False),
        sa.Column("tag_id", sa.INTEGER(), nullable=False),
        sa.Column("created_on", sa.DATETIME(), nullable=False),
        sa.ForeignKeyConstraint(
            ["evaluation_set_id"],
            ["evaluation_set.id"],
            name="fk_evaluation_set_tag_evaluation_set_id_evaluation_set",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["tag_id"],
            ["tag.id"],
            name="fk_evaluation_set_tag_tag_id_tag",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("evaluation_set_id", "tag_id", name="pk_evaluation_set_tag"),
        sa.UniqueConstraint(
            "evaluation_set_id",
            "tag_id",
            name="uq_evaluation_set_tag_evaluation_set_id",
        ),
    )
    with op.batch_alter_table("evaluation_set_tag", schema=None) as batch_op:
        batch_op.create_index("ix_evaluation_set_tag_tag_id", ["tag_id"], unique=False)
        batch_op.create_index(
            "ix_evaluation_set_tag_evaluation_set_id",
            ["evaluation_set_id"],
            unique=False,
        )

    op.create_table(
        "clip_prediction",
        sa.Column("id", sa.INTEGER(), nullable=False),
        sa.Column("uuid", sa.CHAR(length=36), nullable=False),
        sa.Column("clip_id", sa.INTEGER(), nullable=False),
        sa.Column("created_on", sa.DATETIME(), nullable=False),
        sa.ForeignKeyConstraint(
            ["clip_id"],
            ["clip.id"],
            name="fk_clip_prediction_clip_id_clip",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_clip_prediction"),
        sa.UniqueConstraint("uuid", name="uq_clip_prediction_uuid"),
    )
    with op.batch_alter_table("clip_prediction", schema=None) as batch_op:
        batch_op.create_index("ix_clip_prediction_clip_id", ["clip_id"], unique=False)

    op.create_table(
        "sound_event_evaluation_metric",
        sa.Column("id", sa.INTEGER(), nullable=False),
        sa.Column("sound_event_evaluation_id", sa.INTEGER(), nullable=False),
        sa.Column("feature_name_id", sa.INTEGER(), nullable=False),
        sa.Column("value", sa.FLOAT(), nullable=False),
        sa.Column("created_on", sa.DATETIME(), nullable=False),
        sa.ForeignKeyConstraint(
            ["feature_name_id"],
            ["feature_name.id"],
            name="fk_sound_event_evaluation_metric_feature_name_id_feature_name",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["sound_event_evaluation_id"],
            ["sound_event_evaluation.id"],
            name="fk_sound_event_evaluation_metric_sound_event_evaluation_id_sound_event_evaluation",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_sound_event_evaluation_metric"),
        sa.UniqueConstraint(
            "sound_event_evaluation_id",
            "feature_name_id",
            name="uq_sound_event_evaluation_metric_sound_event_evaluation_id",
        ),
    )
    with op.batch_alter_table("sound_event_evaluation_metric", schema=None) as batch_op:
        batch_op.create_index(
            "ix_sound_event_evaluation_metric_sound_event_evaluation_id",
            ["sound_event_evaluation_id"],
            unique=False,
        )
        batch_op.create_index(
            "ix_sound_event_evaluation_metric_feature_name_id",
            ["feature_name_id"],
            unique=False,
        )

    # ### end Alembic commands ###

"""Add tag groups, tag presets and per-project tag scopes.

Revision ID: c9d0e1f2a3b4
Revises: b8c9d0e1f3
Create Date: 2026-10-15

"""

import datetime
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c9d0e1f2a3b4"
down_revision: Union[str, None] = "b8c9d0e1f3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

DEFAULT_GROUPS = [
    ("Bat", "bat,yolobat,fledermaus,chiroptera"),
    ("Bird", "bird,birdedge,vogel,aves"),
    ("Amphibian", "anuravox,anura,frog,frosch,amphib"),
    ("Cricket", "cricket,grille,orthoptera,heuschrecke"),
]

NEW_FK_COLUMNS = [
    ("tag", "group_id", "tag_group", "fk_tag_group_id_tag_group"),
    ("annotation_project", "tag_group_id", "tag_group", "fk_annotation_project_tag_group_id_tag_group"),
    ("annotation_project", "tag_preset_id", "tag_preset", "fk_annotation_project_tag_preset_id_tag_preset"),
]


def upgrade() -> None:
    tag_group = op.create_table(
        "tag_group",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("project_keywords", sa.String(), nullable=False, server_default=""),
        sa.Column("created_on", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_tag_group")),
        sa.UniqueConstraint("name", name=op.f("uq_tag_group_name")),
    )

    op.create_table(
        "tag_preset",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.String(), nullable=False, server_default=""),
        sa.Column("group_id", sa.Integer(), nullable=True),
        sa.Column("created_by_id", sa.Uuid(), nullable=True),
        sa.Column("created_on", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["group_id"],
            ["tag_group.id"],
            name=op.f("fk_tag_preset_group_id_tag_group"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_id"],
            ["user.id"],
            name=op.f("fk_tag_preset_created_by_id_user"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_tag_preset")),
        sa.UniqueConstraint("name", name=op.f("uq_tag_preset_name")),
    )
    op.create_index(op.f("ix_tag_preset_group_id"), "tag_preset", ["group_id"])
    op.create_index(op.f("ix_tag_preset_created_by_id"), "tag_preset", ["created_by_id"])

    op.create_table(
        "tag_preset_tag",
        sa.Column("tag_preset_id", sa.Integer(), nullable=False),
        sa.Column("tag_id", sa.Integer(), nullable=False),
        sa.Column("created_on", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["tag_preset_id"],
            ["tag_preset.id"],
            name=op.f("fk_tag_preset_tag_tag_preset_id_tag_preset"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["tag_id"],
            ["tag.id"],
            name=op.f("fk_tag_preset_tag_tag_id_tag"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("tag_preset_id", "tag_id", name=op.f("pk_tag_preset_tag")),
    )
    op.create_index(op.f("ix_tag_preset_tag_tag_id"), "tag_preset_tag", ["tag_id"])

    # Plain ADD COLUMN instead of batch mode: on SQLite, batch mode recreates
    # annotation_project and drops the WHERE clause of its partial unique
    # guided tour indexes. SQLite does not enforce these foreign keys anyway.
    is_postgres = op.get_bind().dialect.name == "postgresql"
    for table, column, referred, constraint in NEW_FK_COLUMNS:
        op.add_column(table, sa.Column(column, sa.Integer(), nullable=True))
        if is_postgres:
            op.create_foreign_key(constraint, table, referred, [column], ["id"], ondelete="SET NULL")
        op.create_index(f"ix_{table}_{column}", table, [column])
    op.add_column(
        "annotation_project",
        sa.Column("tag_scope", sa.String(), nullable=False, server_default="auto"),
    )

    now = datetime.datetime.now(datetime.timezone.utc)
    op.bulk_insert(
        tag_group,
        [{"name": name, "project_keywords": keywords, "created_on": now} for name, keywords in DEFAULT_GROUPS],
    )


def downgrade() -> None:
    is_postgres = op.get_bind().dialect.name == "postgresql"
    op.drop_column("annotation_project", "tag_scope")
    for table, column, _, constraint in reversed(NEW_FK_COLUMNS):
        op.drop_index(f"ix_{table}_{column}", table_name=table)
        if is_postgres:
            op.drop_constraint(constraint, table, type_="foreignkey")
        op.drop_column(table, column)

    op.drop_index(op.f("ix_tag_preset_tag_tag_id"), table_name="tag_preset_tag")
    op.drop_table("tag_preset_tag")
    op.drop_index(op.f("ix_tag_preset_created_by_id"), table_name="tag_preset")
    op.drop_index(op.f("ix_tag_preset_group_id"), table_name="tag_preset")
    op.drop_table("tag_preset")
    op.drop_table("tag_group")

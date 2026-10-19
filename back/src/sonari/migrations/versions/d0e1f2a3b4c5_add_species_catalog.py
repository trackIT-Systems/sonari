"""Add species catalog tables and link tags to species.

Revision ID: d0e1f2a3b4c5
Revises: c9d0e1f2a3b4
Create Date: 2026-10-15

The catalog itself is loaded from sonari/catalogs/species.json on startup.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d0e1f2a3b4c5"
down_revision: Union[str, None] = "c9d0e1f2a3b4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "species",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("scientific_name", sa.String(), nullable=False),
        sa.Column("name_de", sa.String(), nullable=False, server_default=""),
        sa.Column("group_id", sa.Integer(), nullable=True),
        sa.Column("created_on", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["group_id"],
            ["tag_group.id"],
            name=op.f("fk_species_group_id_tag_group"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_species")),
        sa.UniqueConstraint("scientific_name", name=op.f("uq_species_scientific_name")),
    )
    op.create_index(op.f("ix_species_group_id"), "species", ["group_id"])

    op.create_table(
        "species_name",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("species_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("created_on", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["species_id"],
            ["species.id"],
            name=op.f("fk_species_name_species_id_species"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_species_name")),
        sa.UniqueConstraint("name", name=op.f("uq_species_name_name")),
    )
    op.create_index(op.f("ix_species_name_species_id"), "species_name", ["species_id"])

    # Plain ADD COLUMN (no batch mode), see c9d0e1f2a3b4.
    op.add_column("tag", sa.Column("species_id", sa.Integer(), nullable=True))
    if op.get_bind().dialect.name == "postgresql":
        op.create_foreign_key(
            "fk_tag_species_id_species",
            "tag",
            "species",
            ["species_id"],
            ["id"],
            ondelete="SET NULL",
        )
    op.create_index("ix_tag_species_id", "tag", ["species_id"])


def downgrade() -> None:
    op.drop_index("ix_tag_species_id", table_name="tag")
    if op.get_bind().dialect.name == "postgresql":
        op.drop_constraint("fk_tag_species_id_species", "tag", type_="foreignkey")
    op.drop_column("tag", "species_id")

    op.drop_index(op.f("ix_species_name_species_id"), table_name="species_name")
    op.drop_table("species_name")
    op.drop_index(op.f("ix_species_group_id"), table_name="species")
    op.drop_table("species")

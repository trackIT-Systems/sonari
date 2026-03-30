"""Add app_token table for Sonari APP tokens.

Revision ID: a1b2c3d4e5f6
Revises: 842d7a951667
Create Date: 2026-03-25

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "842d7a951667"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_index_on_columns(inspector, table: str, columns: list[str]) -> bool:
    for idx in inspector.get_indexes(table):
        if list(idx.get("column_names") or []) == columns:
            return True
    return False


def _has_column(inspector, table: str, name: str) -> bool:
    return any(c.get("name") == name for c in inspector.get_columns(table))


def _ensure_app_token_permission_columns() -> None:
    """Add can_read/can_write + check if table exists from an older revision."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("app_token"):
        return
    if _has_column(inspector, "app_token", "can_read"):
        return
    op.add_column(
        "app_token",
        sa.Column("can_read", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.add_column(
        "app_token",
        sa.Column("can_write", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.create_check_constraint(
        "ck_app_token_can_read_or_write",
        "app_token",
        "can_read OR can_write",
    )


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if inspector.has_table("app_token"):
        # Table already present (e.g. partial deploy, manual DDL, or alembic_version out of sync).
        # Re-running CREATE TABLE hits pg_type_typname_nsp_index: Postgres reserves a composite
        # type name matching the table.
        _ensure_app_token_permission_columns()
        if not _has_index_on_columns(inspector, "app_token", ["user_id"]):
            op.create_index(op.f("ix_app_token_user_id"), "app_token", ["user_id"], unique=False)
        return

    if bind.dialect.name == "postgresql":
        # A failed or rolled-back CREATE TABLE can leave an orphan composite type "app_token"
        # with no relation. has_table is then false but CREATE TABLE still fails on
        # pg_type_typname_nsp_index. Clean up before creating the table.
        op.execute(sa.text('DROP TABLE IF EXISTS "app_token" CASCADE'))

    op.create_table(
        "app_token",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("secret_hash", sa.String(length=1024), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_on", sa.DateTime(timezone=True), nullable=False),
        sa.Column("can_read", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("can_write", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.CheckConstraint("can_read OR can_write", name="ck_app_token_can_read_or_write"),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], name=op.f("fk_app_token_user_id_user"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_app_token")),
    )
    op.create_index(op.f("ix_app_token_user_id"), "app_token", ["user_id"], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("app_token"):
        return
    for idx in inspector.get_indexes("app_token"):
        if list(idx.get("column_names") or []) == ["user_id"]:
            op.drop_index(idx["name"], table_name="app_token")
            break
    op.drop_table("app_token")

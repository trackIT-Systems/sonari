"""Ensure schedule user exists.

Revision ID: c7d8e9f0a1b2
Revises: d4e5f6a7b8c9
Create Date: 2026-09-16 14:55:00.000000

"""

import datetime
from typing import Sequence, Union
from uuid import uuid4

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c7d8e9f0a1b2"
down_revision: Union[str, None] = "d4e5f6a7b8c9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def get_or_create_user(bind, username: str) -> None:
    """Ensure a user exists. Creates if not present. Works for SQLite and PostgreSQL."""
    result = bind.execute(
        sa.text('SELECT id FROM "user" WHERE username = :username'),
        {"username": username},
    )
    if result.fetchone():
        return

    bind.execute(
        sa.text("""
            INSERT INTO "user" (id, email, username, hashed_password, name, is_active, is_superuser, is_verified, created_on)
            VALUES (:id, :email, :username, :hashed_password, :name, :is_active, :is_superuser, :is_verified, :created_on)
        """),
        {
            "id": str(uuid4()),
            "email": f"{username}@{username}.de",
            "username": username,
            "hashed_password": "",
            "name": "",
            "is_active": False,
            "is_superuser": False,
            "is_verified": True,
            "created_on": datetime.datetime.now(datetime.timezone.utc),
        },
    )


def upgrade() -> None:
    """Ensure the schedule service user exists."""
    bind = op.get_bind()
    get_or_create_user(bind, "schedule")


def downgrade() -> None:
    """Do not remove the user - it may have associated data."""
    pass

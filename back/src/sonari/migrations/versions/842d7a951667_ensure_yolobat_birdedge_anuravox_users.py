"""Ensure yolobat, birdedge, and anuravox users exist.

Revision ID: 842d7a951667
Revises: b468c2adfb7e
Create Date: 2026-03-11 08:18:15.691100

"""

import datetime
from typing import Sequence, Union
from uuid import uuid4

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "842d7a951667"
down_revision: Union[str, None] = "b468c2adfb7e"
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
    """Ensure yolobat, birdedge, and anuravox users exist."""
    bind = op.get_bind()
    get_or_create_user(bind, "yolobat")
    get_or_create_user(bind, "birdedge")
    get_or_create_user(bind, "anuravox")


def downgrade() -> None:
    """Do not remove users - they may have associated data."""
    pass

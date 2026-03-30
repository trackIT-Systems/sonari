"""App token model for Sonari-issued API credentials."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Optional
from uuid import UUID, uuid4

import sqlalchemy.orm as orm
from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, String

from sonari.models.base import Base
from sonari.models.user import User

__all__ = [
    "AppToken",
]


class AppToken(Base):
    """Opaque App token owned by a user (creator)."""

    __tablename__ = "app_token"
    __table_args__ = (CheckConstraint("can_read OR can_write", name="ck_app_token_can_read_or_write"),)

    user_id: orm.Mapped[UUID] = orm.mapped_column(
        ForeignKey("user.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title: orm.Mapped[str] = orm.mapped_column(String(255), nullable=False)
    secret_hash: orm.Mapped[str] = orm.mapped_column(String(1024), nullable=False)
    expires_at: orm.Mapped[Optional[datetime]] = orm.mapped_column(
        DateTime(timezone=True),
        nullable=True,
        default=None,
    )
    revoked_at: orm.Mapped[Optional[datetime]] = orm.mapped_column(
        DateTime(timezone=True),
        nullable=True,
        default=None,
    )
    can_read: orm.Mapped[bool] = orm.mapped_column(Boolean, nullable=False, default=True)
    can_write: orm.Mapped[bool] = orm.mapped_column(Boolean, nullable=False, default=True)
    id: orm.Mapped[UUID] = orm.mapped_column(primary_key=True, default_factory=uuid4, kw_only=False)

    if TYPE_CHECKING:
        pass

    user: orm.Mapped[User] = orm.relationship(
        User,
        back_populates="app_tokens",
        init=False,
    )

"""Schemas for Sonari app tokens."""

from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import Field, computed_field, field_validator

from sonari.schemas.base import BaseSchema


class AppTokenPermissions(str, Enum):
    """Scoped access for an App token (minted via OIDC)."""

    read = "read"
    write = "write"
    read_write = "read_write"


def app_token_permission_flags(p: AppTokenPermissions) -> tuple[bool, bool]:
    """Map permission enum to ``(can_read, can_write)``."""
    if p == AppTokenPermissions.read:
        return True, False
    if p == AppTokenPermissions.write:
        return False, True
    return True, True


class AppTokenCreate(BaseSchema):
    title: str = Field(max_length=255)
    expires_at: Optional[datetime] = None
    permissions: AppTokenPermissions = AppTokenPermissions.read_write

    @field_validator("title")
    @classmethod
    def title_stripped_nonempty(cls, v: str) -> str:
        s = v.strip()
        if not s:
            raise ValueError("title cannot be empty")
        if len(s) > 255:
            raise ValueError("title cannot exceed 255 characters")
        return s


class AppTokenPublic(BaseSchema):
    id: uuid.UUID
    title: str
    created_on: datetime
    expires_at: Optional[datetime] = None
    revoked_at: Optional[datetime] = None
    can_read: bool
    can_write: bool

    @computed_field
    @property
    def permissions(self) -> AppTokenPermissions:
        if self.can_read and self.can_write:
            return AppTokenPermissions.read_write
        if self.can_read:
            return AppTokenPermissions.read
        return AppTokenPermissions.write


class AppTokenCreated(AppTokenPublic):
    """Returned once when creating a token; includes the secret."""

    token: str

"""Schemas for handling Tags."""

from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field

from sonari.schemas.base import BaseSchema
from sonari.schemas.users import SimpleUser

__all__ = [
    "Tag",
    "TagCreate",
    "TagUpdate",
]


class TagCreate(BaseModel):
    """Schema for creating Tag objects."""

    key: str = Field(min_length=1, max_length=255)
    """Key of the tag."""

    value: str = Field(min_length=1, max_length=255)
    """Value of the tag."""

    created_by: SimpleUser | None = None
    """The user who created the tag."""


class Tag(BaseSchema):
    """Schema for Tag objects returned to the user."""

    id: int = Field(..., exclude=True)
    """Database ID of the tag."""

    key: str
    """Key of the tag."""

    value: str
    """Value of the tag."""

    created_by_id: Optional[UUID] = None
    """ID of the user that created this tag"""

    created_by: Optional[SimpleUser] = None
    """The user object of the tag creator"""


class TagUpdate(BaseModel):
    """Schema for updating Tag objects."""

    key: str | None = Field(default=None, min_length=1, max_length=255)
    """Key of the tag."""

    value: str | None = Field(default=None, min_length=1, max_length=255)
    """Value of the tag."""

    created_by: SimpleUser | None = None
    """The user who created the tag."""

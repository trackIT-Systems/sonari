"""Schemas for handling Notes."""

from typing import TYPE_CHECKING, Optional
from uuid import UUID

from pydantic import BaseModel, Field

from sonari.schemas.base import BaseSchema
from sonari.schemas.users import SimpleUser

if TYPE_CHECKING:
    from sonari.schemas.annotation_tasks import AnnotationTask
    

__all__ = ["Note", "NoteUpdate", "NoteCreate"]


class NoteCreate(BaseModel):
    """Schema for creating notes.

    This schema is used when creating notes from the API as the user
    does not need to provide the id of the user who created the note.
    """

    message: str = Field(min_length=1, max_length=1000)

    is_issue: bool = False


class Note(BaseSchema):
    """Schema for Note objects returned to the user."""

    id: int
    """The database id of the note."""

    message: str
    """The message of the note."""

    is_issue: bool
    """Whether the note is an issue."""

    annotation_task_id: int
    """The id of the annotation task this note belongs to."""

    created_by_id: UUID
    """User ID of the user that created this node"""

    created_by: SimpleUser | None
    """The user who created the note."""

    annotation_task: Optional["AnnotationTask"] = None
    """Annotation task the note is attached to"""

    def __hash__(self):
        """Hash the Note object."""
        return hash(self.id)


class NoteUpdate(BaseModel):
    """Schema for updating notes."""

    message: str | None = Field(None, min_length=1, max_length=1000)
    """The message of the note."""

    is_issue: bool | None = None
    """Whether the note is an issue."""

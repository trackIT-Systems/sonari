"""Schemas for Annotation Projects."""

from typing import TYPE_CHECKING, Optional

from pydantic import BaseModel

from sonari.schemas.base import BaseSchema
from sonari.schemas.tags import Tag

if TYPE_CHECKING:
    from sonari.schemas.annotation_tasks import AnnotationTask

__all__ = [
    "AnnotationProject",
    "AnnotationProjectCreate",
    "AnnotationProjectUpdate",
    "AnnotationProjectProgress",
]


class AnnotationProjectCreate(BaseModel):
    """Schema for creating an annotation project."""

    name: str
    """Name of the annotation project."""

    description: str
    """A description of the annotation project."""

    annotation_instructions: str | None = None
    """Project instructions for annotating."""


class AnnotationProject(BaseSchema):
    """Schema for an annotation project."""

    id: int
    """Database ID of the annotation project."""

    name: str
    """Name of the annotation project."""

    description: str
    """A description of the annotation project."""

    annotation_instructions: str | None = None
    """Project instructions for annotating."""

    tags: Optional[list[Tag]] = None
    """Tags to be used throughout the annotation project."""

    annotation_tasks: Optional[list["AnnotationTask"]] = None
    """Annotation tasks related to this project the annotation project."""


class AnnotationProjectUpdate(BaseModel):
    """Schema for updating an annotation project."""

    name: str | None = None
    """Name of the annotation project."""

    description: str | None = None
    """A description of the annotation project."""

    annotation_instructions: str | None = None
    """Project instructions for annotating."""


class AnnotationProjectProgress(BaseModel):
    """Schema for annotation project progress statistics."""

    total: int
    """Total number of tasks in the project."""

    verified: int
    """Number of tasks with verified status."""

    rejected: int
    """Number of tasks with rejected status."""

    completed: int
    """Number of tasks with completed status."""

    assigned: int
    """Number of tasks with assigned status."""

    pending: int
    """Number of tasks with no done status (pending or only assigned)."""

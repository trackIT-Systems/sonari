"""Schemas for Annotation Projects."""

from typing import TYPE_CHECKING, Literal, Optional
from uuid import UUID

from pydantic import BaseModel

from sonari.schemas.base import BaseSchema
from sonari.schemas.tags import Tag

if TYPE_CHECKING:
    from sonari.schemas.annotation_tasks import AnnotationTask

GuidedTourVariant = Literal["bird", "bat"]

__all__ = [
    "AnnotationProject",
    "AnnotationProjectCreate",
    "AnnotationProjectUpdate",
    "AnnotationProjectProgress",
    "GuidedTourEnsureRequest",
    "GuidedTourEnsureResponse",
    "GuidedTourAvailableResponse",
    "GuidedTourProgress",
    "GuidedTourVariant",
    "SpeciesTagCount",
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

    is_guided_tour: bool = False
    """Whether this project is a personal guided tour (hidden from project list)."""

    guided_tour_owner_user_id: UUID | None = None
    """Owner of a guided tour clone."""

    guided_tour_variant: GuidedTourVariant | None = None
    """bird or bat for guided tour templates and personal clones."""

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


class GuidedTourEnsureRequest(BaseModel):
    """Request body for ensuring a user's guided tour project exists."""

    variant: GuidedTourVariant
    reset: bool = False
    """If true, delete and re-clone the tour from the template."""


class GuidedTourEnsureResponse(BaseModel):
    """Response after ensuring a guided tour project."""

    annotation_project_id: int
    first_annotation_task_id: int | None
    resume_annotation_task_id: int | None = None
    """First task without a status badge (where "keep going" continues)."""
    created: bool
    variant: GuidedTourVariant


class GuidedTourProgress(BaseModel):
    """The current user's personal tour for one variant."""

    variant: GuidedTourVariant
    annotation_project_id: int
    total_tasks: int
    done_tasks: int
    resume_annotation_task_id: int | None


class GuidedTourAvailableResponse(BaseModel):
    """Guided tour variants available on this server."""

    variants: list[GuidedTourVariant]
    tours: list[GuidedTourProgress] = []
    """Tours the current user has already started."""


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


class SpeciesTagCount(BaseModel):
    """Count of a species tag across sound event annotations in a project.

    Status fields are mutually exclusive: each sound event annotation is
    classified by its parent task's highest-priority badge
    (verified > rejected > accepted/completed > unsure/assigned > no status).
    Their sum equals ``count``.
    """

    key: str
    """Tag key."""

    value: str
    """Tag value."""

    count: int
    """Number of sound event annotations with this tag."""

    accepted: int = 0
    """Annotations on tasks with completed (accepted) as primary status."""

    verified: int = 0
    """Annotations on tasks with verified as primary status."""

    unsure: int = 0
    """Annotations on tasks with assigned (unsure) as primary status."""

    rejected: int = 0
    """Annotations on tasks with rejected as primary status."""

    no_status: int = 0
    """Annotations on tasks with no status badges."""

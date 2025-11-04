"""Schemas for annotation tasks."""

from typing import TYPE_CHECKING, Optional

from pydantic import BaseModel, Field, model_validator
from soundevent.data import AnnotationState

from sonari.schemas.base import BaseSchema
from sonari.schemas.features import Feature
from sonari.schemas.tags import Tag
from sonari.schemas.notes import Note
from sonari.schemas.users import SimpleUser

if TYPE_CHECKING:
    from sonari.schemas.annotation_projects import AnnotationProject
    from sonari.schemas.recordings import Recording
    from sonari.schemas.sound_event_annotations import SoundEventAnnotation
    from sonari.schemas.notes import Note

__all__ = [
    "AnnotationStatusBadge",
    "AnnotationStatusBadgeUpdate",
    "AnnotationTask",
    "AnnotationTaskCreate",
    "AnnotationTaskUpdate",
    "AnnotationTaskTag",
]


class AnnotationTaskCreate(BaseModel):
    """Schema for creating a new task."""

    start_time: float
    """The start time of the audio segment in seconds."""

    end_time: float
    """The end time of the audio segment in seconds."""

    @model_validator(mode="after")
    def validate_times(self):
        """Validate that start_time < end_time."""
        if self.start_time > self.end_time:
            raise ValueError("start_time must be less than end_time")
        return self


class AnnotationStatusBadge(BaseSchema):
    """Schema for a task status badge."""

    state: AnnotationState
    """State of the task."""

    user: SimpleUser | None
    """User to whom the status badge refers."""


class AnnotationStatusBadgeUpdate(BaseModel):
    """Schema for updating a task status badge."""

    state: AnnotationState | None = None
    """State of the task."""


class AnnotationTaskTag(BaseSchema):
    """Schema for an AnnotationTaskTag."""

    created_by: SimpleUser | None
    """User who created this annotation tag."""

    tag: Tag
    """Tag attached to this annotation."""


class AnnotationTask(BaseSchema):
    """Schema for an annotation task.

    This schema combines what were previously separate Clip, ClipAnnotation,
    and AnnotationTask schemas.
    """

    id: int
    """Database ID of the task."""

    annotation_project_id: int
    """The ID of the annotation project to which the task belongs."""

    recording_id: int
    """Recording from which this task's audio segment is taken."""

    start_time: float
    """The start time of the audio segment in seconds."""

    end_time: float
    """The end time of the audio segment in seconds."""

    annotation_project: Optional["AnnotationProject"] = None
    """The annotation project this task belongs to"""

    recording: Optional["Recording"] = None
    """The recording that task is attached to"""

    sound_event_annotations: Optional[list["SoundEventAnnotation"]] = None
    """All sound event annotations of that task"""

    tags: Optional[list[Tag]] = None
    """All tags of that task"""
    
    notes: Optional[list["Note"]] = None
    """ All notes of that task"""

    features: Optional[list[Feature]] = None
    """Features of that task"""

    status_badges: list[AnnotationStatusBadge] = Field(default_factory=list)
    """Status badges for the task."""


class AnnotationTaskUpdate(BaseModel):
    """Schema for updating a task."""

    start_time: float | None = None
    """The start time of the audio segment in seconds."""

    end_time: float | None = None
    """The end time of the audio segment in seconds."""

"""Schemas for Sound Event Annotation related objects."""

from typing import TYPE_CHECKING, Optional
from uuid import UUID

from pydantic import BaseModel, Field
from soundevent import Geometry

from sonari.schemas.base import BaseSchema
from sonari.schemas.features import Feature
from sonari.schemas.recordings import Recording
from sonari.schemas.tags import Tag, TagCreate
from sonari.schemas.users import SimpleUser

if TYPE_CHECKING:
    from sonari.schemas.annotation_tasks import AnnotationTask

__all__ = [
    "SoundEventAnnotation",
    "SoundEventAnnotationCreate",
    "SoundEventAnnotationTag",
    "SoundEventAnnotationUpdate",
]


class SoundEventAnnotationTag(BaseModel):
    """Schema for a SoundEventAnnotationTag."""

    tag: Tag
    """Tag attached to this annotation."""

    created_by: SimpleUser | None
    """User who created this annotation."""


class SoundEventAnnotationCreate(BaseModel):
    """Schema for data required to create a SoundEventAnnotation."""

    geometry: Geometry = Field(..., discriminator="type")
    """Geometry of this annotation."""

    tags: list[TagCreate] = Field(default_factory=list)
    """Tags attached to this annotation."""


class SoundEventAnnotation(BaseSchema):
    """Schema for a SoundEventAnnotation.

    This schema combines what were previously separate SoundEvent and
    SoundEventAnnotation models.
    """

    id: int
    """Database ID of this annotation."""

    annotation_task_id: int
    """The ID of the annotation task to which this annotation belongs."""

    recording_id: int
    """Recording this sound event is in."""

    geometry_type: str
    """The type of geometry used to mark the RoI of the sound event."""

    geometry: Geometry = Field(..., discriminator="type")
    """The geometry of the mark used to mark the RoI of the sound event."""

    created_by_id: UUID
    """UUID of the user that created the sound event annotation"""

    tags: list[Tag] = Field(default_factory=list)
    """Tags attached to this annotation."""

    features: list[Feature] = Field(default_factory=list)
    """Features associated with this sound event."""

    annotation_task: Optional["AnnotationTask"] = None
    """The annotation task this sound event annotation belongs to"""

    recording: Optional[Recording] = None
    """The recordging this sound event annotation belongs to"""

    created_by: SimpleUser | None
    """User who created this annotation."""


class SoundEventAnnotationUpdate(BaseSchema):
    """Schema for data required to update a SoundEventAnnotation."""

    geometry: Geometry = Field(..., discriminator="type")
    """Geometry of this annotation."""

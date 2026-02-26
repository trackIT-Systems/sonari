"""Schemas for Sound Event Annotation related objects."""

from typing import TYPE_CHECKING, Optional
from uuid import UUID

from pydantic import BaseModel, Field, model_validator
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


def _validate_geometry_non_negative_time(geometry: Geometry) -> None:
    """Raise ValueError if geometry has negative time coordinates."""
    if not hasattr(geometry, "coordinates"):
        return
    coords = geometry.coordinates
    # TimeInterval: [start_time, end_time]
    if geometry.type == "TimeInterval" and isinstance(coords, (list, tuple)) and len(coords) >= 2:
        if coords[0] < 0 or coords[1] < 0:
            raise ValueError("Time coordinates must be non-negative")
    # TimeStamp: single time value
    elif geometry.type == "TimeStamp":
        val = coords if isinstance(coords, (int, float)) else (coords[0] if coords else None)
        if val is not None and val < 0:
            raise ValueError("Time coordinates must be non-negative")
    # Point: [time, frequency]
    elif geometry.type == "Point" and isinstance(coords, (list, tuple)) and len(coords) >= 1:
        if coords[0] < 0:
            raise ValueError("Time coordinates must be non-negative")
    # BoundingBox: [start_time, lower_freq, end_time, higher_freq]
    elif geometry.type == "BoundingBox" and isinstance(coords, (list, tuple)) and len(coords) >= 4:
        if coords[0] < 0 or coords[2] < 0:
            raise ValueError("Time coordinates must be non-negative")


class SoundEventAnnotationCreate(BaseModel):
    """Schema for data required to create a SoundEventAnnotation."""

    geometry: Geometry = Field(..., discriminator="type")
    """Geometry of this annotation."""

    tags: list[TagCreate] = Field(default_factory=list)
    """Tags attached to this annotation."""

    @model_validator(mode="after")
    def validate_geometry_times(self):
        """Validate that geometry time coordinates are non-negative."""
        _validate_geometry_non_negative_time(self.geometry)
        return self


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

    tags: Optional[list[Tag]] = None
    """Tags attached to this annotation."""

    features: Optional[list[Feature]] = None
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

    @model_validator(mode="after")
    def validate_geometry_times(self):
        """Validate that geometry time coordinates are non-negative."""
        _validate_geometry_non_negative_time(self.geometry)
        return self

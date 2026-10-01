"""Schemas for annotation tasks."""

from typing import TYPE_CHECKING, Optional

from pydantic import BaseModel, model_validator
from soundevent.data import AnnotationState

from sonari.schemas.base import BaseSchema
from sonari.schemas.features import Feature
from sonari.schemas.tags import Tag, TagCreate
from sonari.schemas.users import SimpleUser

if TYPE_CHECKING:
    from sonari.schemas.annotation_projects import AnnotationProject
    from sonari.schemas.notes import Note
    from sonari.schemas.recordings import Recording
    from sonari.schemas.sound_event_annotations import SoundEventAnnotation

__all__ = [
    "AnnotationStatusBadge",
    "AnnotationStatusBadgeUpdate",
    "AnnotationTask",
    "AnnotationTaskBulkAddBadge",
    "AnnotationTaskBulkDeleteSoundEvents",
    "AnnotationTaskBulkFailure",
    "AnnotationTaskBulkReplaceSoundEventTags",
    "AnnotationTaskBulkResult",
    "AnnotationTaskBulkTagSummary",
    "SoundEventTagBulkCount",
    "SoundEventTagStats",
    "AnnotationTaskCreate",
    "AnnotationTaskUpdate",
    "AnnotationTaskTag",
    "AnnotationTaskIndex",
    "AnnotationTaskStats",
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


class SoundEventTagStats(BaseModel):
    """Confidence statistics of one tag over the sound events of a task."""

    key: str
    """Key of the tag."""

    value: str
    """Value of the tag."""

    count: int
    """Number of sound events in the task with this tag."""

    median_confidence: float | None = None
    """Median confidence over those sound events (None if none has one)."""

    max_confidence: float | None = None
    """Maximum confidence over those sound events (None if none has one)."""


class AnnotationTaskTag(BaseSchema):
    """Schema for an AnnotationTaskTag."""

    created_by: SimpleUser | None
    """User who created this annotation tag."""

    tag: Tag
    """Tag attached to this annotation."""


class AnnotationTask(BaseSchema):
    """Schema for an annotation task."""

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

    sound_event_tags: Optional[list[Tag]] = None
    """Aggregated tags from sound event annotations (without loading full sound events)"""

    sound_event_tag_stats: Optional[list[SoundEventTagStats]] = None
    """Per-tag confidence statistics over the task's sound events"""

    notes: Optional[list["Note"]] = None
    """ All notes of that task"""

    features: Optional[list[Feature]] = None
    """Features of that task"""

    status_badges: Optional[list[AnnotationStatusBadge]] = None
    """Status badges for the task."""

    @model_validator(mode="after")
    def clip_sound_event_geometries(self):
        """Clip nested annotation geometries to task bounds on read."""
        if not self.sound_event_annotations or not self.recording:
            return self

        from sonari.geometry.bounds import clip_geometry

        freq_max = self.recording.samplerate / 2
        clipped_annotations = []
        for annotation in self.sound_event_annotations:
            clipped_geometry = clip_geometry(
                annotation.geometry,
                time_min=self.start_time,
                time_max=self.end_time,
                freq_max=freq_max,
            )
            if clipped_geometry is None:
                continue
            update = {"geometry": clipped_geometry}
            if clipped_geometry.type != annotation.geometry_type:
                update["geometry_type"] = clipped_geometry.type
            clipped_annotations.append(
                annotation.model_copy(update=update)
            )

        return self.model_copy(
            update={"sound_event_annotations": clipped_annotations}
        )


class AnnotationTaskUpdate(BaseModel):
    """Schema for updating a task."""

    start_time: float | None = None
    """The start time of the audio segment in seconds."""

    end_time: float | None = None
    """The end time of the audio segment in seconds."""


class AnnotationTaskIndex(BaseModel):
    """Minimal schema for annotation task index (navigation only)."""

    id: int
    """Database ID of the task."""

    recording_id: int
    """Recording from which this task's audio segment is taken."""

    start_time: float
    """The start time of the audio segment in seconds."""


class AnnotationTaskStats(BaseModel):
    """Schema for annotation task aggregate statistics."""

    total: int
    """Total number of tasks."""

    done_count: int
    """Number of tasks that are done (verified, rejected, or completed)."""

    verified_count: int
    """Number of tasks with verified status."""

    rejected_count: int
    """Number of tasks with rejected status."""

    completed_count: int
    """Number of tasks with completed status."""

    pending_count: int
    """Number of tasks that are pending (not done)."""

    assigned_count: int
    """Number of tasks with assigned status."""


class AnnotationTaskBulkFailure(BaseModel):
    """A single task failure during a bulk operation."""

    annotation_task_id: int
    message: str


class AnnotationTaskBulkResult(BaseModel):
    """Result summary for bulk annotation task operations."""

    tasks_targeted: int
    tasks_updated: int
    tasks_skipped: int
    sound_events_updated: int
    sound_events_skipped: int = 0
    failures: list[AnnotationTaskBulkFailure]


class _AnnotationTaskBulkTarget(BaseModel):
    """Optional explicit task IDs; omit to target all tasks matching the request filter."""

    annotation_task_ids: list[int] | None = None


class AnnotationTaskBulkAddBadge(_AnnotationTaskBulkTarget):
    """Bulk-add a status badge to annotation tasks."""

    state: AnnotationState


class AnnotationTaskBulkReplaceSoundEventTags(_AnnotationTaskBulkTarget):
    """Bulk replace sound event annotation tags within annotation tasks."""

    old_tag: TagCreate | None = None
    new_tag: TagCreate | None = None
    replace_all: bool = False
    add_to_tagged: bool = False


class AnnotationTaskBulkDeleteSoundEvents(_AnnotationTaskBulkTarget):
    """Bulk delete sound event annotations carrying a tag within annotation tasks."""

    tag: TagCreate


class SoundEventTagBulkCount(BaseModel):
    """Distinct sound event tag with occurrence count across targeted tasks."""

    key: str
    value: str
    count: int


class AnnotationTaskBulkTagSummary(_AnnotationTaskBulkTarget):
    """Request body for aggregating sound event tags on bulk targets."""

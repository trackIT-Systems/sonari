"""Schemas for the original state and edit history of sound events."""

import datetime
from typing import Optional
from uuid import UUID

from pydantic import Field

from sonari.schemas.annotation_projects import PredictionCorrectionCount, PredictionCorrectionTarget
from sonari.schemas.base import BaseSchema

__all__ = [
    "PredictionBackfillStatus",
    "PredictionHistoryStats",
    "SoundEventChange",
    "SoundEventOriginal",
    "SoundEventOriginalTag",
    "SoundEventTaskHistory",
]


class SoundEventOriginalTag(BaseSchema):
    """A tag of a sound event's state before its first user edit."""

    tag_id: Optional[int] = None
    """Current id of the tag, None once it was deleted."""

    tag_key: str
    """Key of the tag at that time."""

    tag_value: str
    """Value of the tag at that time."""

    confidence: Optional[float] = None
    """Detector confidence for this tag, if the import had one."""


class SoundEventOriginal(BaseSchema):
    """State of an imported sound event before its first user edit."""

    id: int
    annotation_task_id: int

    sound_event_annotation_id: Optional[int] = None
    """None if the event was already gone when the original was recorded."""

    created_by_id: Optional[UUID] = None
    """Owner before the edit, e.g. the detector user."""

    created_by_username: Optional[str] = None

    source: str
    """``first_edit`` or ``guano``."""

    geometry_type: str
    start_time: float
    end_time: float
    low_freq: Optional[float] = None
    high_freq: Optional[float] = None
    created_on: datetime.datetime
    tags: list[SoundEventOriginalTag] = Field(default_factory=list)


class SoundEventChange(BaseSchema):
    """One user edit, merged per event and edit session."""

    id: int
    annotation_task_id: int
    sound_event_annotation_id: int
    user_id: Optional[UUID] = None
    username: Optional[str] = None
    edit_id: UUID

    action: str
    """created, deleted, geometry_changed, tag_added, tag_removed or tag_replaced."""

    old_tag_id: Optional[int] = None
    old_tag_key: Optional[str] = None
    old_tag_value: Optional[str] = None
    new_tag_id: Optional[int] = None
    new_tag_key: Optional[str] = None
    new_tag_value: Optional[str] = None

    old_start_time: Optional[float] = None
    old_end_time: Optional[float] = None
    old_low_freq: Optional[float] = None
    old_high_freq: Optional[float] = None
    new_start_time: Optional[float] = None
    new_end_time: Optional[float] = None
    new_low_freq: Optional[float] = None
    new_high_freq: Optional[float] = None

    created_on: datetime.datetime
    """Time of the first edit in this row."""

    updated_on: Optional[datetime.datetime] = None
    """Time of the last edit merged into this row."""


class SoundEventTaskHistory(BaseSchema):
    """Originals and edit history of one annotation task's sound events."""

    annotation_task_id: int
    originals: list[SoundEventOriginal]
    changes: list[SoundEventChange]


class PredictionBackfillStatus(BaseSchema):
    """State of a project's GUANO backfill."""

    state: str
    """running, done or failed."""

    started_on: datetime.datetime
    updated_on: datetime.datetime
    finished_on: Optional[datetime.datetime] = None
    reviewed_tasks: int = 0
    recordings: int = 0

    recordings_with_source: int = 0
    """Reviewed recordings with a GUANO file holding the predictions."""

    match_rate: Optional[float] = None
    """Share of the detector's events that matched a GUANO detection exactly."""

    originals_created: int = 0
    error: Optional[str] = None

    stale: bool = False
    """A run that stopped updating, e.g. because its worker restarted. It can be started again."""


class PredictionHistoryStats(BaseSchema):
    """What reviewers did with the predictions in a project's completed and verified tasks.

    A prediction is an imported sound event with a detector confidence. Untouched ones count
    as confirmed; edited ones are compared with their stored original.
    """

    reviewed_tasks: int
    """Tasks marked completed or verified."""

    predicted_events: int
    """Predicted sound events in the reviewed tasks, including deleted ones with an original."""

    edited_events: int
    """Predicted sound events that reviewers changed or deleted."""

    species: list[PredictionCorrectionCount]
    """Outcomes per predicted tag, most predicted first."""

    added: list[PredictionCorrectionTarget]
    """Tags of sound events reviewers drew themselves."""

    backfill: Optional[PredictionBackfillStatus] = None
    """The last GUANO backfill, if one ran."""

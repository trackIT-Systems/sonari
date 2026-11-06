"""Schemas for sound event versions (edit history) and prediction stats."""

import datetime
from typing import Optional
from uuid import UUID

from pydantic import Field
from soundevent import Geometry

from sonari.schemas.annotation_projects import PredictionCorrectionCount, PredictionCorrectionTarget
from sonari.schemas.base import BaseSchema

__all__ = [
    "PredictionBackfillStatus",
    "PredictionHistoryStats",
    "SoundEventLiveState",
    "SoundEventTaskHistory",
    "SoundEventVersion",
    "SoundEventVersionTag",
]


class SoundEventVersionTag(BaseSchema):
    """A tag of a sound event version."""

    key: str
    value: str

    confidence: Optional[float] = None
    """Detector confidence for this tag, if the version had one."""


class SoundEventVersion(BaseSchema):
    """An old state of a sound event, replaced by an edit or ended by a delete."""

    id: int

    version_of_id: Optional[int] = None
    """The event's id; None for GUANO predictions whose event was already gone."""

    annotation_task_id: int
    geometry_type: str
    geometry: Geometry = Field(..., discriminator="type")
    tags: list[SoundEventVersionTag] = Field(default_factory=list)

    created_by_id: Optional[UUID] = None
    """Owner of this state, e.g. the detector user for an import."""

    created_by_username: Optional[str] = None

    created_on: datetime.datetime
    """When the event was created."""

    edit_id: Optional[UUID] = None
    """Edit session that produced this state; None for imports."""

    superseded_on: datetime.datetime
    superseded_by_id: Optional[UUID] = None
    superseded_by_username: Optional[str] = None

    superseded_edit_id: Optional[UUID] = None
    """Edit session that replaced this state; None for GUANO versions."""

    version_reason: str
    """``edited``, ``deleted`` (the event's last state) or ``guano``."""


class SoundEventLiveState(BaseSchema):
    """When a task's live sound event got its current state."""

    id: int
    edit_id: Optional[UUID] = None
    """Edit session that produced the state; None for imports and older edits."""

    created_on: datetime.datetime
    created_by_username: Optional[str] = None


class SoundEventTaskHistory(BaseSchema):
    """Versions of one annotation task's sound events, oldest replaced first."""

    annotation_task_id: int
    versions: list[SoundEventVersion]
    live: list[SoundEventLiveState]


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
    """GUANO versions stored by the run."""

    error: Optional[str] = None

    stale: bool = False
    """A run that stopped updating, e.g. because its worker restarted. It can be started again."""


class PredictionHistoryStats(BaseSchema):
    """What reviewers did with the predictions in a project's completed and verified tasks.

    A prediction is an imported sound event with a detector confidence. Untouched ones count
    as confirmed; edited ones are compared with their oldest version.
    """

    reviewed_tasks: int
    """Tasks marked completed or verified."""

    predicted_events: int
    """Predicted sound events in the reviewed tasks, including deleted ones with a version."""

    edited_events: int
    """Predicted sound events that reviewers changed or deleted."""

    species: list[PredictionCorrectionCount]
    """Outcomes per predicted tag, most predicted first."""

    added: list[PredictionCorrectionTarget]
    """Tags of sound events reviewers drew themselves."""

    backfill: Optional[PredictionBackfillStatus] = None
    """The last GUANO backfill, if one ran."""

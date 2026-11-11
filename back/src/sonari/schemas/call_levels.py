"""Schemas for reference calls of a tag in an annotation project."""

import datetime
from typing import Optional

from sonari.schemas.base import BaseSchema

__all__ = [
    "CallLevelJobStatus",
    "ReferenceCall",
    "ReferenceCalls",
]


class CallLevelJobStatus(BaseSchema):
    """Last search for reference calls of a tag in a project."""

    state: str
    """running, done or failed."""

    started_on: datetime.datetime
    updated_on: datetime.datetime
    finished_on: Optional[datetime.datetime] = None

    total: int = 0
    """Calls the run set out to measure."""

    done: int = 0
    """Calls the run has gone through, measured or failed."""

    failed: int = 0
    """Calls whose audio could not be measured."""

    error: Optional[str] = None
    stale: bool = False
    """Still marked running but without progress for a while: the server probably restarted."""


class ReferenceCall(BaseSchema):
    """A reference call: one of the clearest, loudest calls of a species in a project."""

    sound_event_annotation_id: int
    annotation_task_id: int
    recording_id: int
    recording_path: str
    samplerate: int
    channels: int
    time_expansion: float
    recording_duration: float
    start_time: float
    end_time: float
    low_freq: float
    high_freq: float
    peak_dbfs: float
    rms_dbfs: Optional[float] = None
    snr_db: Optional[float] = None
    clipped: bool
    channel: int
    """Channel the call was measured on, where it is clearest."""


class ReferenceCalls(BaseSchema):
    """Reference calls of a tag in a project and how thoroughly they were searched for."""

    calls: list[ReferenceCall]
    recordings: int
    """Recordings holding BoundingBox calls with the tag."""

    searched_recordings: int
    """Recordings in which at least one call is measured."""

    total_calls: int
    measured_calls: int
    job: Optional[CallLevelJobStatus] = None

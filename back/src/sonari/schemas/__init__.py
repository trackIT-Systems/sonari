"""Schemas for Sonari data models.

The Sonari Python API returns these schemas to the user, and they are
the main way that the user interacts with the data.

Schemas are defined using Pydantic, and are used to validate data before
it is inserted into the database, and also to validate data before it is
returned to the user.

Most database models have multiple schemas, a main schema that is used
to return data to the user, and a create and update schema that is used
to validate data before it is inserted into the database.
"""

from sonari.schemas.annotation_projects import (
    AnnotationProject,
    AnnotationProjectCreate,
    AnnotationProjectUpdate,
)
from sonari.schemas.annotation_tasks import (
    AnnotationStatusBadge,
    AnnotationStatusBadgeUpdate,
    AnnotationTask,
    AnnotationTaskCreate,
    AnnotationTaskUpdate,
)
from sonari.schemas.audio import AudioParameters
from sonari.schemas.base import Page
from sonari.schemas.clip_annotations import (
    ClipAnnotation,
    ClipAnnotationCreate,
    ClipAnnotationTag,
    ClipAnnotationUpdate,
)
from sonari.schemas.clips import Clip, ClipCreate, ClipUpdate
from sonari.schemas.datasets import (
    Dataset,
    DatasetCreate,
    DatasetFile,
    DatasetRecording,
    DatasetRecordingCreate,
    DatasetUpdate,
    FileState,
)
from sonari.schemas.features import (
    Feature,
    FeatureName,
    FeatureNameCreate,
    FeatureNameUpdate,
)
from sonari.schemas.notes import Note, NoteCreate, NoteUpdate
from sonari.schemas.recordings import (
    Recording,
    RecordingCreate,
    RecordingTag,
    RecordingUpdate,
)
from sonari.schemas.sound_event_annotations import (
    SoundEventAnnotation,
    SoundEventAnnotationCreate,
    SoundEventAnnotationTag,
    SoundEventAnnotationUpdate,
)
from sonari.schemas.sound_events import (
    SoundEvent,
    SoundEventCreate,
    SoundEventUpdate,
)
from sonari.schemas.spectrograms import (
    AmplitudeParameters,
    Scale,
    SpectrogramParameters,
    STFTParameters,
    Window,
)
from sonari.schemas.tags import Tag, TagCreate, TagUpdate
from sonari.schemas.users import SimpleUser, UserCreate, UserUpdate

__all__ = [
    "AmplitudeParameters",
    "AnnotationProject",
    "AnnotationProjectCreate",
    "AnnotationProjectUpdate",
    "AnnotationStatusBadge",
    "AnnotationStatusBadgeUpdate",
    "AnnotationTask",
    "AnnotationTaskCreate",
    "AnnotationTaskUpdate",
    "AudioParameters",
    "Clip",
    "ClipAnnotation",
    "ClipAnnotationCreate",
    "ClipAnnotationTag",
    "ClipAnnotationUpdate",
    "ClipCreate",
    "ClipUpdate",
    "Dataset",
    "DatasetCreate",
    "DatasetFile",
    "DatasetRecording",
    "DatasetRecordingCreate",
    "DatasetUpdate",
    "Feature",
    "FeatureName",
    "FeatureNameCreate",
    "FeatureNameUpdate",
    "FileState",
    "Note",
    "NoteCreate",
    "NoteUpdate",
    "Page",
    "Recording",
    "RecordingCreate",
    "RecordingTag",
    "RecordingUpdate",
    "STFTParameters",
    "Scale",
    "SimpleUser",
    "SoundEvent",
    "SoundEventAnnotation",
    "SoundEventAnnotationCreate",
    "SoundEventAnnotationTag",
    "SoundEventAnnotationUpdate",
    "SoundEventCreate",
    "SoundEventUpdate",
    "SpectrogramParameters",
    "Tag",
    "TagCreate",
    "TagUpdate",
    "UserCreate",
    "UserUpdate",
    "Window",
]

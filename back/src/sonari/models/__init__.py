"""Module defining the main database models of sonari.

We are using SQLAlchemy to define our database models. The models are
defined in separate files, and then imported into this module. This
allows us to keep the models organized, and also allows us to import the
models into other modules without having to import the entire database
module.
"""

from sonari.models.annotation_project import (
    AnnotationProject,
    AnnotationProjectTag,
)
from sonari.models.annotation_task import (
    AnnotationStatusBadge,
    AnnotationTask,
)
from sonari.models.base import Base
from sonari.models.clip import Clip, ClipFeature
from sonari.models.clip_annotation import (
    ClipAnnotation,
    ClipAnnotationNote,
    ClipAnnotationTag,
)
from sonari.models.dataset import Dataset, DatasetRecording
from sonari.models.event_handlers import setup_model_events
from sonari.models.feature import FeatureName
from sonari.models.note import Note
from sonari.models.recording import (
    Recording,
    RecordingFeature,
    RecordingNote,
    RecordingOwner,
    RecordingTag,
)
from sonari.models.sound_event import SoundEvent, SoundEventFeature
from sonari.models.sound_event_annotation import (
    SoundEventAnnotation,
    SoundEventAnnotationNote,
    SoundEventAnnotationTag,
)
from sonari.models.tag import Tag
from sonari.models.token import AccessToken
from sonari.models.user import User

setup_model_events()

__all__ = [
    "AccessToken",
    "AnnotationProject",
    "AnnotationProjectTag",
    "AnnotationStatusBadge",
    "AnnotationTask",
    "Base",
    "Clip",
    "ClipAnnotation",
    "ClipAnnotationNote",
    "ClipAnnotationTag",
    "ClipFeature",
    "Dataset",
    "DatasetRecording",
    "FeatureName",
    "Note",
    "Recording",
    "RecordingFeature",
    "RecordingNote",
    "RecordingOwner",
    "RecordingTag",
    "SoundEvent",
    "SoundEventAnnotation",
    "SoundEventAnnotationNote",
    "SoundEventAnnotationTag",
    "SoundEventFeature",
    "Tag",
    "User",
]

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
    AnnotationTaskFeature,
    AnnotationTaskTag,
)
from sonari.models.base import Base
from sonari.models.dataset import Dataset, DatasetRecording
from sonari.models.note import Note
from sonari.models.recording import (
    Recording,
    RecordingFeature,
    RecordingOwner,
    RecordingTag,
)
from sonari.models.sound_event_annotation import (
    SoundEventAnnotation,
    SoundEventAnnotationFeature,
    SoundEventAnnotationTag,
)
from sonari.models.tag import Tag
from sonari.models.token import AccessToken
from sonari.models.user import User

__all__ = [
    "AccessToken",
    "AnnotationProject",
    "AnnotationProjectTag",
    "AnnotationStatusBadge",
    "AnnotationTask",
    "AnnotationTaskFeature",
    "AnnotationTaskTag",
    "Base",
    "Dataset",
    "DatasetRecording",
    "Note",
    "Recording",
    "RecordingFeature",
    "RecordingOwner",
    "RecordingTag",
    "SoundEventAnnotation",
    "SoundEventAnnotationFeature",
    "SoundEventAnnotationTag",
    "Tag",
    "User",
]

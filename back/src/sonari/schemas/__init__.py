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
from sonari.schemas.clip_evaluations import (
    ClipEvaluation,
    ClipEvaluationCreate,
    ClipEvaluationUpdate,
)
from sonari.schemas.clip_predictions import (
    ClipPrediction,
    ClipPredictionCreate,
    ClipPredictionTag,
    ClipPredictionUpdate,
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
from sonari.schemas.evaluation_sets import (
    EvaluationSet,
    EvaluationSetCreate,
    EvaluationSetUpdate,
)
from sonari.schemas.evaluations import (
    Evaluation,
    EvaluationCreate,
    EvaluationUpdate,
)
from sonari.schemas.features import (
    Feature,
    FeatureName,
    FeatureNameCreate,
    FeatureNameUpdate,
)
from sonari.schemas.model_runs import ModelRun, ModelRunCreate, ModelRunUpdate
from sonari.schemas.notes import Note, NoteCreate, NoteUpdate
from sonari.schemas.plugin import PluginInfo
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
from sonari.schemas.sound_event_evaluations import (
    SoundEventEvaluation,
    SoundEventEvaluationCreate,
    SoundEventEvaluationUpdate,
)
from sonari.schemas.sound_event_predictions import (
    SoundEventPrediction,
    SoundEventPredictionCreate,
    SoundEventPredictionTag,
    SoundEventPredictionUpdate,
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
from sonari.schemas.tags import PredictedTag, Tag, TagCreate, TagUpdate
from sonari.schemas.user_runs import UserRun, UserRunCreate, UserRunUpdate
from sonari.schemas.users import SimpleUser, User, UserCreate, UserUpdate

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
    "ClipEvaluation",
    "ClipEvaluationCreate",
    "ClipEvaluationUpdate",
    "ClipPrediction",
    "ClipPredictionCreate",
    "ClipPredictionTag",
    "ClipPredictionUpdate",
    "ClipUpdate",
    "Dataset",
    "DatasetCreate",
    "DatasetFile",
    "DatasetRecording",
    "DatasetRecordingCreate",
    "DatasetUpdate",
    "Evaluation",
    "EvaluationCreate",
    "EvaluationSet",
    "EvaluationSetCreate",
    "EvaluationSetUpdate",
    "EvaluationUpdate",
    "Feature",
    "FeatureName",
    "FeatureNameCreate",
    "FeatureNameUpdate",
    "FileState",
    "ModelRun",
    "ModelRunCreate",
    "ModelRunUpdate",
    "Note",
    "NoteCreate",
    "NoteUpdate",
    "Page",
    "PluginInfo",
    "PredictedTag",
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
    "SoundEventEvaluation",
    "SoundEventEvaluationCreate",
    "SoundEventEvaluationUpdate",
    "SoundEventPrediction",
    "SoundEventPredictionCreate",
    "SoundEventPredictionTag",
    "SoundEventPredictionUpdate",
    "SoundEventUpdate",
    "SpectrogramParameters",
    "Tag",
    "TagCreate",
    "TagUpdate",
    "User",
    "UserCreate",
    "UserRun",
    "UserRunCreate",
    "UserRunUpdate",
    "UserUpdate",
    "Window",
]

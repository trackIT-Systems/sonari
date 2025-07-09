"""Python API for Sonari."""

from sonari.api.annotation_projects import annotation_projects
from sonari.api.annotation_tasks import annotation_tasks
from sonari.api.audio import load_audio, load_clip_bytes
from sonari.api.clip_annotations import clip_annotations
from sonari.api.clips import clips
from sonari.api.datasets import datasets
from sonari.api.features import features, find_feature, find_feature_value
from sonari.api.notes import notes
from sonari.api.recordings import recordings
from sonari.api.sessions import create_session
from sonari.api.sound_event_annotations import sound_event_annotations
from sonari.api.sound_events import sound_events
from sonari.api.spectrograms import compute_spectrogram
from sonari.api.spectrograms import compute_waveform
from sonari.api.tags import find_tag, find_tag_value, tags
from sonari.api.users import users

__all__ = [
    "annotation_projects",
    "annotation_tasks",
    "clip_annotations",
    "clips",
    "compute_spectrogram",
    "compute_waveforms",
    "create_session",
    "datasets",
    "features",
    "find_feature",
    "find_feature_value",
    "find_tag",
    "find_tag_value",
    "load_audio",
    "load_clip_bytes",
    "notes",
    "recordings",
    "sound_event_annotations",
    "sound_events",
    "tags",
    "users",
]

"""Schemas for handling Datasets."""

from pathlib import Path
from typing import Optional

from pydantic import BaseModel, Field

from sonari.schemas.base import BaseSchema
from sonari.schemas.recordings import Recording

__all__ = [
    "Dataset",
    "DatasetCreate",
    "DatasetRecording",
    "DatasetRecordingCreate",
    "DatasetUpdate",
]


class DatasetCreate(BaseModel):
    """Schema for Dataset objects created by the user."""

    audio_dir: Path
    """The path to the directory containing the audio files. May be absolute
    (must be under the root audio directory) or already root-relative. The
    API layer is responsible for relativizing before storage."""

    name: str = Field(..., min_length=1)
    """The name of the dataset."""

    description: str | None = Field(None)
    """The description of the dataset."""


class Dataset(BaseSchema):
    """Schema for Dataset objects returned to the user."""

    id: int
    """The database id of the dataset."""

    name: str
    """The name of the dataset."""

    description: str | None
    """The description of the dataset."""

    audio_dir: Path
    """The path to the directory containing the audio files."""

    recording_count: int = 0
    """The number of recordings in the dataset."""

    recordings: Optional[list[Recording]]
    """All recordings of that dataset"""


class DatasetUpdate(BaseModel):
    """Schema for Dataset objects updated by the user."""

    audio_dir: Path | None = None
    """The path to the directory containing the audio files."""

    name: str | None = Field(default=None, min_length=1)
    """The name of the dataset."""

    description: str | None = None
    """The description of the dataset."""


class DatasetRecordingCreate(BaseModel):
    """Schema for DatasetRecording objects created by the user."""


class DatasetRecording(BaseSchema):
    """Schema for DatasetRecording objects returned to the user."""

    recording: Recording
    """The recording."""

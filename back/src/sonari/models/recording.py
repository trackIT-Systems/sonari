"""Recording model.

A recording is the primary source of data in the app, representing a
single audio file. Currently, the app supports only WAV files, although
support for additional file formats may be added in the future.
Recordings are part of a dataset, and each recording has a unique
identifier (hash) and a path that points to the audio file relative to
the dataset root directory.

When a recording is registered, its metadata is scanned and retrieved,
and this information is stored within the app. This metadata includes
the duration of the recording, its sample rate, and the number of
channels. Additionally, recordings can optionally include date and time
information to indicate when they were recorded, as well as latitude and
longitude coordinates to indicate where they were recorded.
"""

import datetime
from pathlib import Path
from typing import TYPE_CHECKING
from uuid import UUID

import sqlalchemy.orm as orm
from sqlalchemy import ForeignKey, UniqueConstraint

from sonari.models.base import Base
from sonari.models.user import User

if TYPE_CHECKING:
    from sonari.models.annotation_task import AnnotationTask
    from sonari.models.dataset import DatasetRecording

__all__ = [
    "Recording",
    "RecordingFeature",
    "RecordingOwner",
]


class Recording(Base):
    """Recording model for recording table.

    This model represents the recording table in the database. It contains
    all the information about a recording.

    Attributes
    ----------
    id
        The database id of the recording.
    hash
        The md5 hash of the recording.
    path
        The path of the dataset, relative to the base audio directory.
    duration
        The duration of the recording in seconds.
    samplerate
        The samplerate of the recording in Hz.
    channels
        The number of channels of the recording.
    date
        The date at which the recording was made.
    time
        The time at which the recording was made.
    latitude
        The latitude of the recording site.
    longitude
        The longitude of the recording site.
    time_expansion
        The time expansion factor of the recording.
    rights
        A string describing the usage rights of the recording.
    tags
        A list of tags associated with the recording.
    features
        A list of features associated with the recording.
    owners
        The list of users who have ownership over the recording.

    Parameters
    ----------
    path : Path
        The path to the recording file relative to the base audio directory.
    hash : str, optional
        The md5 hash of the recording. If not provided, it is computed from the
        recording file.
    duration : float
        The duration of the recording in seconds.
    samplerate : int
        The samplerate of the recording in Hz.
    channels : int
        The number of channels of the recording.
    date : datetime.date, optional
        The date at which the recording was made.
    time : datetime.time, optional
        The time at which the recording was made.
    latitude : float, optional
        The latitude of the recording site.
    longitude : float, optional
        The longitude of the recording site.
    time_expansion : float, optional
        The time expansion factor of the recording. Defaults to 1.0.
    rights : str, optional
        A string describing the usage rights of the recording.
    """

    __tablename__ = "recording"

    id: orm.Mapped[int] = orm.mapped_column(primary_key=True, init=False)
    hash: orm.Mapped[str] = orm.mapped_column(unique=True, index=True)
    path: orm.Mapped[Path] = orm.mapped_column(unique=True, index=True)
    duration: orm.Mapped[float]
    samplerate: orm.Mapped[int]
    channels: orm.Mapped[int]
    date: orm.Mapped[datetime.date | None] = orm.mapped_column(default=None)
    time: orm.Mapped[datetime.time | None] = orm.mapped_column(default=None)
    latitude: orm.Mapped[float | None] = orm.mapped_column(default=None)
    longitude: orm.Mapped[float | None] = orm.mapped_column(default=None)
    time_expansion: orm.Mapped[float] = orm.mapped_column(default=1.0)
    rights: orm.Mapped[str | None] = orm.mapped_column(default=None)

    features: orm.Mapped[list["RecordingFeature"]] = orm.relationship(
        back_populates="recording",
        default_factory=list,
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    owners: orm.Mapped[list[User]] = orm.relationship(
        viewonly=True,
        secondary="recording_owner",
        default_factory=list,
    )

    # Backrefs
    annotation_tasks: orm.Mapped[list["AnnotationTask"]] = orm.relationship(
        back_populates="recording",
        default_factory=list,
        init=False,
        cascade="all, delete-orphan",
        passive_deletes=True,
        repr=False,
    )
    recording_datasets: orm.Mapped[list["DatasetRecording"]] = orm.relationship(
        init=False,
        repr=False,
        cascade="all, delete-orphan",
        passive_deletes=True,
        back_populates="recording",
        default_factory=list,
    )


class RecordingFeature(Base):
    """Recording Feature Model.

    Attributes
    ----------
    name
        The name of the feature.
    value
        The value of the feature.
    created_on
        The date and time at which the feature was created.

    Parameters
    ----------
    recording_id : int
        The database id of the recording to which the feature belongs.
    name : str
        The name of the feature.
    value : float
        The value of the feature.
    """

    __tablename__ = "recording_feature"
    __table_args__ = (
        UniqueConstraint(
            "recording_id",
            "name",
        ),
    )

    recording_id: orm.Mapped[int] = orm.mapped_column(
        ForeignKey("recording.id", ondelete="CASCADE"),
        nullable=False,
        primary_key=True,
        index=True,
    )
    name: orm.Mapped[str] = orm.mapped_column(nullable=False, primary_key=True)
    value: orm.Mapped[float] = orm.mapped_column(nullable=False)

    # Relationships
    recording: orm.Mapped[Recording] = orm.relationship(
        back_populates="features",
        init=False,
        repr=False,
    )


class RecordingOwner(Base):
    """RecordingOwner model for recording_owner table.

    Attributes
    ----------
    user
        The user who owns the recording.
    created_on
        The date and time at which the user became the owner of the recording.

    Parameters
    ----------
    recording_id : int
        The database id of the recording.
    user_id : UUID
        The database id of the user.
    """

    __tablename__ = "recording_owner"
    __table_args__ = (UniqueConstraint("recording_id", "user_id"),)

    recording_id: orm.Mapped[int] = orm.mapped_column(
        ForeignKey("recording.id", ondelete="CASCADE"),
        nullable=False,
        primary_key=True,
        index=True,
    )
    user_id: orm.Mapped[UUID] = orm.mapped_column(
        ForeignKey("user.id"),
        nullable=False,
        primary_key=True,
        index=True,
    )
    recording: orm.Mapped[Recording] = orm.relationship(
        init=False,
        repr=False,
    )
    user: orm.Mapped[User] = orm.relationship(
        back_populates="recording_owner",
        init=False,
        repr=False,
    )

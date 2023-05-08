"""Recording model.

A recording is the primary source of data in the app, representing a
single audio file. Currently, the app supports only WAV files, although
support for additional file formats may be added in the future. Recordings
are part of a dataset, and each recording has a unique identifier (hash)
and a path that points to the audio file relative to the dataset root
directory.

When a recording is registered, its metadata is scanned and retrieved, and
this information is stored within the app. This metadata includes the duration
of the recording, its sample rate, and the number of channels. Additionally,
recordings can optionally include date and time information to indicate when
they were recorded, as well as latitude and longitude coordinates to indicate
where they were recorded.
"""

import datetime

import sqlalchemy.orm as orm
from sqlalchemy import ForeignKey, UniqueConstraint

from whombat.database.models.base import Base
from whombat.database.models.feature import Feature
from whombat.database.models.note import Note
from whombat.database.models.tag import Tag

__all__ = [
    "Recording",
    "RecordingNote",
    "RecordingTag",
    "RecordingFeature",
]


class Recording(Base):
    """Recording model for recording table.

    This model represents the recording table in the database. It contains the
    all the information about a recording.

    """

    __tablename__ = "recording"

    id: orm.Mapped[int] = orm.mapped_column(primary_key=True)
    """The id of the recording."""

    hash: orm.Mapped[str] = orm.mapped_column(nullable=False, unique=True)
    """The sha256 hash of the recording.

    The hash is used to uniquely identify the recording. It is calculated
    from the recording file and is used to check if a recording has been
    registered before.

    The hash function SHOULD be computed using the
    whombat.core.files.compute_hash function.
    """

    duration: orm.Mapped[float] = orm.mapped_column(nullable=False)
    """The duration of the recording in seconds."""

    samplerate: orm.Mapped[int] = orm.mapped_column(nullable=False)
    """The samplerate of the recording in Hz."""

    channels: orm.Mapped[int] = orm.mapped_column(nullable=False)
    """The number of channels of the recording."""

    date: orm.Mapped[datetime.date] = orm.mapped_column(nullable=True)
    """The date at which the recording was made."""

    time: orm.Mapped[datetime.time] = orm.mapped_column(nullable=True)
    """The time at which the recording was made."""

    latitude: orm.Mapped[float] = orm.mapped_column(nullable=True)
    """The latitude of the recording site."""

    longitude: orm.Mapped[float] = orm.mapped_column(nullable=True)
    """The longitude of the recording site."""

    notes: orm.Mapped[list["RecordingNote"]] = orm.relationship(
        "RecordingNote",
        back_populates="recording",
    )

    tags: orm.Mapped[list["RecordingTag"]] = orm.relationship(
        "RecordingTag",
        back_populates="recording",
    )

    features: orm.Mapped[list["RecordingFeature"]] = orm.relationship(
        "RecordingFeature",
        back_populates="recording",
    )


class RecordingNote(Base):
    """RecordingNote model for recording_note table.

    This model represents the recording_note table in the database. It contains
    the all the information about a note that is associated with a recording.

    """

    __tablename__ = "recording_note"

    id: orm.Mapped[int] = orm.mapped_column(primary_key=True)
    """The id of the recording note."""

    recording_id: orm.Mapped[int] = orm.mapped_column(
        ForeignKey("recording.id"),
        nullable=False,
    )
    """The id of the recording to which the note belongs."""

    recording: orm.Mapped[Recording] = orm.relationship(
        back_populates="notes",
    )
    """The recording to which the note belongs."""

    note_id: orm.Mapped[int] = orm.mapped_column(
        ForeignKey("note.id"),
        nullable=False,
    )
    """The id of the note."""

    note: orm.Mapped[Note] = orm.relationship()
    """The note."""

    __table_args__ = (UniqueConstraint("recording_id", "note_id"),)


class RecordingTag(Base):
    """RecordingTag model for recording_tag table.

    Tags can be added to recordings to indicate that they have certain
    characteristics. They can be used to organize recordings into groups
    based on their characteristics.

    """

    __tablename__ = "recording_tag"

    id: orm.Mapped[int] = orm.mapped_column(primary_key=True)
    """The id of the recording tag."""

    recording_id: orm.Mapped[int] = orm.mapped_column(
        ForeignKey("recording.id"),
        nullable=False,
    )
    """The id of the recording to which the tag belongs."""

    recording: orm.Mapped[Recording] = orm.relationship(
        back_populates="tags",
    )
    """The recording to which the tag belongs."""

    tag_id: orm.Mapped[int] = orm.mapped_column(
        ForeignKey("tag.id"),
        nullable=False,
    )
    """The id of the tag."""

    tag: orm.Mapped[Tag] = orm.relationship()
    """The tag."""

    __table_args__ = (UniqueConstraint("recording_id", "tag_id"),)


class RecordingFeature(Base):
    """RecordingFeature model.

    In recordings, features can provide important contextual
    information of a numeric type, such as temperature or wind
    speed at the time of recording, or the height of the recorder.
    """

    __tablename__ = "recording_feature"

    id: orm.Mapped[int] = orm.mapped_column(primary_key=True)
    """The id of the recording feature."""

    recording_id: orm.Mapped[int] = orm.mapped_column(
        ForeignKey("recording.id"),
        nullable=False,
    )
    """The id of the recording to which the feature belongs."""

    recording: orm.Mapped[Recording] = orm.relationship(
        back_populates="features",
    )

    feature_id: orm.Mapped[int] = orm.mapped_column(
        ForeignKey("feature.id"),
        nullable=False,
    )
    """The id of the feature."""

    feature: orm.Mapped[Feature] = orm.relationship()

    value: orm.Mapped[float] = orm.mapped_column(nullable=False)

    __table_args__ = (UniqueConstraint("recording_id", "feature_id"),)

"""Original state and edit history of sound event annotations.

Imports write sound events directly. Their state before the first user edit is copied
into ``sound_event_original`` (with tags and confidence), because an edit makes the
editor the owner and removes the confidence features. Every user edit adds or updates a
row in ``sound_event_change``.

Event ids are plain integers without a foreign key: the history outlives deleted
events, and ecohub's mass deletes don't have to check these tables.
"""

import datetime
from typing import Optional
from uuid import UUID

import sqlalchemy.orm as orm
from sqlalchemy import DateTime, ForeignKey, Index, UniqueConstraint

from sonari.models.base import Base

__all__ = [
    "PredictionBackfill",
    "SoundEventChange",
    "SoundEventOriginal",
    "SoundEventOriginalTag",
]


class SoundEventOriginal(Base):
    """State of an imported sound event just before its first user edit."""

    __tablename__ = "sound_event_original"
    __table_args__ = (Index("ix_sound_event_original_annotation_task_id", "annotation_task_id"),)

    id: orm.Mapped[int] = orm.mapped_column(primary_key=True, init=False)
    annotation_task_id: orm.Mapped[int] = orm.mapped_column(
        ForeignKey("annotation_task.id", ondelete="CASCADE"),
        nullable=False,
    )
    # NULL when the event was already gone when the original was recorded (GUANO backfill).
    sound_event_annotation_id: orm.Mapped[Optional[int]] = orm.mapped_column(unique=True)
    # Owner before the edit, e.g. the detector user.
    created_by_id: orm.Mapped[Optional[UUID]] = orm.mapped_column(ForeignKey("user.id", ondelete="SET NULL"))
    # "first_edit" or "guano".
    source: orm.Mapped[str] = orm.mapped_column(nullable=False)
    geometry_type: orm.Mapped[str] = orm.mapped_column(nullable=False)
    start_time: orm.Mapped[float] = orm.mapped_column(nullable=False)
    end_time: orm.Mapped[float] = orm.mapped_column(nullable=False)
    low_freq: orm.Mapped[Optional[float]] = orm.mapped_column(default=None)
    high_freq: orm.Mapped[Optional[float]] = orm.mapped_column(default=None)

    tags: orm.Mapped[list["SoundEventOriginalTag"]] = orm.relationship(
        back_populates="original",
        cascade="all, delete-orphan",
        passive_deletes=True,
        default_factory=list,
        repr=False,
    )


class SoundEventOriginalTag(Base):
    """A tag of a sound event's original state, with its confidence."""

    __tablename__ = "sound_event_original_tag"
    __table_args__ = (
        UniqueConstraint("original_id", "tag_key", "tag_value"),
        Index("ix_sound_event_original_tag_tag_id", "tag_id"),
    )

    id: orm.Mapped[int] = orm.mapped_column(primary_key=True, init=False)
    original_id: orm.Mapped[int] = orm.mapped_column(
        ForeignKey("sound_event_original.id", ondelete="CASCADE"),
        nullable=False,
        init=False,
    )
    # NULL once the tag is deleted; key and value keep what the event showed.
    tag_id: orm.Mapped[Optional[int]] = orm.mapped_column(ForeignKey("tag.id", ondelete="SET NULL"))
    tag_key: orm.Mapped[str] = orm.mapped_column(nullable=False)
    tag_value: orm.Mapped[str] = orm.mapped_column(nullable=False)
    confidence: orm.Mapped[Optional[float]] = orm.mapped_column(default=None)

    original: orm.Mapped[SoundEventOriginal] = orm.relationship(back_populates="tags", init=False, repr=False)


class SoundEventChange(Base):
    """One user edit of a sound event, merged per event and edit session.

    ``action`` is one of ``created``, ``deleted``, ``geometry_changed``, ``tag_added``,
    ``tag_removed`` and ``tag_replaced``. Rows of one edit session share ``edit_id``;
    while the session lasts, later edits update its rows to their net effect.
    """

    __tablename__ = "sound_event_change"
    __table_args__ = (
        Index("ix_sound_event_change_annotation_task_id_created_on", "annotation_task_id", "created_on"),
        Index("ix_sound_event_change_sound_event_annotation_id", "sound_event_annotation_id"),
        Index("ix_sound_event_change_edit_id", "edit_id"),
        Index("ix_sound_event_change_old_tag_id", "old_tag_id"),
        Index("ix_sound_event_change_new_tag_id", "new_tag_id"),
    )

    id: orm.Mapped[int] = orm.mapped_column(primary_key=True, init=False)
    annotation_task_id: orm.Mapped[int] = orm.mapped_column(
        ForeignKey("annotation_task.id", ondelete="CASCADE"),
        nullable=False,
    )
    sound_event_annotation_id: orm.Mapped[int] = orm.mapped_column(nullable=False)
    user_id: orm.Mapped[Optional[UUID]] = orm.mapped_column(ForeignKey("user.id", ondelete="SET NULL"))
    edit_id: orm.Mapped[UUID] = orm.mapped_column(nullable=False)
    action: orm.Mapped[str] = orm.mapped_column(nullable=False)

    old_tag_id: orm.Mapped[Optional[int]] = orm.mapped_column(ForeignKey("tag.id", ondelete="SET NULL"), default=None)
    old_tag_key: orm.Mapped[Optional[str]] = orm.mapped_column(default=None)
    old_tag_value: orm.Mapped[Optional[str]] = orm.mapped_column(default=None)
    new_tag_id: orm.Mapped[Optional[int]] = orm.mapped_column(ForeignKey("tag.id", ondelete="SET NULL"), default=None)
    new_tag_key: orm.Mapped[Optional[str]] = orm.mapped_column(default=None)
    new_tag_value: orm.Mapped[Optional[str]] = orm.mapped_column(default=None)

    old_start_time: orm.Mapped[Optional[float]] = orm.mapped_column(default=None)
    old_end_time: orm.Mapped[Optional[float]] = orm.mapped_column(default=None)
    old_low_freq: orm.Mapped[Optional[float]] = orm.mapped_column(default=None)
    old_high_freq: orm.Mapped[Optional[float]] = orm.mapped_column(default=None)
    new_start_time: orm.Mapped[Optional[float]] = orm.mapped_column(default=None)
    new_end_time: orm.Mapped[Optional[float]] = orm.mapped_column(default=None)
    new_low_freq: orm.Mapped[Optional[float]] = orm.mapped_column(default=None)
    new_high_freq: orm.Mapped[Optional[float]] = orm.mapped_column(default=None)

    # Time of the last edit merged into this row; created_on is the first.
    updated_on: orm.Mapped[Optional[datetime.datetime]] = orm.mapped_column(DateTime(timezone=True), default=None)


class PredictionBackfill(Base):
    """State of the GUANO backfill of a project's originals; one row per project."""

    __tablename__ = "prediction_backfill"

    annotation_project_id: orm.Mapped[int] = orm.mapped_column(
        ForeignKey("annotation_project.id", ondelete="CASCADE"),
        primary_key=True,
    )
    # "running", "done" or "failed".
    state: orm.Mapped[str] = orm.mapped_column(nullable=False)
    started_on: orm.Mapped[datetime.datetime] = orm.mapped_column(DateTime(timezone=True), nullable=False)
    # Updated while running; a run without updates for a while counts as dead.
    updated_on: orm.Mapped[datetime.datetime] = orm.mapped_column(DateTime(timezone=True), nullable=False)
    finished_on: orm.Mapped[Optional[datetime.datetime]] = orm.mapped_column(DateTime(timezone=True), default=None)
    reviewed_tasks: orm.Mapped[int] = orm.mapped_column(default=0)
    recordings: orm.Mapped[int] = orm.mapped_column(default=0)
    recordings_with_source: orm.Mapped[int] = orm.mapped_column(default=0)
    match_rate: orm.Mapped[Optional[float]] = orm.mapped_column(default=None)
    originals_created: orm.Mapped[int] = orm.mapped_column(default=0)
    error: orm.Mapped[Optional[str]] = orm.mapped_column(default=None)

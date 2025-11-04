"""Annotation Task.

A task is the fundamental unit of annotation work within a project. Each
task represents a specific piece of audio that needs to be annotated
according to the project's criteria.

This model merges the previous Clip, ClipAnnotation, and AnnotationTask
models into a single entity, as they were always used in a 1:1:1 relationship.
"""

from typing import TYPE_CHECKING, Optional
from uuid import UUID

import sqlalchemy.orm as orm
from soundevent import data
from sqlalchemy import ForeignKey, UniqueConstraint

from sonari.models.base import Base
from sonari.models.tag import Tag
from sonari.models.user import User

if TYPE_CHECKING:
    from sonari.models.annotation_project import AnnotationProject
    from sonari.models.recording import Recording
    from sonari.models.note import Note
    from sonari.models.sound_event_annotation import SoundEventAnnotation

__all__ = [
    "AnnotationTask",
    "AnnotationTaskFeature",
    "AnnotationTaskTag",
    "AnnotationStatusBadge",
]


class AnnotationTask(Base):
    """Annotation Task model.

    This model combines what were previously separate Clip, ClipAnnotation,
    and AnnotationTask models.

    Attributes
    ----------
    id
        The database id of the task.
    annotation_project_id
        The ID of the annotation project to which the task belongs.
    recording_id
        The ID of the recording from which this task's audio segment is taken.
    start_time
        The start time of the audio segment in seconds.
    end_time
        The end time of the audio segment in seconds.
    sound_event_annotations
        The sound event annotations within this task.
    tags
        The tags attached to this task.
    notes
        The notes attached to this task.
    features
        Computed features for this audio segment.
    status_badges
        Status badges tracking task completion.
    created_on
        The date and time the task was created.

    Parameters
    ----------
    annotation_project_id : int
        The database id of the annotation project to which the task belongs.
    recording_id : int
        The database id of the recording.
    start_time : float
        Start time of the audio segment in seconds.
    end_time : float
        End time of the audio segment in seconds.
    """

    __tablename__ = "annotation_task"
    __table_args__ = (UniqueConstraint("annotation_project_id", "recording_id", "start_time", "end_time"),)

    id: orm.Mapped[int] = orm.mapped_column(primary_key=True, init=False)
    annotation_project_id: orm.Mapped[int] = orm.mapped_column(
        ForeignKey("annotation_project.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    recording_id: orm.Mapped[int] = orm.mapped_column(
        ForeignKey("recording.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    start_time: orm.Mapped[float] = orm.mapped_column(nullable=False)
    end_time: orm.Mapped[float] = orm.mapped_column(nullable=False)

    # Relationships
    annotation_project: orm.Mapped["AnnotationProject"] = orm.relationship(
        back_populates="annotation_tasks",
        init=False,
        repr=False,
    )
    recording: orm.Mapped["Recording"] = orm.relationship(
        init=False,
        repr=False,
    )
    sound_event_annotations: orm.Mapped[list["SoundEventAnnotation"]] = orm.relationship(
        back_populates="annotation_task",
        default_factory=list,
        cascade="all, delete-orphan",
        passive_deletes=True,
        repr=False,
        init=False,
    )
    tags: orm.Mapped[list[Tag]] = orm.relationship(
        secondary="annotation_task_tag",
        viewonly=True,
        default_factory=list,
        repr=False,
        init=False,
    )
    features: orm.Mapped[list["AnnotationTaskFeature"]] = orm.relationship(
        back_populates="annotation_task",
        default_factory=list,
        cascade="all, delete-orphan",
        passive_deletes=True,
        repr=False,
    )
    notes: orm.Mapped[list["Note"]] = orm.relationship(
        back_populates="annotation_task",
        default_factory=list,
        cascade="all, delete-orphan",
        passive_deletes=True,
        repr=False,
    )
    status_badges: orm.Mapped[list["AnnotationStatusBadge"]] = orm.relationship(
        back_populates="annotation_task",
        cascade="all",
        passive_deletes=True,
        init=False,
        repr=False,
        default_factory=list,
        lazy="selectin",
    )


class AnnotationTaskFeature(Base):
    """Annotation Task Feature Model.

    Features are numerical values computed for audio segments.

    Attributes
    ----------
    name
        The name of the feature.
    value
        The value of the feature.

    Parameters
    ----------
    annotation_task_id : int
        The database id of the annotation task.
    name : str
        The name of the feature.
    value : float
        The value of the feature.
    """

    __tablename__ = "annotation_task_feature"
    __table_args__ = (
        UniqueConstraint(
            "annotation_task_id",
            "name",
        ),
    )

    annotation_task_id: orm.Mapped[int] = orm.mapped_column(
        ForeignKey("annotation_task.id", ondelete="CASCADE"),
        nullable=False,
        primary_key=True,
        index=True,
    )
    name: orm.Mapped[str] = orm.mapped_column(nullable=False, primary_key=True)
    value: orm.Mapped[float] = orm.mapped_column(nullable=False)

    # Relations
    annotation_task: orm.Mapped[AnnotationTask] = orm.relationship(
        back_populates="features",
        init=False,
        repr=False,
    )


class AnnotationTaskTag(Base):
    """Annotation Task Tag Model.

    Tracks which user attached which tag to an annotation task.

    Attributes
    ----------
    tag
        The tag attached to the annotation task.
    created_by
        The user who attached the tag.
    created_on
        The date and time the tag was attached.

    Parameters
    ----------
    annotation_task_id : int
        The database id of the annotation task.
    tag_id : int
        The database id of the tag.
    created_by_id : UUID
        The database id of the user who attached the tag.
    """

    __tablename__ = "annotation_task_tag"
    __table_args__ = (
        UniqueConstraint(
            "annotation_task_id",
            "tag_id",
            "created_by_id",
        ),
    )

    id: orm.Mapped[int] = orm.mapped_column(primary_key=True, init=False)
    annotation_task_id: orm.Mapped[int] = orm.mapped_column(
        ForeignKey("annotation_task.id", ondelete="CASCADE"),
        index=True,
    )
    tag_id: orm.Mapped[int] = orm.mapped_column(
        ForeignKey("tag.id", ondelete="CASCADE"),
        index=True,
    )
    created_by_id: orm.Mapped[Optional[UUID]] = orm.mapped_column(
        ForeignKey("user.id"),
        index=True,
    )

    # Relations
    tag: orm.Mapped[Tag] = orm.relationship(
        init=False,
        repr=False,
    )
    created_by: orm.Mapped[Optional[User]] = orm.relationship(
        init=False,
        repr=False,
    )
    annotation_task: orm.Mapped[AnnotationTask] = orm.relationship(
        init=False,
        repr=False,
    )


class AnnotationStatusBadge(Base):
    """Annotation status badge model.

    Attributes
    ----------
    id
        The database id of the status badge.
    state
        The annotation status to which the badge refers.
    task
        The task to which the status badge belongs.
    user
        The user to whom the status badge refers.
    created_on
        The date and time the status badge was created.

    Parameters
    ----------
    annotation_task_id : int
        The database id of the task to which the status badge belongs.
    state : soundevent.data.AnnotationState
        The annotation status to which the badge refers.
    user_id : UUID, optional
        The database id of the user to whom the status badge refers.
    """

    __tablename__ = "annotation_status_badge"
    __table_args__ = (UniqueConstraint("annotation_task_id", "user_id", "state"),)

    id: orm.Mapped[int] = orm.mapped_column(
        primary_key=True,
        init=False,
    )
    annotation_task_id: orm.Mapped[int] = orm.mapped_column(
        ForeignKey("annotation_task.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: orm.Mapped[Optional[UUID]] = orm.mapped_column(
        ForeignKey("user.id"),
        index=True,
    )
    state: orm.Mapped[data.AnnotationState]

    # Relationships
    annotation_task: orm.Mapped[AnnotationTask] = orm.relationship(
        back_populates="status_badges",
        init=False,
    )
    user: orm.Mapped[User] = orm.relationship(
        User,
        init=False,
        repr=False,
        lazy="selectin",
    )

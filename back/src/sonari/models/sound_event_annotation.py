"""Sound Event Annotation model.

Sound events are the heart of the app, as they are the primary objects
of annotation. A sound event is any distinguishable sound within a
recording that is of interest to users.

This model merges the previous SoundEvent and SoundEventAnnotation models
into a single entity, as they were always used in a 1:1 relationship.
"""

from typing import TYPE_CHECKING, Optional
from uuid import UUID

import sqlalchemy.orm as orm
from soundevent import Geometry
from sqlalchemy import ForeignKey, UniqueConstraint

from sonari.models.base import Base
from sonari.models.tag import Tag
from sonari.models.user import User

if TYPE_CHECKING:
    from sonari.models.annotation_task import AnnotationTask
    from sonari.models.recording import Recording

__all__ = [
    "SoundEventAnnotation",
    "SoundEventAnnotationFeature",
    "SoundEventAnnotationTag",
]


class SoundEventAnnotation(Base):
    """Sound Event Annotation model.

    This model combines what were previously separate SoundEvent and
    SoundEventAnnotation models.

    Attributes
    ----------
    id
        The database id of the sound event annotation.
    annotation_task_id
        The ID of the annotation task this sound event belongs to.
    recording_id
        The ID of the recording this sound event is in.
    geometry_type
        The type of geometry used to mark the RoI of the sound event.
    geometry
        The geometry of the mark used to mark the RoI of the sound event.
    created_by
        The user who created the annotation.
    tags
        A list of tags associated with the annotation.
    features
        A list of features associated with the sound event.

    Parameters
    ----------
    annotation_task_id : int
        The id of the annotation task to which the sound event annotation belongs.
    recording_id : int
        The id of the recording to which the sound event belongs.
    geometry : Geometry
        The geometry of the mark used to mark the RoI of the sound event.
    created_by_id : UUID, optional
        The id of the user who created the annotation.

    Notes
    -----
    The geometry attribute is stored as a JSON string in the database.
    """

    __tablename__ = "sound_event_annotation"

    id: orm.Mapped[int] = orm.mapped_column(primary_key=True, init=False)
    annotation_task_id: orm.Mapped[int] = orm.mapped_column(
        ForeignKey("annotation_task.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    recording_id: orm.Mapped[int] = orm.mapped_column(
        ForeignKey("recording.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    geometry_type: orm.Mapped[str] = orm.mapped_column(nullable=False)
    geometry: orm.Mapped[Geometry] = orm.mapped_column(nullable=False)
    created_by_id: orm.Mapped[Optional[UUID]] = orm.mapped_column(
        ForeignKey("user.id"),
        index=True,
    )

    # Relationships
    annotation_task: orm.Mapped["AnnotationTask"] = orm.relationship(
        init=False,
        repr=False,
    )
    recording: orm.Mapped["Recording"] = orm.relationship(
        init=False,
        repr=False,
    )
    created_by: orm.Mapped[Optional[User]] = orm.relationship(
        init=False,
        repr=False,
    )
    tags: orm.Mapped[list[Tag]] = orm.relationship(
        secondary="sound_event_annotation_tag",
        viewonly=True,
        default_factory=list,
        repr=False,
        init=False,
    )
    features: orm.Mapped[list["SoundEventAnnotationFeature"]] = orm.relationship(
        back_populates="sound_event_annotation",
        cascade="all, delete-orphan",
        passive_deletes=True,
        init=False,
        repr=False,
        default_factory=list,
    )


class SoundEventAnnotationFeature(Base):
    """Sound Event Annotation Feature model.

    Attributes
    ----------
    name
        The name of the feature.
    value
        The value of the feature.

    Parameters
    ----------
    sound_event_annotation_id : int
        The id of the sound event annotation to which the feature belongs.
    name : str
        The name of the feature.
    value : float
        The value of the feature.
    """

    __tablename__ = "sound_event_annotation_feature"
    __table_args__ = (
        UniqueConstraint(
            "sound_event_annotation_id",
            "name",
        ),
    )

    sound_event_annotation_id: orm.Mapped[int] = orm.mapped_column(
        ForeignKey("sound_event_annotation.id", ondelete="CASCADE"),
        nullable=False,
        primary_key=True,
        index=True,
    )
    name: orm.Mapped[str] = orm.mapped_column(nullable=False, primary_key=True)
    value: orm.Mapped[float] = orm.mapped_column(nullable=False)

    # Relations
    sound_event_annotation: orm.Mapped[SoundEventAnnotation] = orm.relationship(
        back_populates="features",
        init=False,
        repr=False,
    )


class SoundEventAnnotationTag(Base):
    """Sound Event Annotation tag model.

    Tracks which user attached which tag to a sound event annotation.

    Attributes
    ----------
    sound_event_annotation
        The annotation to which the tag belongs.
    tag
        The tag attached to the annotation.
    created_by
        The user who attached the tag.

    Parameters
    ----------
    sound_event_annotation_id : int
        The id of the annotation to which the tag belongs.
    tag_id : int
        The id of the tag attached to the annotation.
    created_by_id : UUID, optional
        The id of the user who attached the tag.
    """

    __tablename__ = "sound_event_annotation_tag"
    __table_args__ = (UniqueConstraint("sound_event_annotation_id", "tag_id", "created_by_id"),)

    id: orm.Mapped[int] = orm.mapped_column(primary_key=True, init=False)
    sound_event_annotation_id: orm.Mapped[int] = orm.mapped_column(
        ForeignKey("sound_event_annotation.id", ondelete="CASCADE")
    )
    tag_id: orm.Mapped[int] = orm.mapped_column(
        ForeignKey("tag.id", ondelete="CASCADE"),
        index=True,
    )
    created_by_id: orm.Mapped[Optional[UUID]] = orm.mapped_column(
        ForeignKey("user.id"),
        index=True,
    )

    # Relationships
    sound_event_annotation: orm.Mapped[SoundEventAnnotation] = orm.relationship(
        init=False,
        repr=False,
    )
    tag: orm.Mapped[Tag] = orm.relationship(
        back_populates="sound_event_annotation_tags",
        init=False,
        repr=False,
    )
    created_by: orm.Mapped[Optional[User]] = orm.relationship(
        back_populates="sound_event_annotation_tags",
        init=False,
        repr=False,
    )

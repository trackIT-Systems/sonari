"""Annotation model."""

from typing import TYPE_CHECKING, Optional
from uuid import UUID, uuid4

import sqlalchemy.orm as orm
from sqlalchemy import ForeignKey, UniqueConstraint

from whombat.models.base import Base
from whombat.models.note import Note
from whombat.models.sound_event import SoundEvent
from whombat.models.tag import Tag
from whombat.models.user import User

if TYPE_CHECKING:
    from whombat.models.clip_annotation import ClipAnnotation


__all__ = [
    "SoundEventAnnotation",
    "SoundEventAnnotationNote",
    "SoundEventAnnotationTag",
]


class SoundEventAnnotation(Base):
    """Annotation model.

    Attributes
    ----------
    id
        The database id of the annotation.
    uuid
        The UUID of the annotation.
    created_by
        The user who created the annotation.
    sound_event
        The sound event annotated by the annotation.
    tags
        A list of tags associated with the annotation.

    Notes
    -----
        A list of notes associated with the annotation.
    clip_annotation
        The clip annotation to which the annotation belongs.

    Parameters
    ----------
    sound_event_id : int
        The id of the sound event annotated by the annotation.
    clip_annotation_id : int
        The id of the clip annotation to which the annotation belongs.
    created_by_id : int, optional
        The id of the user who created the annotation.
    uuid : UUID, optional
        The UUID of the annotation. If not provided, a new UUID will be
        generated.
    """

    __tablename__ = "sound_event_annotation"

    id: orm.Mapped[int] = orm.mapped_column(primary_key=True, init=False)
    uuid: orm.Mapped[UUID] = orm.mapped_column(
        default_factory=uuid4,
        unique=True,
        kw_only=True,
    )
    clip_annotation_id: orm.Mapped[int] = orm.mapped_column(
        ForeignKey("clip_annotation.id", ondelete="CASCADE"),
        nullable=False,
    )
    created_by_id: orm.Mapped[Optional[int]] = orm.mapped_column(
        ForeignKey("user.id"),
    )
    sound_event_id: orm.Mapped[int] = orm.mapped_column(
        ForeignKey("sound_event.id"),
        nullable=False,
    )

    # Relationships
    clip_annotation: orm.Mapped["ClipAnnotation"] = orm.relationship(
        init=False,
        repr=False,
        lazy="joined",
    )
    created_by: orm.Mapped[Optional[User]] = orm.relationship(
        init=False,
        repr=False,
        lazy="joined",
    )
    sound_event: orm.Mapped[SoundEvent] = orm.relationship(
        init=False,
        repr=False,
        lazy="joined",
    )
    tags: orm.Mapped[list[Tag]] = orm.relationship(
        secondary="sound_event_annotation_tag",
        viewonly=True,
        default_factory=list,
        repr=False,
        init=False,
        lazy="selectin",
    )
    notes: orm.Mapped[list[Note]] = orm.relationship(
        back_populates="sound_event_annotation",
        secondary="sound_event_annotation_note",
        init=False,
        repr=False,
        viewonly=True,
        default_factory=list,
        order_by=Note.created_on.desc(),
        lazy="selectin",
    )

    # =====================
    # Secondary relationships
    sound_event_annotation_notes: orm.Mapped[list["SoundEventAnnotationNote"]] = orm.relationship(
        back_populates="sound_event_annotation",
        cascade="all",
        passive_deletes=True,
        init=False,
        repr=False,
        default_factory=list,
        lazy="selectin",
    )
    sound_event_annotation_tags: orm.Mapped[list["SoundEventAnnotationTag"]] = orm.relationship(
        default_factory=list,
        cascade="all",
        passive_deletes=True,
        repr=False,
        init=False,
        lazy="selectin",
    )


class SoundEventAnnotationNote(Base):
    """Sound Event Annotation Note Model.

    Attributes
    ----------
    note
        The note associated with the annotation.
    created_on
        The date and time when the note was created.

    Parameters
    ----------
    sound_event_annotation_id : int
        The id of the annotation to which the note belongs.
    note_id : int
        The id of the note associated with the annotation.
    """

    __tablename__ = "sound_event_annotation_note"
    __table_args__ = (UniqueConstraint("sound_event_annotation_id", "note_id"),)

    sound_event_annotation_id: orm.Mapped[int] = orm.mapped_column(
        ForeignKey("sound_event_annotation.id", ondelete="CASCADE"),
        primary_key=True,
        nullable=False,
    )
    note_id: orm.Mapped[int] = orm.mapped_column(
        ForeignKey("note.id", ondelete="CASCADE"),
        primary_key=True,
        nullable=False,
    )
    sound_event_annotation: orm.Mapped[SoundEventAnnotation] = orm.relationship(
        back_populates="sound_event_annotation_notes",
        init=False,
        repr=False,
        lazy="joined",
    )
    note: orm.Mapped[Note] = orm.relationship(
        back_populates="sound_event_annotation_note",
        init=False,
        repr=False,
        lazy="joined",
    )


class SoundEventAnnotationTag(Base):
    """Annotation tag model.

    Attributes
    ----------
    id
        The database id of the annotation tag.
    sound_event_annotation
        The annotation to which the annotation tag belongs.
    tag
        The tag attached to the annotation.
    created_by
        The user who created the annotation tag.

    Parameters
    ----------
    sound_event_annotation_id : int
        The id of the annotation to which the annotation tag belongs.
    tag_id : int
        The id of the tag attached to the annotation.
    created_by_id : int, optional
        The id of the user who created the annotation tag.
    """

    __tablename__ = "sound_event_annotation_tag"
    __table_args__ = (UniqueConstraint("sound_event_annotation_id", "tag_id", "created_by_id"),)

    id: orm.Mapped[int] = orm.mapped_column(primary_key=True, init=False)
    sound_event_annotation_id: orm.Mapped[int] = orm.mapped_column(
        ForeignKey("sound_event_annotation.id", ondelete="CASCADE")
    )
    tag_id: orm.Mapped[int] = orm.mapped_column(ForeignKey("tag.id"))
    created_by_id: orm.Mapped[Optional[int]] = orm.mapped_column(ForeignKey("user.id"))

    # Relationships
    sound_event_annotation: orm.Mapped[SoundEventAnnotation] = orm.relationship(
        back_populates="sound_event_annotation_tags",
        init=False,
        repr=False,
    )
    tag: orm.Mapped[Tag] = orm.relationship(
        back_populates="sound_event_annotation_tags",
        init=False,
        repr=False,
        lazy="joined",
    )
    created_by: orm.Mapped[Optional[User]] = orm.relationship(
        back_populates="sound_event_annotation_tags",
        init=False,
        repr=False,
        lazy="joined",
    )

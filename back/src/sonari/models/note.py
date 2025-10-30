"""Note model.

Notes are user messages that can be attached to annotation tasks. They
serve as a way to provide additional textual context or discuss specific
aspects of the annotation with other users.

Users can mark notes as an issue to flag incomplete or incorrect
annotations or to indicate that a specific item needs attention from
other users.
"""

from typing import TYPE_CHECKING
from uuid import UUID

import sqlalchemy.orm as orm
from sqlalchemy import ForeignKey

from sonari.models.base import Base
from sonari.models.user import User

if TYPE_CHECKING:
    from sonari.models.annotation_task import AnnotationTask

__all__ = [
    "Note",
]


class Note(Base):
    """Note model.

    Attributes
    ----------
    id
        The database id of the note.
    message
        Textual message of the note.
    is_issue
        Whether the note is an issue.
    created_by
        The user who created the note.
    annotation_task
        The annotation task to which this note belongs.
    created_on
        The date and time when the note was created.

    Parameters
    ----------
    message : str
        Textual message of the note.
    annotation_task_id : int
        The database id of the annotation task.
    is_issue : bool, optional
        Whether the note is an issue. Defaults to False.
    created_by_id : UUID, optional
        The database id of the user who created the note.
    """

    __tablename__ = "note"

    id: orm.Mapped[int] = orm.mapped_column(primary_key=True, init=False)
    message: orm.Mapped[str] = orm.mapped_column(nullable=False)
    annotation_task_id: orm.Mapped[int] = orm.mapped_column(
        ForeignKey("annotation_task.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_by_id: orm.Mapped[UUID] = orm.mapped_column(
        ForeignKey("user.id"),
        nullable=True,
        index=True,
    )
    is_issue: orm.Mapped[bool] = orm.mapped_column(
        nullable=False,
        default=False,
    )

    # Relationships
    created_by: orm.Mapped[User] = orm.relationship(
        User,
        back_populates="notes",
        init=False,
        lazy="joined",
    )
    annotation_task: orm.Mapped["AnnotationTask"] = orm.relationship(
        init=False,
        repr=False,
    )

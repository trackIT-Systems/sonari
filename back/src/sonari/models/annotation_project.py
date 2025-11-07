"""Annotation Project model.

An annotation project is a focused effort to label specific sound events
in a set of recordings. Each project
has a unique name and is divided into individual tasks, each
consisting of a part of audio from the recordings.
"""

import sqlalchemy.orm as orm
from sqlalchemy import ForeignKey, UniqueConstraint

from sonari.models.annotation_task import AnnotationTask
from sonari.models.base import Base
from sonari.models.tag import Tag

__all__ = [
    "AnnotationProject",
    "AnnotationProjectTag",
]


class AnnotationProject(Base):
    """Annotation Project model.

    Attributes
    ----------
    id
        The database id of the annotation project.
    name
        The name of the annotation project.
    description
        The description of the annotation project.
    annotation_instructions
        The instructions for annotators.
    tags
        A list of tags associated with the annotation project.
        Annotations created for this project can only use these tags.
    annotation_tasks
        The list of annotation tasks associated with the annotation project.
    created_on
        The date and time the annotation project was created.

    Parameters
    ----------
    name : str
        The name of the annotation project.
    description : str
        The description of the annotation project.
    annotation_instructions : str, optional
        The instructions for annotators.
    """

    __tablename__ = "annotation_project"

    id: orm.Mapped[int] = orm.mapped_column(primary_key=True, init=False)
    name: orm.Mapped[str] = orm.mapped_column(unique=True)
    description: orm.Mapped[str]
    annotation_instructions: orm.Mapped[str | None] = orm.mapped_column(default=None)

    # Relationships
    tags: orm.Mapped[list[Tag]] = orm.relationship(
        "Tag",
        secondary="annotation_project_tag",
        viewonly=True,
        default_factory=list,
        repr=False,
    )
    annotation_tasks: orm.Mapped[list["AnnotationTask"]] = orm.relationship(
        back_populates="annotation_project",
        default_factory=list,
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class AnnotationProjectTag(Base):
    """Annotation Project Tag model.

    Attributes
    ----------
    annotation_project
        The annotation project associated with the tag.
    tag
        The tag associated with the annotation project.

    Parameters
    ----------
    annotation_project_id : int
        The database id of the annotation project.
    tag_id : int
        The database id of the tag.
    """

    __tablename__ = "annotation_project_tag"
    __table_args__ = (
        UniqueConstraint(
            "annotation_project_id",
            "tag_id",
        ),
    )

    annotation_project_id: orm.Mapped[int] = orm.mapped_column(
        ForeignKey("annotation_project.id", ondelete="CASCADE"),
        nullable=False,
        primary_key=True,
        index=True,
    )
    tag_id: orm.Mapped[int] = orm.mapped_column(
        ForeignKey("tag.id", ondelete="CASCADE"),
        nullable=False,
        primary_key=True,
        index=True,
    )

    # Relationships
    annotation_project: orm.Mapped[AnnotationProject] = orm.relationship(
        "AnnotationProject",
        init=False,
    )
    tag: orm.Mapped[Tag] = orm.relationship(
        "Tag",
        back_populates="annotation_project_tags",
        init=False,
    )

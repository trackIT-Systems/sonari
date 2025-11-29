"""Annotation Project model.

An annotation project is a focused effort to label specific sound events
in a set of recordings. Each project
has a unique name and is divided into individual tasks, each
consisting of a part of audio from the recordings.
"""

import sqlalchemy.orm as orm

from sonari.models.annotation_task import AnnotationTask
from sonari.models.base import Base

__all__ = [
    "AnnotationProject",
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

    annotation_tasks: orm.Mapped[list["AnnotationTask"]] = orm.relationship(
        back_populates="annotation_project",
        default_factory=list,
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

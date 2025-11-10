"""Python API for annotation projects."""

from typing import Sequence

from sqlalchemy.ext.asyncio import AsyncSession

from sonari import models, schemas
from sonari.api.annotation_tasks import annotation_tasks
from sonari.api.common import BaseAPI
from sonari.filters.annotation_tasks import (
    AnnotationProjectFilter,
)
from sonari.filters.base import Filter

__all__ = [
    "AnnotationProjectAPI",
    "annotation_projects",
]


class AnnotationProjectAPI(
    BaseAPI[
        int,
        models.AnnotationProject,
        schemas.AnnotationProject,
        schemas.AnnotationProjectCreate,
        schemas.AnnotationProjectUpdate,
    ]
):
    _model = models.AnnotationProject
    _schema = schemas.AnnotationProject

    async def create(
        self,
        session: AsyncSession,
        name: str,
        description: str,
        annotation_instructions: str | None = None,
        **kwargs,
    ) -> schemas.AnnotationProject:
        """Create an annotation project.

        Parameters
        ----------
        session
            SQLAlchemy AsyncSession.
        name
            Name of the annotation project.
        description
            Description of the annotation project.
        annotation_instructions
            Intructions for annotators on how to successfully annotate
            an annotation task. This is important for ensuring that
            annotations are consistent across annotators, and provides
            a unambiguous definition of what a completed annotation
            task should look like.
        **kwargs
            Additional keyword arguments to pass to the creation.

        Returns
        -------
        schemas.AnnotationProject
            Created annotation project.
        """
        return await self.create_from_data(
            session,
            schemas.AnnotationProjectCreate(
                name=name,
                description=description,
                annotation_instructions=annotation_instructions,
            ),
            **kwargs,
        )

    async def get_annotation_tasks(
        self,
        session: AsyncSession,
        obj: schemas.AnnotationProject,
        *,
        limit: int = 1000,
        offset: int = 0,
        filters: Sequence[Filter] | None = None,
        sort_by: str | None = "-created_on",
    ) -> tuple[Sequence[schemas.AnnotationTask], int]:
        """Get a list of annotations for an annotation project.

        Parameters
        ----------
        session
            SQLAlchemy AsyncSession.
        obj
            Annotation project to get annotations for.
        limit
            Maximum number of annotations to return. By default 1000.
        offset
            Offset of the first annotation to return. By default 0.
        filters
            Filters to apply. Only annotations matching all filters will
            be returned. By default None.
        sort_by
            Field to sort by.

        Returns
        -------
        annotations : list[schemas.AnnotationTask]
            List of annotation tasks.
        count : int
            Total number of annotations matching the given criteria.
            This number may be larger than the number of annotations
            returned if limit is smaller than the total number of annotations
            matching the given criteria.
        """
        return await annotation_tasks.get_many(
            session,
            limit=limit,
            offset=offset,
            filters=[
                AnnotationProjectFilter(eq=obj.id),
                *(filters or []),
            ],
            sort_by=sort_by,
        )


annotation_projects = AnnotationProjectAPI()

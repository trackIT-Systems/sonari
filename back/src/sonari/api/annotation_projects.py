"""Python API for annotation projects."""

from typing import Sequence

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from sonari import exceptions, models, schemas
from sonari.api import common
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

    async def get_many_with_tags(
        self,
        session: AsyncSession,
        *,
        limit: int | None = 1000,
        offset: int | None = 0,
        filters: Sequence[Filter] | None = None,
        sort_by: str | None = "-created_on",
    ) -> tuple[Sequence[schemas.AnnotationProject], int]:
        """Get many annotation projects with tags eagerly loaded.

        This method is useful when you know you'll need to access the tags
        relationship to avoid lazy loading issues.

        Parameters
        ----------
        session
            The SQLAlchemy AsyncSession of the database to use.
        limit
            The maximum number of objects to return, by default 1000
        offset
            The offset to use, by default 0
        filters
            A list of filters to apply, by default None
        sort_by
            The column to sort by, by default "-created_on"

        Returns
        -------
        projects : Sequence[schemas.AnnotationProject]
            The annotation projects with tags loaded.
        count : int
            The total number of projects matching the filters.
        """
        # Use get_many with noloads=[] to prevent any noload options,
        # then manually add selectinload for tags
        query = select(self._model).options(selectinload(models.AnnotationProject.tags))

        # Apply filters
        if filters:
            for filter_ in filters:
                query = filter_.filter(query)

        # Get count before applying limit/offset
        from sonari.api.common.utils import get_count

        count = await get_count(session, self._model, query)

        # Apply sorting
        if sort_by:
            if sort_by.startswith("-"):
                column = getattr(self._model, sort_by[1:])
                query = query.order_by(column.desc())
            else:
                column = getattr(self._model, sort_by)
                query = query.order_by(column.asc())

        # Apply pagination
        if limit is not None:
            query = query.limit(limit)
        if offset is not None:
            query = query.offset(offset)

        result = await session.execute(query)
        objs = result.unique().scalars().all()

        return [self._schema.model_validate(obj) for obj in objs], count

    async def get_with_tags(
        self,
        session: AsyncSession,
        pk: int,
    ) -> schemas.AnnotationProject:
        """Get a single annotation project with tags eagerly loaded.

        This method is useful when you know you'll need to access the tags
        relationship to avoid lazy loading issues.

        Parameters
        ----------
        session
            The database session to use.
        pk
            The primary key (ID) of the annotation project.

        Returns
        -------
        project : schemas.AnnotationProject
            The annotation project with tags loaded.

        Raises
        ------
        NotFoundError
            If the annotation project could not be found.
        """
        query = select(self._model).where(self._model.id == pk).options(selectinload(models.AnnotationProject.tags))

        result = await session.execute(query)
        obj = result.unique().scalar_one_or_none()

        if obj is None:
            raise exceptions.NotFoundError(f"Annotation project with id {pk} not found")

        data = self._schema.model_validate(obj)
        self._update_cache(data)
        return data

    async def add_tag(
        self,
        session: AsyncSession,
        obj: schemas.AnnotationProject,
        tag: schemas.Tag,
    ) -> schemas.AnnotationProject:
        """Add a tag to an annotation project.

        Parameters
        ----------
        session
            SQLAlchemy AsyncSession.
        obj
            Annotation project to add the tag to.
        tag
            Tag to add.

        Returns
        -------
        schemas.AnnotationProject
            Annotation project with the tag added.
        """
        for t in obj.tags:
            if t.id == tag.id:
                raise exceptions.DuplicateObjectError(f"Tag {tag.id} already exists in annotation project {obj.id}")

        await common.create_object(
            session,
            models.AnnotationProjectTag,
            annotation_project_id=obj.id,
            tag_id=tag.id,
        )

        obj = obj.model_copy(
            update=dict(
                tags=[*obj.tags, tag],
            )
        )
        self._update_cache(obj)
        return obj

    async def remove_tag(
        self,
        session: AsyncSession,
        obj: schemas.AnnotationProject,
        tag: schemas.Tag,
    ) -> schemas.AnnotationProject:
        """Remove a tag from an annotation project.

        Parameters
        ----------
        session
            SQLAlchemy AsyncSession.
        obj
            Annotation project to remove the tag from.
        tag
            Tag to remove.

        Returns
        -------
        schemas.AnnotationProject
            Annotation project with the tag removed.
        """
        for t in obj.tags:
            if t.id == tag.id:
                break
        else:
            raise exceptions.NotFoundError(f"Tag {tag.id} does not exist in annotation project {obj.id}")

        await common.delete_object(
            session,
            models.AnnotationProjectTag,
            and_(
                models.AnnotationProjectTag.annotation_project_id == obj.id,
                models.AnnotationProjectTag.tag_id == tag.id,
            ),
        )

        obj = obj.model_copy(
            update=dict(
                tags=[t for t in obj.tags if t.id != tag.id],
            )
        )
        self._update_cache(obj)
        return obj

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

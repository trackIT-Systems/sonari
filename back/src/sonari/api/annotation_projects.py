"""Python API for annotation projects."""

from typing import Sequence

from soundevent.data import AnnotationState
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from sonari import models, schemas
from sonari.api.annotation_tasks import annotation_tasks
from sonari.api.common import BaseAPI
from sonari.cache import get_or_set, invalidate_cache
from sonari.filters.annotation_tasks import (
    AnnotationProjectFilter,
)
from sonari.filters.base import Filter

__all__ = [
    "AnnotationProjectAPI",
    "annotation_projects",
    "NON_SPECIES_TAG_KEYS",
]

NON_SPECIES_TAG_KEYS = ("pass", "type")


def _count_distinct_if(condition, column):
    """Count distinct column values where condition is true."""
    return func.count(func.distinct(case((condition, column))))


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

    async def get_species_counts(
        self,
        session: AsyncSession,
        annotation_project_id: int,
    ) -> list[schemas.SpeciesTagCount]:
        """Count species tags on sound event annotations in a project.

        Each annotation is classified by its parent task's primary status
        badge (verified > rejected > completed > assigned > none).
        """
        cache_key = f"species_counts:{annotation_project_id}"

        async def compute() -> list[schemas.SpeciesTagCount]:
            task_status = (
                select(
                    models.AnnotationTask.id.label("task_id"),
                    func.max(
                        case(
                            (
                                models.AnnotationStatusBadge.state
                                == AnnotationState.verified,
                                1,
                            ),
                            else_=0,
                        )
                    ).label("has_verified"),
                    func.max(
                        case(
                            (
                                models.AnnotationStatusBadge.state
                                == AnnotationState.rejected,
                                1,
                            ),
                            else_=0,
                        )
                    ).label("has_rejected"),
                    func.max(
                        case(
                            (
                                models.AnnotationStatusBadge.state
                                == AnnotationState.completed,
                                1,
                            ),
                            else_=0,
                        )
                    ).label("has_completed"),
                    func.max(
                        case(
                            (
                                models.AnnotationStatusBadge.state
                                == AnnotationState.assigned,
                                1,
                            ),
                            else_=0,
                        )
                    ).label("has_assigned"),
                )
                .select_from(models.AnnotationTask)
                .outerjoin(
                    models.AnnotationStatusBadge,
                    models.AnnotationStatusBadge.annotation_task_id
                    == models.AnnotationTask.id,
                )
                .where(
                    models.AnnotationTask.annotation_project_id
                    == annotation_project_id,
                )
                .group_by(models.AnnotationTask.id)
            ).subquery()

            annotation_id = models.SoundEventAnnotation.id
            # Mutually exclusive primary status (verified > rejected >
            # accepted/completed > unsure/assigned > no status).
            is_verified = task_status.c.has_verified == 1
            is_rejected = (task_status.c.has_rejected == 1) & (
                task_status.c.has_verified == 0
            )
            is_accepted = (
                (task_status.c.has_completed == 1)
                & (task_status.c.has_verified == 0)
                & (task_status.c.has_rejected == 0)
            )
            is_unsure = (
                (task_status.c.has_assigned == 1)
                & (task_status.c.has_verified == 0)
                & (task_status.c.has_rejected == 0)
                & (task_status.c.has_completed == 0)
            )
            is_no_status = (
                (task_status.c.has_verified == 0)
                & (task_status.c.has_rejected == 0)
                & (task_status.c.has_completed == 0)
                & (task_status.c.has_assigned == 0)
            )

            count_expr = func.count(func.distinct(annotation_id)).label("count")
            query = (
                select(
                    models.Tag.key,
                    models.Tag.value,
                    count_expr,
                    _count_distinct_if(is_accepted, annotation_id).label(
                        "accepted"
                    ),
                    _count_distinct_if(is_verified, annotation_id).label(
                        "verified"
                    ),
                    _count_distinct_if(is_unsure, annotation_id).label("unsure"),
                    _count_distinct_if(is_rejected, annotation_id).label(
                        "rejected"
                    ),
                    _count_distinct_if(is_no_status, annotation_id).label(
                        "no_status"
                    ),
                )
                .select_from(models.AnnotationTask)
                .join(
                    task_status,
                    task_status.c.task_id == models.AnnotationTask.id,
                )
                .join(
                    models.SoundEventAnnotation,
                    models.SoundEventAnnotation.annotation_task_id
                    == models.AnnotationTask.id,
                )
                .join(
                    models.SoundEventAnnotationTag,
                    models.SoundEventAnnotationTag.sound_event_annotation_id
                    == models.SoundEventAnnotation.id,
                )
                .join(
                    models.Tag,
                    models.Tag.id == models.SoundEventAnnotationTag.tag_id,
                )
                .where(
                    models.AnnotationTask.annotation_project_id
                    == annotation_project_id,
                    models.Tag.key.not_in(NON_SPECIES_TAG_KEYS),
                )
                .group_by(models.Tag.key, models.Tag.value)
                .order_by(count_expr.desc(), models.Tag.key, models.Tag.value)
            )

            result = await session.execute(query)
            return [
                schemas.SpeciesTagCount(
                    key=row.key,
                    value=row.value,
                    count=row.count,
                    accepted=row.accepted,
                    verified=row.verified,
                    unsure=row.unsure,
                    rejected=row.rejected,
                    no_status=row.no_status,
                )
                for row in result.all()
            ]

        return await get_or_set(cache_key, compute)

    async def invalidate_species_counts_for_task(
        self,
        session: AsyncSession,
        annotation_task_id: int,
    ) -> None:
        """Invalidate cached species counts for the task's project."""
        result = await session.execute(
            select(models.AnnotationTask.annotation_project_id).where(
                models.AnnotationTask.id == annotation_task_id,
            ),
        )
        project_id = result.scalar_one_or_none()
        if project_id is not None:
            invalidate_cache(f"species_counts:{project_id}")


annotation_projects = AnnotationProjectAPI()

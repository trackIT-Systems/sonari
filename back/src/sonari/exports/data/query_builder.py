"""Database query construction utilities for exports."""

from uuid import UUID

from sqlalchemy import and_, or_, select
from sqlalchemy.orm import joinedload

from sonari import api, models
from sonari.routes.dependencies import Session


async def resolve_project_ids(
    session: Session, annotation_project_uuids: list[UUID]
) -> tuple[list[int], dict[int, models.AnnotationProject]]:
    """Resolve annotation project UUIDs to IDs and return both lists and mapping."""
    projects = await api.annotation_projects.get_many(
        session, limit=-1, filters=[models.AnnotationProject.uuid.in_(annotation_project_uuids)]
    )
    project_list = projects[0]
    if not project_list:
        raise ValueError("No valid annotation projects found")

    project_ids = [p.id for p in project_list]
    projects_by_id = {p.id: p for p in project_list}
    return project_ids, projects_by_id


def build_status_filters(statuses: list[str] | None) -> list:
    """Build status filters for annotation tasks."""
    if not statuses:
        return []

    status_filters = []
    regular_statuses = [s for s in statuses if s != "no"]

    # Add filter for tasks with matching status badges
    if regular_statuses:
        status_filters.append(
            models.AnnotationTask.status_badges.any(models.AnnotationStatusBadge.state.in_(regular_statuses))
        )

    # Add filter for tasks with no status badges
    if "no" in statuses:
        status_filters.append(~models.AnnotationTask.status_badges.any())

    # Combine status filters with OR logic
    if len(status_filters) == 1:
        return [status_filters[0]]
    elif len(status_filters) > 1:
        return [or_(*status_filters)]

    return []


async def get_filtered_annotation_tasks(
    session: Session, project_ids: list[int], statuses: list[str] | None = None, additional_filters: list | None = None
) -> tuple[list[models.AnnotationTask], int]:
    """Get annotation tasks with common filtering logic."""
    filters = [models.AnnotationTask.annotation_project_id.in_(project_ids)]

    # Add status filters
    filters.extend(build_status_filters(statuses))

    # Add any additional filters
    if additional_filters:
        filters.extend(additional_filters)

    # Use a custom query to eagerly load dataset information
    stmt = (
        select(models.AnnotationTask)
        .where(and_(*filters))
        .options(
            joinedload(models.AnnotationTask.clip_annotation)
            .joinedload(models.ClipAnnotation.clip)
            .joinedload(models.Clip.recording)
            .selectinload(models.Recording.recording_datasets)
            .joinedload(models.DatasetRecording.dataset)
        )
    )

    result = await session.execute(stmt)
    tasks = result.unique().scalars().all()

    return (tasks, len(tasks))

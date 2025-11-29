"""REST API routes for annotation projects."""

from typing import Annotated

from fastapi import APIRouter, Depends
from soundevent.data import AnnotationState
from sqlalchemy import func, select

from sonari import api, models, schemas
from sonari.filters.annotation_projects import AnnotationProjectFilter
from sonari.routes.dependencies import Session
from sonari.routes.types import Limit, Offset

__all__ = [
    "annotation_projects_router",
]


annotation_projects_router = APIRouter()


@annotation_projects_router.get(
    "/",
    response_model=schemas.Page[schemas.AnnotationProject],
)
async def get_annotation_projects(
    session: Session,
    filter: Annotated[
        AnnotationProjectFilter, Depends(AnnotationProjectFilter)  # type: ignore
    ],
    limit: Limit = 10,
    offset: Offset = 0,
):
    """Get a page of annotation projects."""
    projects, total = await api.annotation_projects.get_many(
        session,
        limit=limit,
        offset=offset,
        filters=[filter],
    )
    return schemas.Page(
        items=projects,
        total=total,
        limit=limit,
        offset=offset,
    )


@annotation_projects_router.post(
    "/",
    response_model=schemas.AnnotationProject,
)
async def create_annotation_project(
    session: Session,
    data: schemas.AnnotationProjectCreate,
):
    """Create an annotation project."""
    annotation_project = await api.annotation_projects.create(
        session,
        name=data.name,
        description=data.description,
        annotation_instructions=data.annotation_instructions,
    )
    await session.commit()
    return annotation_project


@annotation_projects_router.get(
    "/detail/",
    response_model=schemas.AnnotationProject,
)
async def get_annotation_project(
    session: Session,
    annotation_project_id: int,
):
    """Get an annotation project."""
    return await api.annotation_projects.get(session, annotation_project_id)


@annotation_projects_router.patch(
    "/detail/",
    response_model=schemas.AnnotationProject,
)
async def update_annotation_project(
    session: Session,
    annotation_project_id: int,
    data: schemas.AnnotationProjectUpdate,
):
    """Update an annotation project."""
    annotation_project = await api.annotation_projects.get(
        session,
        annotation_project_id,
    )
    annotation_project = await api.annotation_projects.update(
        session,
        annotation_project,
        data,
    )
    await session.commit()
    return annotation_project


@annotation_projects_router.delete(
    "/detail/",
    response_model=schemas.AnnotationProject,
)
async def delete_annotation_project(
    session: Session,
    annotation_project_id: int,
):
    """Delete an annotation project."""
    annotation_project = await api.annotation_projects.get(
        session,
        annotation_project_id,
    )
    project = await api.annotation_projects.delete(session, annotation_project)
    await session.commit()
    return project


@annotation_projects_router.get(
    "/detail/progress/",
    response_model=schemas.AnnotationProjectProgress,
)
async def get_annotation_project_progress(
    session: Session,
    annotation_project_id: int,
):
    """Get progress statistics for an annotation project.
    
    This endpoint efficiently computes task status counts using SQL aggregation,
    avoiding the need to load all task objects into memory.
    """
    # Get total count of tasks for this project
    total_query = select(func.count(models.AnnotationTask.id)).where(
        models.AnnotationTask.annotation_project_id == annotation_project_id
    )
    total_result = await session.execute(total_query)
    total = total_result.scalar_one()

    # Count tasks by status badge state
    # For each task, we count if it has a badge with each state
    status_query = (
        select(
            models.AnnotationStatusBadge.state,
            func.count(func.distinct(models.AnnotationStatusBadge.annotation_task_id))
        )
        .join(
            models.AnnotationTask,
            models.AnnotationTask.id == models.AnnotationStatusBadge.annotation_task_id
        )
        .where(models.AnnotationTask.annotation_project_id == annotation_project_id)
        .group_by(models.AnnotationStatusBadge.state)
    )
    
    status_result = await session.execute(status_query)
    status_counts = dict(status_result.all())
    
    # Extract counts for each state
    verified = status_counts.get(AnnotationState.verified, 0)
    rejected = status_counts.get(AnnotationState.rejected, 0)
    completed = status_counts.get(AnnotationState.completed, 0)
    assigned = status_counts.get(AnnotationState.assigned, 0)
    
    # Count tasks that are "done" (verified, rejected, or completed)
    # A task is done if it has at least one of these badges
    done_query = (
        select(func.count(func.distinct(models.AnnotationTask.id)))
        .select_from(models.AnnotationTask)
        .join(
            models.AnnotationStatusBadge,
            models.AnnotationTask.id == models.AnnotationStatusBadge.annotation_task_id
        )
        .where(
            models.AnnotationTask.annotation_project_id == annotation_project_id,
            models.AnnotationStatusBadge.state.in_([
                AnnotationState.verified,
                AnnotationState.rejected,
                AnnotationState.completed,
            ])
        )
    )
    done_result = await session.execute(done_query)
    done_count = done_result.scalar_one()
    
    # Pending is total minus done
    pending = total - done_count
    
    return schemas.AnnotationProjectProgress(
        total=total,
        verified=verified,
        rejected=rejected,
        completed=completed,
        assigned=assigned,
        pending=pending,
    )

"""REST API routes for annotation projects."""

from typing import Annotated

from fastapi import Depends, HTTPException
from soundevent.data import AnnotationState
from sqlalchemy import func, select

from sonari import api, models, schemas
from sonari.filters.annotation_projects import AnnotationProjectFilter
from sonari.filters.guided_tour import ExcludeGuidedToursFilter
from sonari.routes.dependencies import Session
from sonari.routes.dependencies.auth import CurrentUser, create_authenticated_router
from sonari.routes.types import Limit, Offset
from sonari.services.guided_tour import (
    ensure_guided_tour,
    first_task_id,
    get_available_guided_tour_variants,
    get_guided_tour_progress,
    get_user_guided_tours,
)

__all__ = [
    "annotation_projects_router",
]


annotation_projects_router = create_authenticated_router()


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
    include_guided_tours: bool = False,
):
    """Get a page of annotation projects."""
    filters: list = [filter]
    if not include_guided_tours:
        filters.append(ExcludeGuidedToursFilter())
    projects, total = await api.annotation_projects.get_many(
        session,
        limit=limit,
        offset=offset,
        filters=filters,
    )
    return schemas.Page(
        items=projects,
        total=total,
        limit=limit,
        offset=offset,
    )


@annotation_projects_router.get(
    "/guided_tour/",
    response_model=schemas.GuidedTourAvailableResponse,
)
async def get_guided_tour_available(session: Session, user: CurrentUser):
    """List available tour variants and the tours the current user has started."""
    variants = await get_available_guided_tour_variants(session)
    tours = await get_user_guided_tours(session, user.id)
    return schemas.GuidedTourAvailableResponse(variants=variants, tours=tours)


@annotation_projects_router.post(
    "/guided_tour/",
    response_model=schemas.GuidedTourEnsureResponse,
)
async def ensure_guided_tour_project(
    session: Session,
    user: CurrentUser,
    body: schemas.GuidedTourEnsureRequest,
):
    """Create or return the current user's personal guided tour project."""
    try:
        project, created = await ensure_guided_tour(
            session,
            user,
            body.variant,
            reset=body.reset,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    task_id = await first_task_id(session, project.id)
    _, _, resume_task_id = await get_guided_tour_progress(session, project.id)
    await session.commit()
    return schemas.GuidedTourEnsureResponse(
        annotation_project_id=project.id,
        first_annotation_task_id=task_id,
        resume_annotation_task_id=resume_task_id,
        created=created,
        variant=body.variant,
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
            func.count(func.distinct(models.AnnotationStatusBadge.annotation_task_id)),
        )
        .join(models.AnnotationTask, models.AnnotationTask.id == models.AnnotationStatusBadge.annotation_task_id)
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
        .join(models.AnnotationStatusBadge, models.AnnotationTask.id == models.AnnotationStatusBadge.annotation_task_id)
        .where(
            models.AnnotationTask.annotation_project_id == annotation_project_id,
            models.AnnotationStatusBadge.state.in_([
                AnnotationState.verified,
                AnnotationState.rejected,
                AnnotationState.completed,
            ]),
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


@annotation_projects_router.get(
    "/detail/species_counts/",
    response_model=list[schemas.SpeciesTagCount],
)
async def get_annotation_project_species_counts(
    session: Session,
    annotation_project_id: int,
):
    """Get species tag counts for sound event annotations in a project."""
    return await api.annotation_projects.get_species_counts(
        session,
        annotation_project_id,
    )

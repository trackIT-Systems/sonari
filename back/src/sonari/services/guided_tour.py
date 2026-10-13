"""Guided user tour: clone template projects per user."""

from __future__ import annotations

import datetime
from uuid import UUID

from sqlalchemy import delete, insert, select
from sqlalchemy.ext.asyncio import AsyncSession

from sonari import api, exceptions, models, schemas
from sonari.schemas.annotation_projects import GuidedTourVariant

__all__ = [
    "ensure_guided_tour",
    "get_available_guided_tour_variants",
    "get_guided_tour_progress",
    "get_user_guided_tours",
    "guided_tour_personal_name",
    "guided_tour_template_name",
]

GUIDED_TOUR_VARIANTS: tuple[GuidedTourVariant, ...] = ("bird", "bat")


def guided_tour_template_name(variant: GuidedTourVariant) -> str:
    return f"Sonari guided tour template — {variant}"


def guided_tour_personal_name(variant: GuidedTourVariant, username: str) -> str:
    return f"Sonari guided tour — {variant} — {username}"


async def get_template_project(
    session: AsyncSession,
    variant: GuidedTourVariant,
) -> schemas.AnnotationProject | None:
    try:
        return await api.annotation_projects.find(
            session,
            [
                models.AnnotationProject.is_guided_tour.is_(True),
                models.AnnotationProject.guided_tour_owner_user_id.is_(None),
                models.AnnotationProject.guided_tour_variant == variant,
            ],
        )
    except exceptions.NotFoundError:
        return None


async def get_available_guided_tour_variants(
    session: AsyncSession,
) -> list[GuidedTourVariant]:
    available: list[GuidedTourVariant] = []
    for variant in GUIDED_TOUR_VARIANTS:
        if await get_template_project(session, variant) is not None:
            available.append(variant)
    return available


async def get_user_guided_tour_project(
    session: AsyncSession,
    user_id: UUID,
    variant: GuidedTourVariant,
) -> schemas.AnnotationProject | None:
    try:
        return await api.annotation_projects.find(
            session,
            [
                models.AnnotationProject.is_guided_tour.is_(True),
                models.AnnotationProject.guided_tour_owner_user_id == user_id,
                models.AnnotationProject.guided_tour_variant == variant,
            ],
        )
    except exceptions.NotFoundError:
        return None


def _now() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc)


async def _clone_project_tasks(
    session: AsyncSession,
    template_id: int,
    dest_project_id: int,
    user_id: UUID,
) -> None:
    """Copy all template tasks with their sound events, tags and features.

    Uses a few bulk statements instead of per-object API calls, so a full
    tour clones in milliseconds. Notes and status badges are not copied.
    """
    task_t = models.AnnotationTask.__table__
    task_tag_t = models.AnnotationTaskTag.__table__
    task_feature_t = models.AnnotationTaskFeature.__table__
    sea_t = models.SoundEventAnnotation.__table__
    sea_tag_t = models.SoundEventAnnotationTag.__table__
    sea_feature_t = models.SoundEventAnnotationFeature.__table__
    now = _now()

    # Same order as the lesson index (recording date/time, then id), so new
    # ids keep ties in template order.
    source_tasks = (
        await session.execute(
            select(task_t.c.id, task_t.c.recording_id, task_t.c.start_time, task_t.c.end_time)
            .join(models.Recording.__table__, models.Recording.id == task_t.c.recording_id)
            .where(task_t.c.annotation_project_id == template_id)
            .order_by(models.Recording.date, models.Recording.time, task_t.c.id),
        )
    ).all()
    if not source_tasks:
        return

    new_task_ids = (
        await session.execute(
            insert(task_t).returning(task_t.c.id, sort_by_parameter_order=True),
            [
                {
                    "annotation_project_id": dest_project_id,
                    "recording_id": t.recording_id,
                    "start_time": t.start_time,
                    "end_time": t.end_time,
                    "created_on": now,
                }
                for t in source_tasks
            ],
        )
    ).scalars().all()
    task_map = {t.id: new_id for t, new_id in zip(source_tasks, new_task_ids, strict=True)}
    source_task_ids = list(task_map)

    task_tags = (
        await session.execute(
            select(task_tag_t.c.annotation_task_id, task_tag_t.c.tag_id)
            .where(task_tag_t.c.annotation_task_id.in_(source_task_ids))
            .distinct(),
        )
    ).all()
    if task_tags:
        await session.execute(
            insert(task_tag_t),
            [
                {
                    "annotation_task_id": task_map[r.annotation_task_id],
                    "tag_id": r.tag_id,
                    "created_by_id": user_id,
                    "created_on": now,
                }
                for r in task_tags
            ],
        )

    task_features = (
        await session.execute(
            select(task_feature_t.c.annotation_task_id, task_feature_t.c.name, task_feature_t.c.value)
            .where(task_feature_t.c.annotation_task_id.in_(source_task_ids)),
        )
    ).all()
    if task_features:
        await session.execute(
            insert(task_feature_t),
            [
                {
                    "annotation_task_id": task_map[r.annotation_task_id],
                    "name": r.name,
                    "value": r.value,
                    "created_on": now,
                }
                for r in task_features
            ],
        )

    source_events = (
        await session.execute(
            select(
                sea_t.c.id,
                sea_t.c.annotation_task_id,
                sea_t.c.recording_id,
                sea_t.c.geometry_type,
                sea_t.c.geometry,
            )
            .where(sea_t.c.annotation_task_id.in_(source_task_ids))
            .order_by(sea_t.c.id),
        )
    ).all()
    if not source_events:
        return

    new_event_ids = (
        await session.execute(
            insert(sea_t).returning(sea_t.c.id, sort_by_parameter_order=True),
            [
                {
                    "annotation_task_id": task_map[e.annotation_task_id],
                    "recording_id": e.recording_id,
                    "geometry_type": e.geometry_type,
                    "geometry": e.geometry,
                    "created_by_id": user_id,
                    "created_on": now,
                }
                for e in source_events
            ],
        )
    ).scalars().all()
    event_map = {e.id: new_id for e, new_id in zip(source_events, new_event_ids, strict=True)}
    source_event_ids = list(event_map)

    event_tags = (
        await session.execute(
            select(sea_tag_t.c.sound_event_annotation_id, sea_tag_t.c.tag_id)
            .where(sea_tag_t.c.sound_event_annotation_id.in_(source_event_ids))
            .distinct(),
        )
    ).all()
    if event_tags:
        await session.execute(
            insert(sea_tag_t),
            [
                {
                    "sound_event_annotation_id": event_map[r.sound_event_annotation_id],
                    "tag_id": r.tag_id,
                    "created_by_id": user_id,
                    "created_on": now,
                }
                for r in event_tags
            ],
        )

    event_features = (
        await session.execute(
            select(sea_feature_t.c.sound_event_annotation_id, sea_feature_t.c.name, sea_feature_t.c.value)
            .where(sea_feature_t.c.sound_event_annotation_id.in_(source_event_ids)),
        )
    ).all()
    if event_features:
        await session.execute(
            insert(sea_feature_t),
            [
                {
                    "sound_event_annotation_id": event_map[r.sound_event_annotation_id],
                    "name": r.name,
                    "value": r.value,
                    "created_on": now,
                }
                for r in event_features
            ],
        )


async def _delete_project_tasks(
    session: AsyncSession,
    project: schemas.AnnotationProject,
) -> None:
    """Delete every task of a project with all dependent rows.

    Children are deleted explicitly instead of relying on FK cascades, which
    SQLite does not enforce.
    """
    task_ids = select(models.AnnotationTask.id).where(
        models.AnnotationTask.annotation_project_id == project.id,
    )
    event_ids = select(models.SoundEventAnnotation.id).where(
        models.SoundEventAnnotation.annotation_task_id.in_(task_ids),
    )
    for model, column in (
        (models.SoundEventAnnotationTag, models.SoundEventAnnotationTag.sound_event_annotation_id),
        (models.SoundEventAnnotationFeature, models.SoundEventAnnotationFeature.sound_event_annotation_id),
    ):
        await session.execute(delete(model).where(column.in_(event_ids)))
    for model, column in (
        (models.SoundEventAnnotation, models.SoundEventAnnotation.annotation_task_id),
        (models.AnnotationTaskTag, models.AnnotationTaskTag.annotation_task_id),
        (models.AnnotationTaskFeature, models.AnnotationTaskFeature.annotation_task_id),
        (models.AnnotationStatusBadge, models.AnnotationStatusBadge.annotation_task_id),
        (models.Note, models.Note.annotation_task_id),
    ):
        await session.execute(delete(model).where(column.in_(task_ids)))
    await session.execute(
        delete(models.AnnotationTask).where(models.AnnotationTask.annotation_project_id == project.id),
    )


async def _get_or_create_template(
    session: AsyncSession,
    variant: GuidedTourVariant,
) -> schemas.AnnotationProject:
    template = await get_template_project(session, variant)
    if template is not None:
        return template

    return await api.annotation_projects.create(
        session,
        name=guided_tour_template_name(variant),
        description="Hidden template for guided user tours.",
        is_guided_tour=True,
        guided_tour_variant=variant,
        guided_tour_owner_user_id=None,
    )


async def ensure_guided_tour(
    session: AsyncSession,
    user: schemas.SimpleUser,
    variant: GuidedTourVariant,
    *,
    reset: bool = False,
) -> tuple[schemas.AnnotationProject, bool]:
    """Ensure the user has a guided tour project; clone from template if needed."""
    template = await get_template_project(session, variant)
    if template is None:
        raise ValueError(
            f"No guided tour template for variant '{variant}' on this server.",
        )

    existing = await get_user_guided_tour_project(session, user.id, variant)

    if existing is not None and not reset:
        return existing, False

    if existing is not None:
        # Start from scratch: same project, template state restored (badges,
        # edits and deletions are discarded).
        await _delete_project_tasks(session, existing)
        await _clone_project_tasks(session, template.id, existing.id, user.id)
        return existing, True

    tour_name = guided_tour_personal_name(variant, user.username)
    tour = await api.annotation_projects.create(
        session,
        name=tour_name,
        description="Personal guided tour — hidden from project list.",
        is_guided_tour=True,
        guided_tour_variant=variant,
        guided_tour_owner_user_id=user.id,
    )
    await _clone_project_tasks(session, template.id, tour.id, user.id)
    return tour, True


async def get_guided_tour_progress(
    session: AsyncSession,
    project_id: int,
) -> tuple[int, int, int | None]:
    """Return (total tasks, tasks with a status badge, task to resume at).

    The resume task is the first task without a badge in lesson order, or the
    last task once everything is badged.
    """
    task_t = models.AnnotationTask.__table__
    badge_t = models.AnnotationStatusBadge.__table__
    has_badge = (
        select(badge_t.c.id).where(badge_t.c.annotation_task_id == task_t.c.id).exists()
    )
    rows = (
        await session.execute(
            select(task_t.c.id, has_badge.label("done"))
            .join(models.Recording.__table__, models.Recording.id == task_t.c.recording_id)
            .where(task_t.c.annotation_project_id == project_id)
            .order_by(models.Recording.date, models.Recording.time, task_t.c.id),
        )
    ).all()
    if not rows:
        return 0, 0, None
    done = sum(1 for r in rows if r.done)
    resume = next((r.id for r in rows if not r.done), rows[-1].id)
    return len(rows), done, resume


async def get_user_guided_tours(
    session: AsyncSession,
    user_id: UUID,
) -> list[schemas.GuidedTourProgress]:
    """List the user's existing personal tours with their progress."""
    tours: list[schemas.GuidedTourProgress] = []
    for variant in GUIDED_TOUR_VARIANTS:
        project = await get_user_guided_tour_project(session, user_id, variant)
        if project is None:
            continue
        total, done, resume = await get_guided_tour_progress(session, project.id)
        tours.append(
            schemas.GuidedTourProgress(
                variant=variant,
                annotation_project_id=project.id,
                total_tasks=total,
                done_tasks=done,
                resume_annotation_task_id=resume,
            ),
        )
    return tours


async def first_task_id(
    session: AsyncSession,
    project_id: int,
) -> int | None:
    tasks, _ = await api.annotation_tasks.get_many(
        session,
        limit=1,
        offset=0,
        filters=[models.AnnotationTask.annotation_project_id == project_id],
        sort_by="recording_datetime",
    )
    if not tasks:
        return None
    return tasks[0].id

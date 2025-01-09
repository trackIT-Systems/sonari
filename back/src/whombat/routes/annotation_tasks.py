"""REST API routes for annotation tasks."""

import math
import random
from datetime import datetime, timedelta, timezone
from typing import Annotated, Any, Dict, Sequence
from uuid import UUID

from astral import LocationInfo
from astral.sun import sun
from fastapi import APIRouter, Depends
from soundevent.data import AnnotationState
from sqlalchemy.orm.attributes import InstrumentedAttribute

from whombat import api, models, schemas
from whombat.filters.annotation_tasks import AnnotationTaskFilter
from whombat.filters.clips import UUIDFilter as ClipUUIDFilter
from whombat.routes.dependencies import Session, get_current_user_dependency
from whombat.routes.dependencies.settings import WhombatSettings
from whombat.routes.types import Limit, Offset

__all__ = [
    "get_annotation_tasks_router",
]


def _get_night_day_tasks(
    tasks: Sequence[schemas.AnnotationTask],
    tz: str,
    night: bool,
) -> tuple[Sequence[schemas.AnnotationTask], int]:
    done_days = {}
    kept_tasks = []

    for task in tasks:
        clip_annotation: schemas.ClipAnnotation | None = task.clip_annotation
        if clip_annotation is None:
            kept_tasks.append(task)
            continue

        clip: schemas.Clip | None = clip_annotation.clip
        if clip is None:
            kept_tasks.append(task)
            continue

        recording: schemas.Recording = clip.recording
        if recording.time is None or recording.date is None:
            kept_tasks.append(task)
            continue

        if recording.latitude is None or recording.longitude is None:
            observer = LocationInfo(timezone=tz).observer
        else:
            observer = LocationInfo(latitude=recording.latitude, longitude=recording.longitude).observer

        if recording.date not in done_days:
            s: Dict[str, datetime] = sun(observer, date=recording.date)
            done_days[recording.date] = (s["sunset"], s["sunrise"])

        sunset, sunrise = done_days[recording.date]
        rec_datetime = datetime.combine(recording.date, recording.time).replace(tzinfo=timezone.utc)

        if night:
            sunset_buffer = sunset - timedelta(hours=1)
            sunrise_buffer = sunrise + timedelta(hours=1)
            is_night_time = rec_datetime >= sunset_buffer or rec_datetime <= sunrise_buffer
            if is_night_time:
                kept_tasks.append(task)
        else:
            sunrise_buffer = sunrise - timedelta(hours=1)
            sunset_buffer = sunset + timedelta(hours=1)
            is_day_time = rec_datetime >= sunrise_buffer and rec_datetime <= sunset_buffer
            if is_day_time:
                kept_tasks.append(task)

    return kept_tasks, len(kept_tasks)


def get_annotation_tasks_router(settings: WhombatSettings) -> APIRouter:
    """Get the API router for annotation tasks."""
    active_user = get_current_user_dependency(settings)

    annotation_tasks_router = APIRouter()

    @annotation_tasks_router.post(
        "/",
        response_model=list[schemas.AnnotationTask],
    )
    async def create_tasks(
        session: Session,
        annotation_project_uuid: UUID,
        clip_uuids: list[UUID],
    ):
        """Create multiple annotation tasks."""
        annotation_project = await api.annotation_projects.get(
            session,
            annotation_project_uuid,
        )
        clips, _ = await api.clips.get_many(
            session,
            limit=-1,
            filters=[
                ClipUUIDFilter(
                    isin=clip_uuids,
                ),
            ],
        )
        # Create empty clip annotations
        clip_annotations = await api.clip_annotations.create_many(
            session,
            data=[dict(clip_id=clip.id) for clip in clips],
        )
        tasks = await api.annotation_tasks.create_many_without_duplicates(
            session,
            data=[
                dict(
                    annotation_project_id=annotation_project.id,
                    clip_annotation_id=clip_annotation.id,
                    clip_id=clip_annotation.clip.id,
                )
                for clip_annotation in clip_annotations
            ],
            return_all=True,
        )
        await session.commit()
        return tasks

    @annotation_tasks_router.get(
        "/",
        response_model=schemas.Page[schemas.AnnotationTask],
    )
    async def get_tasks(
        session: Session,
        filter: Annotated[AnnotationTaskFilter, Depends(AnnotationTaskFilter)],  # type: ignore
        limit: Limit = 10,
        offset: Offset = 0,
        sort_by: str = "recording_datetime",
    ):
        """Get a page of annotation tasks."""
        nigh_filter = next((f for f in filter if f[0] == "night__tz" and f[1] is not None), None)
        day_filter = next((f for f in filter if f[0] == "day__tz" and f[1] is not None), None)
        sample_filter = next((f for f in filter if f[0] == "sample__eq" and f[1] is not None), None)

        if limit == -1:
            noloads: list[InstrumentedAttribute[Any]] | None = [models.AnnotationTask.clip]

            if nigh_filter is not None and day_filter is not None:
                noloads.append(models.AnnotationTask.clip_annotation)

        else:
            noloads = None

        tasks, total = await api.annotation_tasks.get_many(
            session,
            limit=limit,
            offset=offset,
            filters=[filter],
            sort_by=sort_by,
            noloads=noloads,
        )

        if nigh_filter is not None:
            tasks, total = _get_night_day_tasks(tasks, nigh_filter[1], True)
        if day_filter is not None:
            tasks, total = _get_night_day_tasks(tasks, day_filter[1], False)

        if sample_filter is not None:
            random.seed(35039)
            total = math.ceil(total * float(sample_filter[1]))
            tasks = random.sample(tasks, total)

        return schemas.Page(
            items=tasks,
            total=total,
            limit=limit,
            offset=offset,
        )

    @annotation_tasks_router.delete(
        "/detail/",
        response_model=schemas.AnnotationTask,
    )
    async def delete_task(
        session: Session,
        annotation_task_uuid: UUID,
    ):
        """Remove a clip from an annotation project."""
        annotation_task = await api.annotation_tasks.get(
            session,
            annotation_task_uuid,
        )
        annotation_task = await api.annotation_tasks.delete(
            session,
            annotation_task,
        )
        await session.commit()
        return annotation_task

    @annotation_tasks_router.get(
        "/detail/",
        response_model=schemas.AnnotationTask,
    )
    async def get_task(
        session: Session,
        annotation_task_uuid: UUID,
    ):
        """Get an annotation task."""
        return await api.annotation_tasks.get(session, annotation_task_uuid)

    @annotation_tasks_router.get(
        "/detail/clip_annotation/",
        response_model=schemas.ClipAnnotation,
    )
    async def get_task_annotations(
        session: Session,
        annotation_task_uuid: UUID,
    ) -> schemas.ClipAnnotation:
        """Get an annotation task."""
        annotation_task = await api.annotation_tasks.get(
            session,
            annotation_task_uuid,
        )
        return await api.annotation_tasks.get_clip_annotation(session, annotation_task)

    @annotation_tasks_router.post(
        "/detail/badges/",
        response_model=schemas.AnnotationTask,
    )
    async def add_annotation_status_badge(
        session: Session,
        annotation_task_uuid: UUID,
        state: AnnotationState,
        user: Annotated[schemas.SimpleUser, Depends(active_user)],
    ):
        """Add a badge to an annotation task."""
        annotation_task = await api.annotation_tasks.get(
            session,
            annotation_task_uuid,
        )
        updated = await api.annotation_tasks.add_status_badge(
            session,
            annotation_task,
            state,
            user,
        )
        await session.commit()
        return updated

    @annotation_tasks_router.delete(
        "/detail/badges/",
        response_model=schemas.AnnotationTask,
    )
    async def remove_annotation_status_badge(
        session: Session,
        annotation_task_uuid: UUID,
        state: AnnotationState,
        user_id: str | None = None,
    ):
        """Remove a badge from an annotation task."""
        annotation_task = await api.annotation_tasks.get(
            session,
            annotation_task_uuid,
        )
        updated = await api.annotation_tasks.remove_status_badge(
            session,
            annotation_task,
            state,
            user_id,
        )
        await session.commit()
        return updated

    return annotation_tasks_router

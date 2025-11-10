"""REST API routes for annotation tasks."""

import math
import random
from datetime import datetime, timedelta, timezone
from typing import Annotated, Dict, Sequence

from astral import LocationInfo
from astral.sun import sun
from fastapi import APIRouter, Depends
from soundevent.data import AnnotationState

from sonari import api, schemas
from sonari.filters.annotation_tasks import AnnotationTaskFilter
from sonari.filters.recordings import IDFilter as RecordingIDFilter
from sonari.routes.dependencies import Session, get_current_user_dependency
from sonari.routes.dependencies.settings import SonariSettings
from sonari.routes.types import Limit, Offset

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
        recording: schemas.Recording = task.recording
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


def get_annotation_tasks_router(settings: SonariSettings) -> APIRouter:
    """Get the API router for annotation tasks."""
    active_user = get_current_user_dependency(settings)

    annotation_tasks_router = APIRouter()

    @annotation_tasks_router.post(
        "/",
        response_model=list[schemas.AnnotationTask],
    )
    async def create_tasks(
        session: Session,
        annotation_project_id: int,
        data: list[tuple[int, schemas.AnnotationTaskCreate]],
    ):
        """Create multiple annotation tasks.

        Parameters
        ----------
        annotation_project_id
            The ID of the annotation project.
        data
            List of tuples (recording_id, task_create_data).
        """
        annotation_project = await api.annotation_projects.get(
            session,
            annotation_project_id,
        )

        # Get all recordings
        recording_ids = list(set(recording_id for recording_id, _ in data))
        recordings, _ = await api.recordings.get_many(
            session,
            filters=[RecordingIDFilter(isin=recording_ids)],
            limit=None,
            sort_by=None,
        )
        recording_mapping = {recording.id: recording for recording in recordings}

        # Create annotation tasks directly
        tasks = await api.annotation_tasks.create_many_without_duplicates(
            session,
            data=[
                dict(
                    annotation_project_id=annotation_project.id,
                    recording_id=recording_mapping[recording_id].id,
                    start_time=task_data.start_time,
                    end_time=task_data.end_time,
                )
                for recording_id, task_data in data
                if recording_id in recording_mapping
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
        include_recording: bool = False,
        include_annotation_project: bool = False,
        include_sound_event_annotations: bool = False,
        include_tags: bool = False,
        include_notes: bool = False,
        include_features: bool = False,
    ):
        """Get a page of annotation tasks."""
        nigh_filter = next((f for f in filter if f[0] == "night__tz" and f[1] is not None), None)
        day_filter = next((f for f in filter if f[0] == "day__tz" and f[1] is not None), None)
        sample_filter = next((f for f in filter if f[0] == "sample__eq" and f[1] is not None), None)

        tasks, total = await api.annotation_tasks.get_many(
            session,
            limit=limit,
            offset=offset,
            filters=[filter],
            sort_by=sort_by,
            include_recording=include_recording,
            include_annotation_project=include_annotation_project,
            include_sound_event_annotations=include_sound_event_annotations,
            include_tags=include_tags,
            include_notes=include_notes,
            include_features=include_features,
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
        annotation_task_id: int,
    ):
        """Delete an annotation task."""
        annotation_task = await api.annotation_tasks.get(
            session,
            annotation_task_id,
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
        annotation_task_id: int,
        include_recording: bool = False,
        include_annotation_project: bool = False,
        include_sound_event_annotations: bool = False,
        include_tags: bool = False,
        include_notes: bool = False,
        include_features: bool = False,
    ):
        """Get an annotation task."""
        return await api.annotation_tasks.get(
            session,
            annotation_task_id,
            include_recording=include_recording,
            include_annotation_project=include_annotation_project,
            include_sound_event_annotations=include_sound_event_annotations,
            include_tags=include_tags,
            include_notes=include_notes,
            include_features=include_features,
        )

    @annotation_tasks_router.post(
        "/detail/tags/",
        response_model=schemas.AnnotationTask,
    )
    async def add_tag_to_task(
        session: Session,
        annotation_task_id: int,
        tag: schemas.TagCreate,
        user: Annotated[schemas.SimpleUser, Depends(active_user)],
    ):
        """Add a tag to an annotation task."""
        annotation_task = await api.annotation_tasks.get(session, annotation_task_id)
        tag_obj = await api.tags.from_name(session, key=tag.key, value=tag.value)
        updated = await api.annotation_tasks.add_tag(
            session,
            annotation_task,
            tag_obj,
            user=user,
        )
        await session.commit()
        return updated

    @annotation_tasks_router.delete(
        "/detail/tags/",
        response_model=schemas.AnnotationTask,
    )
    async def remove_tag_from_task(
        session: Session,
        annotation_task_id: int,
        key: str,
        value: str,
    ):
        """Remove a tag from an annotation task."""
        annotation_task = await api.annotation_tasks.get(session, annotation_task_id)
        tag = await api.tags.from_name(session, key=key, value=value)
        updated = await api.annotation_tasks.remove_tag(
            session,
            annotation_task,
            tag,
        )
        await session.commit()
        return updated

    @annotation_tasks_router.post(
        "/detail/notes/",
        response_model=schemas.AnnotationTask,
    )
    async def add_note_to_task(
        session: Session,
        annotation_task_id: int,
        note: schemas.NoteCreate,
        user: Annotated[schemas.SimpleUser, Depends(active_user)],
    ):
        """Add a note to an annotation task."""
        annotation_task = await api.annotation_tasks.get(session, annotation_task_id)
        note_obj = await api.notes.create(
            session,
            message=note.message,
            is_issue=note.is_issue,
            created_by=user,
        )
        updated = await api.annotation_tasks.add_note(
            session,
            annotation_task,
            note_obj,
        )
        await session.commit()
        return updated

    @annotation_tasks_router.delete(
        "/detail/notes/",
        response_model=schemas.AnnotationTask,
    )
    async def remove_note_from_task(
        session: Session,
        annotation_task_id: int,
        note_id: int,
    ):
        """Remove a note from an annotation task."""
        annotation_task = await api.annotation_tasks.get(session, annotation_task_id)
        note = await api.notes.get(session, note_id)
        updated = await api.annotation_tasks.remove_note(
            session,
            annotation_task,
            note,
        )
        await session.commit()
        return updated

    @annotation_tasks_router.post(
        "/detail/badges/",
        response_model=schemas.AnnotationTask,
    )
    async def add_annotation_status_badge(
        session: Session,
        annotation_task_id: int,
        state: AnnotationState,
        user: Annotated[schemas.SimpleUser, Depends(active_user)],
    ):
        """Add a badge to an annotation task."""
        annotation_task = await api.annotation_tasks.get(
            session,
            annotation_task_id,
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
        annotation_task_id: int,
        state: AnnotationState,
        user_id: str | None = None,
    ):
        """Remove a badge from an annotation task."""
        annotation_task = await api.annotation_tasks.get(
            session,
            annotation_task_id,
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

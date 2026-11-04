"""Tests for AnnotationTaskAPI - create, get_many with custom sort."""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from sonari import api, models, schemas


@pytest.mark.asyncio
async def test_annotation_tasks_create(
    db_session: AsyncSession,
    test_annotation_project: schemas.AnnotationProject,
    test_recording_id: int,
):
    """Test AnnotationTaskAPI.create creates task."""
    recording = await api.recordings.get(db_session, test_recording_id)
    duration = min(3.0, recording.duration) if recording.duration else 3.0
    task = await api.annotation_tasks.create(
        db_session,
        annotation_project=test_annotation_project,
        recording=recording,
        start_time=0.0,
        end_time=duration,
    )
    await db_session.commit()
    assert task is not None
    assert task.id is not None
    assert task.annotation_project_id == test_annotation_project.id
    assert task.recording_id == recording.id
    assert task.start_time == 0.0
    assert task.end_time == duration


@pytest.mark.asyncio
async def test_annotation_tasks_get_many_sort_by_recording_datetime(
    db_session: AsyncSession,
    test_annotation_task: schemas.AnnotationTask,
):
    """Test get_many with sort_by=recording_datetime."""
    tasks, count = await api.annotation_tasks.get_many(
        db_session,
        limit=10,
        filters=[models.AnnotationTask.id == test_annotation_task.id],
        sort_by="recording_datetime",
    )
    assert len(tasks) >= 1
    assert count >= 1


@pytest.mark.asyncio
async def test_annotation_tasks_get_many_sort_by_duration(
    db_session: AsyncSession,
    test_annotation_task: schemas.AnnotationTask,
):
    """Test get_many with sort_by=duration."""
    tasks, count = await api.annotation_tasks.get_many(
        db_session,
        limit=10,
        filters=[models.AnnotationTask.id == test_annotation_task.id],
        sort_by="duration",
    )
    assert len(tasks) >= 1
    assert count >= 1


@pytest.mark.asyncio
async def test_annotation_tasks_get_many_sort_by_duration_desc(
    db_session: AsyncSession,
    test_annotation_task: schemas.AnnotationTask,
):
    """Test get_many with sort_by=-duration."""
    tasks, count = await api.annotation_tasks.get_many(
        db_session,
        limit=10,
        filters=[models.AnnotationTask.id == test_annotation_task.id],
        sort_by="-duration",
    )
    assert len(tasks) >= 1


@pytest.mark.asyncio
async def test_annotation_tasks_get_many_sort_by_recording(
    db_session: AsyncSession,
    test_annotation_task: schemas.AnnotationTask,
):
    """Test get_many with sort_by=recording (recording path)."""
    tasks, count = await api.annotation_tasks.get_many(
        db_session,
        limit=10,
        filters=[models.AnnotationTask.id == test_annotation_task.id],
        sort_by="recording",
    )
    assert len(tasks) >= 1


@pytest.mark.asyncio
async def test_annotation_tasks_get_index(
    db_session: AsyncSession,
    test_annotation_task: schemas.AnnotationTask,
):
    """Test get_index returns minimal task indices."""
    indices, count = await api.annotation_tasks.get_index(
        db_session,
        limit=10,
        filters=[models.AnnotationTask.id == test_annotation_task.id],
    )
    assert len(indices) >= 1
    assert all(hasattr(idx, "id") and hasattr(idx, "recording_id") for idx in indices)


async def _task_with_confidences(
    db_session: AsyncSession,
    task: schemas.AnnotationTask,
    tag: schemas.Tag,
    user,
    confidences: list[float],
):
    from sonari.schemas.sound_event_annotations import SoundEventAnnotationCreate

    created_by = schemas.SimpleUser.model_validate(user)
    for i, confidence in enumerate(confidences):
        geometry = SoundEventAnnotationCreate(
            geometry={"type": "BoundingBox", "coordinates": [0.1 * i, 100.0, 0.1 * i + 0.05, 500.0]},
            tags=[],
        ).geometry
        annotation = await api.sound_event_annotations.create(
            db_session,
            annotation_task=task,
            geometry=geometry,
            created_by=created_by,
        )
        annotation = await api.sound_event_annotations.get(
            db_session, annotation.id, include_tags=True, include_features=True
        )
        annotation = await api.sound_event_annotations.add_tag(db_session, annotation, tag, user=created_by)
        await api.sound_event_annotations.add_feature(
            db_session,
            annotation,
            schemas.Feature(name="detection_confidence", value=confidence),
        )
    await db_session.commit()


@pytest.mark.asyncio
async def test_sound_event_tag_stats_and_median_filter(
    db_session: AsyncSession,
    test_annotation_task: schemas.AnnotationTask,
    test_tag: schemas.Tag,
    test_user,
):
    """Tag stats expose median/max confidence, and the median filter uses the same median."""
    from sonari.filters.annotation_tasks import AnnotationTaskFilter

    await _task_with_confidences(db_session, test_annotation_task, test_tag, test_user, [0.2, 0.9, 0.4])

    task = await api.annotation_tasks.get(db_session, test_annotation_task.id, include_sound_event_tags=True)
    (stats,) = [s for s in task.sound_event_tag_stats if s.key == test_tag.key]
    assert stats.count == 3
    assert stats.median_confidence == pytest.approx(0.4)
    assert stats.max_confidence == pytest.approx(0.9)

    async def matches(gt=None, lt=None) -> bool:
        tasks, _ = await api.annotation_tasks.get_many(
            db_session,
            limit=10,
            filters=[
                models.AnnotationTask.id == test_annotation_task.id,
                AnnotationTaskFilter(median_confidence__gt=gt, median_confidence__lt=lt),
            ],
        )
        return len(tasks) == 1

    # Median is 0.4 (the mean would be 0.5, the max 0.9)
    assert await matches(gt=0.3, lt=0.45)
    assert not await matches(gt=0.45)
    assert not await matches(lt=0.35)


@pytest.mark.asyncio
async def test_median_filter_respects_other_filters(
    db_session: AsyncSession,
    test_annotation_task: schemas.AnnotationTask,
    test_tag: schemas.Tag,
    test_user,
):
    """The median filter combines with other filters (candidate restriction)."""
    from sonari.filters.annotation_tasks import AnnotationTaskFilter

    await _task_with_confidences(db_session, test_annotation_task, test_tag, test_user, [0.2, 0.9, 0.4])

    async def count(project_id: int, tag: bool) -> int:
        extra = (
            dict(
                sound_event_annotation_tag__keys=test_tag.key,
                sound_event_annotation_tag__values=test_tag.value,
            )
            if tag
            else {}
        )
        tasks, _ = await api.annotation_tasks.get_many(
            db_session,
            limit=10,
            filters=[
                models.AnnotationTask.id == test_annotation_task.id,
                AnnotationTaskFilter(
                    annotation_project__eq=project_id,
                    median_confidence__gt=0.3,
                    median_confidence__lt=0.45,
                    **extra,
                ),
            ],
        )
        return len(tasks)

    project_id = test_annotation_task.annotation_project_id
    for tag in (False, True):
        assert await count(project_id, tag) == 1
        assert await count(project_id + 1000, tag) == 0


async def _project_tasks(db_session: AsyncSession, project: schemas.AnnotationProject, recording_id: int, n: int):
    recording = await api.recordings.get(db_session, recording_id)
    tasks = [
        await api.annotation_tasks.create(
            db_session,
            annotation_project=project,
            recording=recording,
            start_time=0.1 * i,
            end_time=0.1 * (i + 1),
        )
        for i in range(n)
    ]
    await db_session.commit()
    return tasks


@pytest.mark.asyncio
async def test_annotation_tasks_get_stats(
    db_session: AsyncSession,
    test_annotation_project: schemas.AnnotationProject,
    test_recording_id: int,
    test_user,
):
    """Stats count each task once per state and treat verified/rejected/completed as done."""
    from soundevent.data import AnnotationState

    from sonari.filters.annotation_tasks import AnnotationTaskFilter

    tasks = await _project_tasks(db_session, test_annotation_project, test_recording_id, 5)
    badges = [
        # Verified by two users: still one verified task
        (tasks[0], AnnotationState.verified, None),
        (tasks[0], AnnotationState.verified, test_user.id),
        (tasks[1], AnnotationState.rejected, None),
        (tasks[1], AnnotationState.assigned, test_user.id),
        (tasks[2], AnnotationState.completed, None),
        (tasks[3], AnnotationState.assigned, None),
        # tasks[4] has no badge
    ]
    db_session.add_all(
        models.AnnotationStatusBadge(annotation_task_id=task.id, state=state, user_id=user_id)
        for task, state, user_id in badges
    )
    await db_session.commit()

    project_filter = AnnotationTaskFilter(annotation_project__eq=test_annotation_project.id)
    stats = await api.annotation_tasks.get_stats(db_session, filters=[project_filter])
    assert stats == schemas.AnnotationTaskStats(
        total=5,
        done_count=3,
        verified_count=1,
        rejected_count=1,
        completed_count=1,
        pending_count=2,
        assigned_count=2,
    )

    pending = await api.annotation_tasks.get_stats(
        db_session,
        filters=[AnnotationTaskFilter(annotation_project__eq=test_annotation_project.id, pending__eq=True)],
    )
    assert (pending.total, pending.pending_count, pending.done_count, pending.assigned_count) == (2, 2, 0, 1)

    empty = await api.annotation_tasks.get_stats(
        db_session,
        filters=[AnnotationTaskFilter(annotation_project__eq=test_annotation_project.id + 1000)],
    )
    assert (empty.total, empty.pending_count, empty.done_count) == (0, 0, 0)


@pytest.mark.asyncio
async def test_annotation_tasks_get_index_unpaginated_total(
    db_session: AsyncSession,
    test_annotation_project: schemas.AnnotationProject,
    test_recording_id: int,
):
    """Without a limit the total is still the number of matching tasks, also with an offset."""
    from sonari.filters.annotation_tasks import AnnotationTaskFilter

    tasks = await _project_tasks(db_session, test_annotation_project, test_recording_id, 4)
    filters = [AnnotationTaskFilter(annotation_project__eq=test_annotation_project.id)]

    for limit in (None, -1):
        indices, total = await api.annotation_tasks.get_index(db_session, limit=limit, filters=filters, sort_by="id")
        assert [i.id for i in indices] == [t.id for t in tasks]
        assert total == 4

    indices, total = await api.annotation_tasks.get_index(db_session, offset=1, filters=filters, sort_by="id")
    assert [i.id for i in indices] == [t.id for t in tasks[1:]]
    assert total == 4

    indices, total = await api.annotation_tasks.get_index(db_session, offset=10, filters=filters, sort_by="id")
    assert indices == []
    assert total == 4


@pytest.mark.asyncio
async def test_annotation_tasks_date_and_time_range_filter(
    db_session: AsyncSession,
    test_annotation_project: schemas.AnnotationProject,
    test_recording: schemas.Recording,
):
    """Date ranges with times compare the combined recording date and time."""
    import datetime

    from sonari.filters.annotation_tasks import AnnotationTaskFilter

    recording = await api.recordings.update(
        db_session,
        test_recording,
        schemas.RecordingUpdate(date=datetime.date(2026, 5, 1), time=datetime.time(22, 30)),
    )
    (task,) = await _project_tasks(db_session, test_annotation_project, recording.id, 1)

    async def matches(start_time: str, end_time: str, end_date: str = "2026-05-01") -> bool:
        tasks, _ = await api.annotation_tasks.get_many(
            db_session,
            limit=10,
            filters=[
                AnnotationTaskFilter(
                    annotation_project__eq=test_annotation_project.id,
                    date__start_dates="2026-05-01T00:00:00",
                    date__end_dates=f"{end_date}T00:00:00",
                    date__start_times=f"1970-01-01T{start_time}",
                    date__end_times=f"1970-01-01T{end_time}",
                )
            ],
        )
        return [t.id for t in tasks] == [task.id]

    assert await matches("22:00:00", "23:00:00")
    assert not await matches("20:00:00", "21:00:00")
    assert not await matches("23:00:00", "23:30:00")
    # Range crossing midnight extends the end date by one day
    assert await matches("22:00:00", "02:00:00")
    assert not await matches("10:00:00", "12:00:00", end_date="2026-04-30")


@pytest.mark.asyncio
async def test_annotation_tasks_date_filter_on_recorded_at(
    db_session: AsyncSession,
    test_annotation_project: schemas.AnnotationProject,
    test_recording: schemas.Recording,
):
    """Date-only ranges include the whole end day; time ranges skip recordings without a time."""
    import datetime

    from sonari.filters.annotation_tasks import AnnotationTaskFilter

    recording = await api.recordings.update(
        db_session,
        test_recording,
        schemas.RecordingUpdate(date=datetime.date(2026, 5, 1), time=datetime.time(23, 59, 30)),
    )
    (task,) = await _project_tasks(db_session, test_annotation_project, recording.id, 1)

    async def matches(**dates: str) -> bool:
        tasks, _ = await api.annotation_tasks.get_many(
            db_session,
            limit=10,
            filters=[AnnotationTaskFilter(annotation_project__eq=test_annotation_project.id, **dates)],
        )
        return [t.id for t in tasks] == [task.id]

    one_day = {"date__start_dates": "2026-05-01T00:00:00", "date__end_dates": "2026-05-01T00:00:00"}
    assert await matches(**one_day)
    assert not await matches(date__start_dates="2026-05-02T00:00:00")
    assert not await matches(date__end_dates="2026-04-30T00:00:00")

    await api.recordings.update(db_session, recording, schemas.RecordingUpdate(time=None))
    await db_session.commit()
    assert await matches(**one_day)
    assert not await matches(date__start_times="1970-01-01T00:00:00", date__end_times="1970-01-01T01:00:00")


@pytest.mark.asyncio
async def test_recording_recorded_at_and_task_duration_columns(
    db_session: AsyncSession,
    test_annotation_project: schemas.AnnotationProject,
    test_recording: schemas.Recording,
):
    """The database computes recorded_at (midnight without a time) and the task duration."""
    import datetime

    from sqlalchemy import select

    recording = await api.recordings.update(
        db_session,
        test_recording,
        schemas.RecordingUpdate(date=datetime.date(2026, 5, 1), time=datetime.time(21, 3, 4)),
    )
    tasks = await _project_tasks(db_session, test_annotation_project, recording.id, 3)

    async def recorded_at():
        return (
            await db_session.execute(select(models.Recording.recorded_at).where(models.Recording.id == recording.id))
        ).scalar_one()

    assert await recorded_at() == datetime.datetime(2026, 5, 1, 21, 3, 4)
    await api.recordings.update(db_session, recording, schemas.RecordingUpdate(time=None))
    await db_session.commit()
    assert await recorded_at() == datetime.datetime(2026, 5, 1)

    durations = (
        await db_session.execute(
            select(models.AnnotationTask.duration).where(models.AnnotationTask.id.in_([t.id for t in tasks]))
        )
    ).scalars()
    assert sorted(durations) == pytest.approx([0.1, 0.1, 0.1])
    # The duration is still reported as a task feature.
    task = await api.annotation_tasks.get(db_session, tasks[0].id)
    assert [(f.name, f.value) for f in task.features] == [("duration", pytest.approx(0.1))]

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

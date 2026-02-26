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

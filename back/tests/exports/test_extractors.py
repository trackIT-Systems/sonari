"""Tests for exports/data/extractors.py."""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from sonari import models
from sonari.exports.data.extractors import (
    extract_annotation_data,
    extract_batch,
    load_status_badges_for_batch,
)

# ---------------------------------------------------------------------------
# extract_batch
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_extract_batch_returns_annotations(
    db_session: AsyncSession,
    test_annotation_project,
):
    """Test extract_batch returns sound event annotations with relationships."""
    batch = await extract_batch(
        db_session,
        [test_annotation_project.id],
        offset=0,
        batch_size=10,
    )
    assert isinstance(batch, list)
    for ann in batch:
        assert isinstance(ann, models.SoundEventAnnotation)
        assert ann.annotation_task_id is not None
        assert hasattr(ann, "features")
        assert hasattr(ann, "tags")
        assert hasattr(ann, "recording")


@pytest.mark.asyncio
async def test_extract_batch_respects_offset_and_limit(
    db_session: AsyncSession,
    test_annotation_project,
):
    """Test extract_batch respects offset and batch_size."""
    batch = await extract_batch(
        db_session,
        [test_annotation_project.id],
        offset=0,
        batch_size=2,
    )
    assert len(batch) <= 2


# ---------------------------------------------------------------------------
# load_status_badges_for_batch
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_load_status_badges_for_batch_empty(db_session: AsyncSession):
    """Test load_status_badges_for_batch with empty list does not raise."""
    await load_status_badges_for_batch(db_session, [])


@pytest.mark.asyncio
async def test_load_status_badges_for_batch_with_annotations(
    db_session: AsyncSession,
    test_sound_event_annotation,
):
    """Test load_status_badges_for_batch loads badges for task IDs."""
    from sqlalchemy import select
    from sqlalchemy.orm import joinedload

    stmt = (
        select(models.SoundEventAnnotation)
        .where(models.SoundEventAnnotation.id == test_sound_event_annotation.id)
        .options(joinedload(models.SoundEventAnnotation.annotation_task))
    )
    result = await db_session.execute(stmt)
    annotations = result.unique().scalars().all()
    await load_status_badges_for_batch(db_session, annotations)


# ---------------------------------------------------------------------------
# extract_annotation_data
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_extract_annotation_data_structure(
    db_session: AsyncSession,
    test_sound_event_annotation,
):
    """Test extract_annotation_data returns dict with expected keys."""
    from sqlalchemy import select
    from sqlalchemy.orm import joinedload, selectinload

    # Load annotation model with relationships
    stmt = (
        select(models.SoundEventAnnotation)
        .where(models.SoundEventAnnotation.id == test_sound_event_annotation.id)
        .options(
            selectinload(models.SoundEventAnnotation.features),
            selectinload(models.SoundEventAnnotation.tags),
            joinedload(models.SoundEventAnnotation.recording)
            .selectinload(models.Recording.recording_datasets)
            .joinedload(models.DatasetRecording.dataset),
            joinedload(models.SoundEventAnnotation.created_by),
            joinedload(models.SoundEventAnnotation.annotation_task)
            .selectinload(models.AnnotationTask.status_badges)
            .joinedload(models.AnnotationStatusBadge.user),
        )
    )
    result = await db_session.execute(stmt)
    ann = result.unique().scalar_one_or_none()
    if ann is None:
        pytest.skip("Sound event annotation not found")

    data = await extract_annotation_data(ann)
    assert isinstance(data, dict)
    assert "filename" in data
    assert "station" in data
    assert "date" in data
    assert "time" in data
    assert "sound_event_tags" in data
    assert "media_duration" in data
    assert "detection_confidence" in data
    assert "species_confidence" in data
    assert "start_time" in data
    assert "end_time" in data
    assert "geometry_type" in data

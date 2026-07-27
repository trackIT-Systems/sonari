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
            joinedload(models.SoundEventAnnotation.annotation_task).selectinload(models.AnnotationTask.tags),
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
    assert "task_tags" in data


# ---------------------------------------------------------------------------
# recording_station: deterministic multi-dataset station label
# ---------------------------------------------------------------------------

def test_recording_station_falls_back_to_path_when_no_datasets():
    """recording_station falls back to recording.path when no dataset links."""
    from pathlib import Path as _Path

    from sonari.exports.data.extractors import recording_station

    rec = models.Recording(
        path=_Path("orphan/file.wav"),
        hash="deadbeef",
        duration=1.0,
        samplerate=44100,
        channels=1,
        time_expansion=1.0,
    )
    assert recording_station(rec) == "orphan/file.wav"


@pytest.mark.asyncio
async def test_recording_station_joins_all_dataset_names_sorted(
    db_session: AsyncSession,
    test_dataset,
    test_settings,
):
    """recording_station returns sorted comma-joined names for multi-dataset recording."""
    import os
    import struct
    import uuid as _uuid
    from pathlib import Path

    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    from sonari import api
    from sonari.exports.data.extractors import recording_station

    # Second dataset with its own audio_dir.
    other_name = f"station_other_{_uuid.uuid4().hex[:8]}"
    other_dir = test_settings.audio_dir / other_name
    other_dir.mkdir(parents=True, exist_ok=True)
    other_dataset = await api.datasets.create(
        db_session,
        name=other_name,
        dataset_dir=other_dir,
    )
    await db_session.commit()

    # File in first dataset dir, linked to both datasets via add_file.
    first_abs = test_settings.audio_dir / test_dataset.audio_dir
    first_abs.mkdir(parents=True, exist_ok=True)
    wav_path = first_abs / f"station_{_uuid.uuid4().hex[:8]}.wav"

    def _write_wav(path: Path, sample_rate: int = 44100, duration_s: float = 2.0) -> None:
        data_size = int(sample_rate * duration_s) * 2
        with open(path, "wb") as f:
            f.write(b"RIFF")
            f.write(struct.pack("<I", 36 + data_size))
            f.write(b"WAVEfmt ")
            f.write(struct.pack("<I", 16))
            f.write(struct.pack("<H", 1))
            f.write(struct.pack("<H", 1))
            f.write(struct.pack("<I", sample_rate))
            f.write(struct.pack("<I", sample_rate * 2))
            f.write(struct.pack("<H", 2))
            f.write(struct.pack("<H", 16))
            f.write(b"data")
            f.write(struct.pack("<I", data_size))
            f.write(os.urandom(data_size))

    _write_wav(wav_path)

    ds_rec_a = await api.datasets.add_file(db_session, test_dataset, path=wav_path)
    await db_session.commit()
    ds_rec_b = await api.datasets.add_file(db_session, other_dataset, path=wav_path)
    await db_session.commit()

    stmt = (
        select(models.Recording)
        .where(models.Recording.id == ds_rec_a.recording.id)
        .options(
            selectinload(models.Recording.recording_datasets).joinedload(
                models.DatasetRecording.dataset
            )
        )
    )
    recording = (await db_session.execute(stmt)).unique().scalar_one()

    expected = ", ".join(sorted({test_dataset.name, other_dataset.name}))
    assert recording_station(recording) == expected

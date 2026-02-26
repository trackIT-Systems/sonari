"""Tests for DatasetAPI - create, update, link recordings."""

import uuid
from pathlib import Path

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from sonari import api, schemas


@pytest.mark.asyncio
async def test_datasets_create(db_session: AsyncSession, test_settings):
    """Test DatasetAPI.create creates dataset."""
    dataset_name = f"api_ds_{uuid.uuid4().hex[:8]}"
    dataset_dir = test_settings.audio_dir / dataset_name
    dataset_dir.mkdir(parents=True, exist_ok=True)

    dataset = await api.datasets.create(
        db_session,
        name=dataset_name,
        dataset_dir=dataset_dir,
        description="Test dataset for API tests",
    )
    await db_session.commit()

    assert dataset is not None
    assert dataset.name == dataset_name
    assert dataset.audio_dir == dataset_dir.relative_to(test_settings.audio_dir)


@pytest.mark.asyncio
async def test_datasets_get_by_name(db_session: AsyncSession, test_dataset: schemas.Dataset):
    """Test DatasetAPI.get_by_name returns dataset."""
    found = await api.datasets.get_by_name(db_session, test_dataset.name)
    assert found.id == test_dataset.id
    assert found.name == test_dataset.name


@pytest.mark.asyncio
async def test_datasets_get_by_audio_dir(db_session: AsyncSession, test_dataset: schemas.Dataset, test_settings):
    """Test DatasetAPI.get_by_audio_dir returns dataset."""
    audio_dir = test_dataset.audio_dir
    found = await api.datasets.get_by_audio_dir(db_session, audio_dir)
    assert found.id == test_dataset.id


@pytest.mark.asyncio
async def test_datasets_update_audio_dir_validation(
    db_session: AsyncSession, test_dataset: schemas.Dataset, test_settings
):
    """Test DatasetAPI.update raises ValueError when audio_dir not relative to root."""
    import tempfile

    from sonari.schemas.datasets import DatasetUpdate

    # Use a real directory outside audio_dir so Pydantic's DirectoryPath validation passes.
    # DatasetUpdate uses DirectoryPath which requires the path to exist.
    with tempfile.TemporaryDirectory() as tmp:
        outside_dir = Path(tmp)
        assert not outside_dir.is_relative_to(test_settings.audio_dir)
        with pytest.raises(ValueError, match="relative to the root audio"):
            await api.datasets.update(
                db_session,
                test_dataset,
                DatasetUpdate(audio_dir=outside_dir),
            )


@pytest.mark.asyncio
async def test_datasets_add_recording(
    db_session: AsyncSession,
    test_dataset: schemas.Dataset,
    test_settings,
):
    """Test DatasetAPI.add_recording links recording to dataset."""
    import os
    import struct

    dataset_abs = test_settings.audio_dir / test_dataset.audio_dir
    dataset_abs.mkdir(parents=True, exist_ok=True)
    wav_path = dataset_abs / f"link_test_{uuid.uuid4().hex[:8]}.wav"
    sample_rate = 44100
    data_size = sample_rate * 2 * 2  # 2 sec, mono, 16-bit
    with open(wav_path, "wb") as f:
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
    recording = await api.recordings.create(db_session, path=wav_path)
    await db_session.commit()

    ds_rec = await api.datasets.add_recording(db_session, test_dataset, recording)
    await db_session.commit()
    assert ds_rec is not None
    assert ds_rec.recording.id == recording.id

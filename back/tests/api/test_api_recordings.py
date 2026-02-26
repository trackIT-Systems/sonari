"""Tests for RecordingAPI - create from path, get_by_hash, features/tags/notes."""

import os
import struct
import uuid
from pathlib import Path

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from sonari import api, exceptions, schemas


def _create_minimal_wav(path: Path, duration_seconds: float = 1.0) -> Path:
    """Create minimal valid WAV file with random audio data.

    Uses random bytes so each file has a unique hash (avoids duplicate key errors).
    """
    sample_rate = 44100
    num_samples = int(sample_rate * duration_seconds)
    data_size = num_samples * 2  # 16-bit mono
    path.parent.mkdir(parents=True, exist_ok=True)
    data = os.urandom(data_size)
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
        f.write(data)
    return path


@pytest.mark.asyncio
async def test_recordings_create_from_path(db_session: AsyncSession, test_dataset: schemas.Dataset, test_settings):
    """Test RecordingAPI.create from path."""
    dataset_abs = test_settings.audio_dir / test_dataset.audio_dir
    wav_path = dataset_abs / f"create_test_{uuid.uuid4().hex[:8]}.wav"
    _create_minimal_wav(wav_path)

    recording = await api.recordings.create(db_session, path=wav_path)
    await db_session.commit()

    assert recording is not None
    assert recording.id is not None
    assert recording.hash is not None
    assert recording.duration is not None
    assert recording.samplerate == 44100


@pytest.mark.asyncio
async def test_recordings_get_by_hash(db_session: AsyncSession, test_recording_id: int):
    """Test RecordingAPI.get_by_hash returns recording."""
    recording = await api.recordings.get(db_session, test_recording_id)
    found = await api.recordings.get_by_hash(db_session, recording.hash)
    assert found.id == recording.id
    assert found.hash == recording.hash


@pytest.mark.asyncio
async def test_recordings_get_by_hash_not_found(db_session: AsyncSession):
    """Test RecordingAPI.get_by_hash raises NotFoundError."""
    with pytest.raises(exceptions.NotFoundError):
        await api.recordings.get_by_hash(db_session, "nonexistent_hash_abc123")


@pytest.mark.asyncio
async def test_recordings_get_with_features(db_session: AsyncSession, test_recording_id: int):
    """Test RecordingAPI.get_with_features returns recording with features."""
    recording = await api.recordings.get_with_features(db_session, test_recording_id)
    assert recording is not None
    assert recording.id == test_recording_id
    assert hasattr(recording, "features")


@pytest.mark.asyncio
async def test_recordings_add_feature(db_session: AsyncSession, test_recording_id: int):
    """Test adding feature to recording via API."""
    feat_name = f"api_feat_{uuid.uuid4().hex[:8]}"
    feature = schemas.Feature(name=feat_name, value=42.0)
    recording = await api.recordings.get(db_session, test_recording_id)
    updated = await api.recordings.add_feature(db_session, recording, feature)
    await db_session.commit()
    assert any(f.name == feat_name and f.value == 42.0 for f in updated.features)


@pytest.mark.asyncio
async def test_recordings_remove_feature(db_session: AsyncSession, test_recording_id: int):
    """Test removing feature from recording via API."""
    feat_name = f"rm_feat_{uuid.uuid4().hex[:8]}"
    feature = schemas.Feature(name=feat_name, value=1.0)
    recording = await api.recordings.get(db_session, test_recording_id)
    await api.recordings.add_feature(db_session, recording, feature)
    await db_session.commit()
    recording = await api.recordings.get_with_features(db_session, test_recording_id)
    updated = await api.recordings.remove_feature(db_session, recording, feature)
    await db_session.commit()
    assert not any(f.name == feat_name for f in updated.features)

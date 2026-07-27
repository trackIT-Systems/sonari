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

    # Use a real directory outside audio_dir. DatasetUpdate.audio_dir is a Path
    # (no existence requirement), but using a real dir keeps the test robust.
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


def _write_wav(path: Path, sample_rate: int = 44100, duration_s: float = 2.0) -> None:
    """Write a minimal valid WAV file at the given path."""
    import os
    import struct

    data_size = int(sample_rate * duration_s) * 2  # mono, 16-bit
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


@pytest.mark.asyncio
async def test_add_recording_same_file_in_two_datasets_different_audio_dir(
    db_session: AsyncSession,
    test_dataset: schemas.Dataset,
    test_settings,
):
    """Same recording can be linked to two datasets with different audio_dir."""
    # Create a second dataset with a different audio_dir.
    other_name = f"other_ds_{uuid.uuid4().hex[:8]}"
    other_dir = test_settings.audio_dir / other_name
    other_dir.mkdir(parents=True, exist_ok=True)
    other_dataset = await api.datasets.create(
        db_session,
        name=other_name,
        dataset_dir=other_dir,
        description="Other dataset",
    )
    await db_session.commit()

    # Place a file inside the first dataset's audio dir.
    first_abs = test_settings.audio_dir / test_dataset.audio_dir
    first_abs.mkdir(parents=True, exist_ok=True)
    wav_path = first_abs / f"shared_{uuid.uuid4().hex[:8]}.wav"
    _write_wav(wav_path)

    recording = await api.recordings.create(db_session, path=wav_path)
    await db_session.commit()

    # Add to first dataset (in-tree): DatasetRecording no longer carries a
    # path column; file access uses recording.path + root audio dir.
    ds_rec_a = await api.datasets.add_recording(db_session, test_dataset, recording)
    await db_session.commit()
    assert ds_rec_a.recording.id == recording.id

    # Add to second dataset (out-of-tree): same recording reused.
    ds_rec_b = await api.datasets.add_recording(db_session, other_dataset, recording)
    await db_session.commit()
    assert ds_rec_b.recording.id == recording.id

    # Both datasets report the recording; single Recording row persists.
    recs_a, count_a = await api.datasets.get_recordings(
        db_session, test_dataset, limit=-1
    )
    recs_b, count_b = await api.datasets.get_recordings(
        db_session, other_dataset, limit=-1
    )
    assert count_a >= 1
    assert count_b >= 1
    assert {r.id for r in recs_a} & {r.id for r in recs_b} == {recording.id}

    # recording_count reflects the new additions.
    refreshed_a = await api.datasets.get(db_session, test_dataset.id)
    refreshed_b = await api.datasets.get(db_session, other_dataset.id)
    assert refreshed_a.recording_count >= 1
    assert refreshed_b.recording_count >= 1


@pytest.mark.asyncio
async def test_add_file_accepts_file_outside_dataset_audio_dir(
    db_session: AsyncSession,
    test_dataset: schemas.Dataset,
    test_settings,
):
    """add_file accepts a file under root audio_dir but outside dataset audio_dir."""
    # File lives in a sibling directory, not under test_dataset.audio_dir.
    sibling_name = f"sibling_{uuid.uuid4().hex[:8]}"
    sibling_dir = test_settings.audio_dir / sibling_name
    sibling_dir.mkdir(parents=True, exist_ok=True)
    wav_path = sibling_dir / f"ext_{uuid.uuid4().hex[:8]}.wav"
    _write_wav(wav_path)

    ds_rec = await api.datasets.add_file(db_session, test_dataset, path=wav_path)
    await db_session.commit()

    assert ds_rec is not None
    # Recording path is root-relative and not under dataset audio_dir.
    assert not ds_rec.recording.path.is_relative_to(test_dataset.audio_dir)


@pytest.mark.asyncio
async def test_add_recording_out_of_tree_links_recording(
    db_session: AsyncSession,
    test_dataset: schemas.Dataset,
    test_settings,
):
    """add_recording with an out-of-tree recording links it to the dataset."""
    sibling_name = f"sibling_{uuid.uuid4().hex[:8]}"
    sibling_dir = test_settings.audio_dir / sibling_name
    sibling_dir.mkdir(parents=True, exist_ok=True)
    wav_path = sibling_dir / f"ext_{uuid.uuid4().hex[:8]}.wav"
    _write_wav(wav_path)

    recording = await api.recordings.create(db_session, path=wav_path)
    await db_session.commit()

    ds_rec = await api.datasets.add_recording(db_session, test_dataset, recording)
    await db_session.commit()

    assert ds_rec.recording.id == recording.id
    assert not ds_rec.recording.path.is_relative_to(test_dataset.audio_dir)


@pytest.mark.asyncio
async def test_add_same_recording_to_same_dataset_twice_raises(
    db_session: AsyncSession,
    test_dataset: schemas.Dataset,
    test_settings,
):
    """Adding the same recording to the same dataset twice raises DuplicateObjectError."""
    from sonari.exceptions import DuplicateObjectError

    dataset_abs = test_settings.audio_dir / test_dataset.audio_dir
    dataset_abs.mkdir(parents=True, exist_ok=True)
    wav_path = dataset_abs / f"dup_{uuid.uuid4().hex[:8]}.wav"
    _write_wav(wav_path)

    recording = await api.recordings.create(db_session, path=wav_path)
    await db_session.commit()

    await api.datasets.add_recording(db_session, test_dataset, recording)
    await db_session.commit()

    with pytest.raises(DuplicateObjectError):
        await api.datasets.add_recording(db_session, test_dataset, recording)
        await db_session.commit()


# ---------------------------------------------------------------------------
# Issue 1 & 2: create_from_data relativizes + validates audio_dir
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_create_from_data_relativizes_absolute_audio_dir(
    db_session: AsyncSession,
    test_settings,
):
    """create_from_data stores audio_dir relative to the root audio directory."""
    from sonari.schemas.datasets import DatasetCreate

    name = f"rel_{uuid.uuid4().hex[:8]}"
    abs_dir = test_settings.audio_dir / name
    abs_dir.mkdir(parents=True, exist_ok=True)

    dataset = await api.datasets.create_from_data(
        db_session,
        DatasetCreate(name=name, audio_dir=abs_dir),
    )
    await db_session.commit()

    assert dataset.audio_dir == Path(name)
    assert not dataset.audio_dir.is_absolute()


@pytest.mark.asyncio
async def test_create_from_data_accepts_relative_audio_dir(
    db_session: AsyncSession,
    test_settings,
):
    """create_from_data passes already-relative audio_dir through unchanged."""
    from sonari.schemas.datasets import DatasetCreate

    name = f"rel2_{uuid.uuid4().hex[:8]}"
    (test_settings.audio_dir / name).mkdir(parents=True, exist_ok=True)

    dataset = await api.datasets.create_from_data(
        db_session,
        DatasetCreate(name=name, audio_dir=Path(name)),
    )
    await db_session.commit()

    assert dataset.audio_dir == Path(name)


@pytest.mark.asyncio
async def test_create_from_data_rejects_absolute_audio_dir_outside_root(
    db_session: AsyncSession,
    test_settings,
):
    """create_from_data raises ValueError when audio_dir is outside root."""
    import tempfile

    from sonari.schemas.datasets import DatasetCreate

    name = f"rel3_{uuid.uuid4().hex[:8]}"
    with tempfile.TemporaryDirectory() as tmp:
        outside = Path(tmp)
        assert not outside.is_relative_to(test_settings.audio_dir)
        with pytest.raises(ValueError, match="relative to the root audio"):
            await api.datasets.create_from_data(
                db_session,
                DatasetCreate(name=name, audio_dir=outside),
            )


# ---------------------------------------------------------------------------
# Issue 1 & 2 (scenario 1): same physical file added to two datasets
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_add_file_same_file_to_two_datasets(
    db_session: AsyncSession,
    test_dataset: schemas.Dataset,
    test_settings,
):
    """Adding the same physical file to two datasets reuses one Recording."""
    # Second dataset with its own audio_dir.
    other_name = f"other2_{uuid.uuid4().hex[:8]}"
    other_dir = test_settings.audio_dir / other_name
    other_dir.mkdir(parents=True, exist_ok=True)
    other_dataset = await api.datasets.create(
        db_session,
        name=other_name,
        dataset_dir=other_dir,
    )
    await db_session.commit()

    # Single physical file inside the first dataset's dir.
    first_abs = test_settings.audio_dir / test_dataset.audio_dir
    first_abs.mkdir(parents=True, exist_ok=True)
    wav_path = first_abs / f"shared2_{uuid.uuid4().hex[:8]}.wav"
    _write_wav(wav_path)

    ds_rec_a = await api.datasets.add_file(db_session, test_dataset, path=wav_path)
    await db_session.commit()
    ds_rec_b = await api.datasets.add_file(db_session, other_dataset, path=wav_path)
    await db_session.commit()

    # Same underlying Recording row reused; two DatasetRecording links.
    assert ds_rec_a.recording.id == ds_rec_b.recording.id

    recs_a, _ = await api.datasets.get_recordings(db_session, test_dataset, limit=-1)
    recs_b, _ = await api.datasets.get_recordings(db_session, other_dataset, limit=-1)
    assert {r.id for r in recs_a} & {r.id for r in recs_b} == {ds_rec_a.recording.id}


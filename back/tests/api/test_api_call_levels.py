"""Tests for measuring call levels in bounding boxes and storing them."""

import uuid

import numpy as np
import pytest
import soundfile as sf
from soundevent import data
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from sonari import api, models, schemas
from sonari.api.call_levels import (
    CALL_LEVEL_FEATURE_NAMES,
    LEVEL_CHANNEL,
    LEVEL_PEAK,
    LEVEL_SNR,
    measure_box_levels,
    measure_sound_event_levels,
)
from sonari.api.reference_calls import find_reference_calls, get_reference_calls

SR = 48_000


def tone(freq: float, amplitude: float, duration: float) -> np.ndarray:
    t = np.arange(int(duration * SR)) / SR
    return amplitude * np.sin(2 * np.pi * freq * t)


def scene(amplitude: float, *, noise: float = 0.001, other: float = 0.0) -> np.ndarray:
    """2 s of noise with a 5 kHz call from 0.9 to 1.1 s and an optional 15 kHz sound throughout."""
    rng = np.random.default_rng(0)
    samples = rng.normal(scale=noise, size=2 * SR)
    samples[int(0.9 * SR) : int(1.1 * SR)] += tone(5_000, amplitude, 0.2)
    if other:
        samples += tone(15_000, other, 2.0)
    return samples


BOX = (0.9, 4_000.0, 1.1, 6_000.0)


def test_peak_level_of_sine_is_its_rms():
    levels = measure_box_levels(scene(0.5), SR, 0.0, BOX)
    # A sine of amplitude A has RMS A/sqrt(2): 20*log10(0.5/sqrt(2)) = -9.03 dBFS.
    assert levels.peak_dbfs == pytest.approx(-9.03, abs=0.3)
    assert levels.snr_db > 40
    assert not levels.clipped


def test_louder_call_ranks_higher():
    quiet = measure_box_levels(scene(0.05), SR, 0.0, BOX)
    loud = measure_box_levels(scene(0.5), SR, 0.0, BOX)
    assert loud.peak_dbfs - quiet.peak_dbfs == pytest.approx(20, abs=0.5)


def test_sound_outside_the_band_is_ignored():
    alone = measure_box_levels(scene(0.05), SR, 0.0, BOX)
    with_other = measure_box_levels(scene(0.05, other=0.5), SR, 0.0, BOX)
    assert with_other.peak_dbfs == pytest.approx(alone.peak_dbfs, abs=0.5)


def test_loose_box_lowers_rms_but_not_peak():
    tight = measure_box_levels(scene(0.5), SR, 0.0, BOX)
    loose = measure_box_levels(scene(0.5), SR, 0.0, (0.4, 4_000.0, 1.6, 6_000.0))
    assert loose.peak_dbfs == pytest.approx(tight.peak_dbfs, abs=0.3)
    assert loose.rms_dbfs < tight.rms_dbfs - 5


def test_clipping_is_flagged():
    assert measure_box_levels(np.clip(scene(1.5), -1, 1), SR, 0.0, BOX).clipped


def test_samples_starting_later_and_no_padding():
    samples = scene(0.5)[int(0.9 * SR) : int(1.1 * SR)]
    levels = measure_box_levels(samples, SR, 0.9, BOX)
    assert levels.peak_dbfs == pytest.approx(-9.03, abs=0.5)
    assert levels.snr_db is None
    assert LEVEL_SNR not in levels.as_features()


def test_box_shorter_than_frame():
    levels = measure_box_levels(scene(0.5), SR, 0.0, (1.0, 4_000.0, 1.001, 6_000.0))
    assert np.isfinite(levels.peak_dbfs)


@pytest.mark.asyncio
async def test_store_reuse_and_invalidate(
    db_session: AsyncSession,
    test_settings,
    test_dataset: schemas.Dataset,
    test_annotation_project: schemas.AnnotationProject,
    test_user,
):
    """Levels are stored once, measured again after a box is re-drawn or when stored by older code."""
    user = schemas.SimpleUser.model_validate(test_user)
    species = await api.tags.create(db_session, key="species", value=f"sp_{uuid.uuid4().hex[:8]}", created_by=user)
    other = await api.tags.create(db_session, key="species", value=f"sp_{uuid.uuid4().hex[:8]}", created_by=user)

    path = test_settings.audio_dir / test_dataset.audio_dir / f"calls_{uuid.uuid4().hex[:8]}.wav"
    sf.write(path, scene(0.05) + np.roll(scene(0.5), -SR // 2), SR)  # quiet call at 0.9 s, loud at 0.4 s
    recording = await api.recordings.create(db_session, path=path)
    task = await api.annotation_tasks.create(
        db_session,
        annotation_project=test_annotation_project,
        recording=recording,
        start_time=0.0,
        end_time=recording.duration,
    )

    async def event(box, tag):
        created = await api.sound_event_annotations.create(
            db_session,
            annotation_task=task,
            geometry=data.BoundingBox(coordinates=list(box)),
            created_by=user,
        )
        return await api.sound_event_annotations.add_tag(db_session, created, tag, user)

    quiet = await event(BOX, species)
    loud = await event((0.4, 4_000.0, 0.6, 6_000.0), species)
    await event((0.4, 4_000.0, 0.6, 6_000.0), other)  # other species: not measured
    await db_session.commit()

    kwargs = dict(
        tag_id=species.id, annotation_project_id=test_annotation_project.id, audio_dir=test_settings.audio_dir
    )
    run = await find_reference_calls(db_session, **kwargs)
    assert (run.measured, run.failed) == (2, 0)

    calls = await get_reference_calls(
        db_session, tag_id=species.id, annotation_project_id=test_annotation_project.id, limit=2
    )
    assert [c.sound_event_annotation_id for c in calls] == [loud.id, quiet.id]
    assert calls[0].peak_dbfs - calls[1].peak_dbfs == pytest.approx(20, abs=1)
    assert calls[1].snr_db > 20  # the loud call in its padding is not noise

    # Measured events are not measured again.
    assert (await find_reference_calls(db_session, **kwargs)).measured == 0

    # Re-drawing a box drops its levels, so the next run measures it again.
    quiet = await api.sound_event_annotations.get(db_session, quiet.id, include_features=True)
    updated = await api.sound_event_annotations.update_geometry(
        db_session, quiet, data.BoundingBox(coordinates=[0.85, 4_000.0, 1.15, 6_000.0])
    )
    await db_session.commit()
    assert not {f.name for f in updated.features} & set(CALL_LEVEL_FEATURE_NAMES)
    stored = await db_session.scalars(
        select(models.SoundEventAnnotationFeature.name).where(
            models.SoundEventAnnotationFeature.sound_event_annotation_id == quiet.id
        )
    )
    assert LEVEL_PEAK not in stored.all()
    assert (await find_reference_calls(db_session, **kwargs)).measured == 1

    # Levels stored before channels were chosen lack the channel: measured again, not shown meanwhile.
    await db_session.execute(
        delete(models.SoundEventAnnotationFeature).where(
            models.SoundEventAnnotationFeature.sound_event_annotation_id.in_([quiet.id, loud.id]),
            models.SoundEventAnnotationFeature.name == LEVEL_CHANNEL,
        )
    )
    await db_session.commit()
    assert await get_reference_calls(
        db_session, tag_id=species.id, annotation_project_id=test_annotation_project.id
    ) == []
    assert (await find_reference_calls(db_session, **kwargs)).measured == 2


def test_clearest_channel_is_measured(tmp_path):
    """Some recorders leave channel 0 near silent and record the bats on channel 1."""
    quiet = np.random.default_rng(1).normal(scale=0.001, size=2 * SR)
    sf.write(tmp_path / "stereo.wav", np.stack([quiet, scene(0.5)], axis=1), SR)
    recording = schemas.Recording.model_construct(
        id=1, path="stereo.wav", duration=2.0, samplerate=SR, channels=2, time_expansion=1.0
    )
    geometry = data.BoundingBox(coordinates=list(BOX))

    levels = measure_sound_event_levels(recording, geometry, tmp_path)
    assert levels.channel == 1
    assert levels.peak_dbfs == pytest.approx(-9.03, abs=0.5)
    assert levels.as_features()[LEVEL_CHANNEL] == 1

    first = measure_sound_event_levels(recording, geometry, tmp_path, channel=0)
    assert first.snr_db < 3

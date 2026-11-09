"""Tests for finding reference calls of a species in a project."""

import uuid

import numpy as np
import pytest
import soundfile as sf
from httpx import AsyncClient
from soundevent import data
from sqlalchemy.ext.asyncio import AsyncSession

from sonari import api, schemas
from sonari.api.reference_calls import find_reference_calls, get_reference_calls, probes_per_run

SR = 48_000
CALL_TIMES = (0.3, 0.9, 1.5)  # three 0.1 s calls per recording, 5 kHz


def _write(path, amplitudes, *, clip=False) -> None:
    rng = np.random.default_rng()  # recordings are unique by hash
    samples = rng.normal(scale=0.001, size=2 * SR)
    t = np.arange(int(0.1 * SR)) / SR
    for start, amplitude in zip(CALL_TIMES, amplitudes):
        i = int(start * SR)
        samples[i : i + t.size] += amplitude * np.sin(2 * np.pi * 5_000 * t)
    if clip:
        samples = np.clip(samples, -1, 1)
    sf.write(path, samples, SR)


@pytest.fixture
async def species_project(db_session: AsyncSession, test_settings, test_dataset, test_user):
    """Recordings whose loudest call is not always the first one, one with only clipped calls
    and one where the loudest call is clipped but the others are not."""
    user = schemas.SimpleUser.model_validate(test_user)
    project = await api.annotation_projects.create(
        db_session, name=f"refs_{uuid.uuid4().hex[:8]}", description="reference calls"
    )
    species = await api.tags.create(db_session, key="species", value=f"sp_{uuid.uuid4().hex[:8]}", created_by=user)

    recordings = {
        "clipped": ([1.5, 2.0, 1.2], True),
        "mixed": ([1.5, 0.4, 0.1], True),
        "loud": ([0.05, 0.6, 0.1], False),
        "medium": ([0.2, 0.05, 0.05], False),
        "quiet": ([0.02, 0.02, 0.03], False),
    }
    events: dict[str, list[int]] = {}
    for name, (amplitudes, clip) in recordings.items():
        path = test_settings.audio_dir / test_dataset.audio_dir / f"{name}_{uuid.uuid4().hex[:8]}.wav"
        _write(path, amplitudes, clip=clip)
        recording = await api.recordings.create(db_session, path=path)
        task = await api.annotation_tasks.create(
            db_session, annotation_project=project, recording=recording, start_time=0.0, end_time=2.0
        )
        events[name] = []
        for start in CALL_TIMES:
            event = await api.sound_event_annotations.create(
                db_session,
                annotation_task=task,
                geometry=data.BoundingBox(coordinates=[start, 4_000.0, start + 0.1, 6_000.0]),
                created_by=user,
            )
            await api.sound_event_annotations.add_tag(db_session, event, species, user)
            events[name].append(event.id)
    await db_session.commit()
    return project, species, events


@pytest.mark.asyncio
async def test_one_reference_per_recording_best_first(db_session, test_settings, species_project):
    project, species, events = species_project
    search = await find_reference_calls(
        db_session, tag_id=species.id, annotation_project_id=project.id, audio_dir=test_settings.audio_dir, seed=1
    )
    assert search.probed_recordings == 5
    assert search.failed == 0

    calls = await get_reference_calls(db_session, tag_id=species.id, annotation_project_id=project.id, limit=5)
    # The best call of each recording, whichever call was probed; an unclipped call beats a
    # louder clipped one, and a recording with only clipped calls comes last.
    assert [c.sound_event_annotation_id for c in calls[:4]] == [
        events["loud"][1],
        events["mixed"][1],
        events["medium"][0],
        events["quiet"][2],
    ]
    assert calls[4].recording_id not in {c.recording_id for c in calls[:4]}
    assert calls[4].sound_event_annotation_id in events["clipped"]
    assert calls[4].clipped and not any(c.clipped for c in calls[:4])
    assert calls[0].channel == 0 and calls[0].samplerate == SR


@pytest.mark.asyncio
async def test_second_calls_only_when_recordings_run_out(db_session, test_settings, species_project):
    project, species, events = species_project
    await find_reference_calls(
        db_session, tag_id=species.id, annotation_project_id=project.id, audio_dir=test_settings.audio_dir, seed=2
    )
    calls = await get_reference_calls(db_session, tag_id=species.id, annotation_project_id=project.id, limit=8)
    recordings = [c.recording_id for c in calls]
    assert len(set(recordings[:5])) == 5
    assert set(recordings[5:]) <= set(recordings[:5])


@pytest.mark.asyncio
async def test_rerun_reuses_levels(db_session, test_settings, species_project):
    project, species, _ = species_project
    kwargs = dict(tag_id=species.id, annotation_project_id=project.id, audio_dir=test_settings.audio_dir)
    first = await find_reference_calls(db_session, seed=3, **kwargs)
    again = await find_reference_calls(db_session, seed=3, **kwargs)
    assert first.measured > 0
    # Every recording is probed and the best ones are fully measured: nothing is left to do.
    assert (again.probed_recordings, again.measured) == (0, 0)


def test_probes_per_run():
    assert probes_per_run(30) == 30
    assert probes_per_run(400) == 400
    assert probes_per_run(1_000) == 400
    assert probes_per_run(7_200) == 1_800
    assert probes_per_run(100_000) == 2_000


@pytest.mark.asyncio
async def test_reference_call_routes(auth_client: AsyncClient, species_project):
    project, species, events = species_project
    params = {"annotation_project_id": project.id, "tag_key": species.key, "tag_value": species.value}

    before = (await auth_client.get("/api/v1/annotation_projects/detail/reference_calls/", params=params)).json()
    assert (before["calls"], before["recordings"], before["searched_recordings"], before["job"]) == ([], 5, 0, None)

    started = await auth_client.post("/api/v1/annotation_projects/detail/reference_calls/", params=params)
    assert started.status_code == 200, started.text
    # The ASGI test transport returns after the background task has run.
    found = (await auth_client.get("/api/v1/annotation_projects/detail/reference_calls/", params=params)).json()
    assert found["job"]["state"] == "done"
    assert found["searched_recordings"] == 5
    assert found["calls"][0]["sound_event_annotation_id"] == events["loud"][1]
    assert found["calls"][0]["snr_db"] > 20


@pytest.mark.asyncio
async def test_birdedge_projects_have_no_reference_calls(auth_client: AsyncClient, db_session: AsyncSession, test_user):
    """birdedge's sound events are classifier windows, not boxes around calls."""
    user = schemas.SimpleUser.model_validate(test_user)
    project = await api.annotation_projects.create(
        db_session, name=f"audio-tracker-import birdedge station-{uuid.uuid4().hex[:6]} 6", description=""
    )
    species = await api.tags.create(db_session, key="species", value=f"sp_{uuid.uuid4().hex[:8]}", created_by=user)
    await db_session.commit()
    assert (project.detector, project.has_call_boxes) == ("birdedge", False)

    params = {"annotation_project_id": project.id, "tag_key": species.key, "tag_value": species.value}
    url = "/api/v1/annotation_projects/detail/reference_calls/"
    assert (await auth_client.get(url, params=params)).status_code == 400
    assert (await auth_client.post(url, params=params)).status_code == 400

    detail = await auth_client.get("/api/v1/annotation_projects/detail/", params={"annotation_project_id": project.id})
    assert detail.json()["has_call_boxes"] is False

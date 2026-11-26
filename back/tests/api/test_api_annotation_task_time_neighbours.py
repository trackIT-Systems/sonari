"""The tasks just before and after a task in time, ignoring any filter."""

import datetime
import shutil
import uuid

import pytest

from sonari import api, exceptions, schemas


async def _recording(db_session, test_dataset, test_settings, test_recording_id, date, time):
    """A new recording (copy of the test audio) recorded at `date` `time`."""
    source = await api.recordings.get(db_session, test_recording_id)
    target = test_settings.audio_dir / test_dataset.audio_dir / f"neighbour_{uuid.uuid4().hex[:8]}.wav"
    shutil.copy2(test_settings.audio_dir / source.path, target)
    with open(target, "ab") as f:
        f.write(uuid.uuid4().bytes)
    recording = await api.recordings.create(db_session, path=target)
    if date is not None:
        recording = await api.recordings.update(
            db_session, recording, schemas.RecordingUpdate(date=date, time=time)
        )
    await db_session.commit()
    return recording


@pytest.fixture
async def timeline(db_session, test_dataset, test_settings, test_recording_id, test_annotation_project):
    """Tasks of one project keyed by name; created out of time order on purpose."""
    day = datetime.date(2026, 8, 20)
    early = await _recording(db_session, test_dataset, test_settings, test_recording_id, day, datetime.time(21, 0))
    middle = await _recording(db_session, test_dataset, test_settings, test_recording_id, day, datetime.time(21, 5))
    late = await _recording(db_session, test_dataset, test_settings, test_recording_id, day, datetime.time(22, 0))
    undated = await _recording(db_session, test_dataset, test_settings, test_recording_id, None, None)
    other_project = await api.annotation_projects.create(
        db_session, name=f"other_{uuid.uuid4().hex[:8]}", description="", annotation_instructions=""
    )

    async def task(recording, start, project=test_annotation_project):
        return await api.annotation_tasks.create(
            db_session,
            annotation_project=project,
            recording=recording,
            start_time=start,
            end_time=start + 1.0,
        )

    tasks = {
        "late": await task(late, 0.0),
        # Two tasks of one recording: ordered by their start, not their id
        "middle_second": await task(middle, 2.0),
        "middle_first": await task(middle, 0.0),
        "early": await task(early, 0.0),
        "undated": await task(undated, 0.0),
        "other_project": await task(middle, 1.0, other_project),
    }
    await db_session.commit()
    return tasks


def _ids(tasks):
    return [t.id for t in tasks]


@pytest.mark.asyncio
async def test_neighbours_follow_recording_time_then_start(db_session, timeline):
    before, after = await api.annotation_tasks.get_time_neighbours(
        db_session, timeline["middle_first"].id, before=3, after=3
    )
    # Undated tasks and other projects' tasks are left out
    assert _ids(before) == [timeline["early"].id]
    assert _ids(after) == [timeline["middle_second"].id, timeline["late"].id]
    # With what the annotate view shows of them
    assert after[0].recording is not None
    assert after[0].sound_event_tags is not None


@pytest.mark.asyncio
async def test_neighbours_nearest_first_and_limited(db_session, timeline):
    before, after = await api.annotation_tasks.get_time_neighbours(
        db_session, timeline["late"].id, before=2, after=2
    )
    assert _ids(before) == [timeline["middle_second"].id, timeline["middle_first"].id]
    assert after == []


@pytest.mark.asyncio
async def test_undated_task_has_no_neighbours(db_session, timeline):
    assert await api.annotation_tasks.get_time_neighbours(db_session, timeline["undated"].id) == ([], [])


@pytest.mark.asyncio
async def test_unknown_task(db_session, timeline):
    with pytest.raises(exceptions.NotFoundError):
        await api.annotation_tasks.get_time_neighbours(db_session, 10**9)


@pytest.mark.asyncio
async def test_route(auth_client, timeline):
    response = await auth_client.get(
        "/api/v1/annotation_tasks/detail/time_neighbours/",
        params={"annotation_task_id": timeline["middle_second"].id, "before": 1, "after": 1},
    )
    assert response.status_code == 200
    body = response.json()
    assert [t["id"] for t in body["before"]] == [timeline["middle_first"].id]
    assert [t["id"] for t in body["after"]] == [timeline["late"].id]

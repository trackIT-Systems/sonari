"""Grouping annotation tasks by night (noon to noon local time)."""

import datetime
import shutil
import uuid

import pytest
from soundevent import data

from sonari import api, schemas
from sonari.filters.annotation_tasks import AnnotationTaskFilter


async def _recording(db_session, test_dataset, test_settings, test_recording_id, date, time):
    """A new recording (copy of the test audio) recorded at `date` `time` (UTC)."""
    source = await api.recordings.get(db_session, test_recording_id)
    target = test_settings.audio_dir / test_dataset.audio_dir / f"night_{uuid.uuid4().hex[:8]}.wav"
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
async def night_tasks(db_session, test_dataset, test_settings, test_recording_id, test_annotation_project):
    """One task per recording, keyed by a name for its recording time (UTC)."""
    times = {
        "evening": (datetime.date(2026, 6, 14), datetime.time(21, 0)),
        "after_midnight": (datetime.date(2026, 6, 15), datetime.time(2, 0)),
        "late_morning": (datetime.date(2026, 6, 15), datetime.time(11, 30)),
        "afternoon": (datetime.date(2026, 6, 15), datetime.time(13, 0)),
        "undated": (None, None),
    }
    tasks = {}
    for name, (date, time) in times.items():
        recording = await _recording(db_session, test_dataset, test_settings, test_recording_id, date, time)
        tasks[name] = await api.annotation_tasks.create(
            db_session,
            annotation_project=test_annotation_project,
            recording=recording,
            start_time=0.0,
            end_time=1.0,
        )
    await db_session.commit()
    return tasks


def _project(project):
    return AnnotationTaskFilter(annotation_project__eq=project.id)


@pytest.mark.asyncio
async def test_nights_group_noon_to_noon(db_session, night_tasks, test_annotation_project):
    nights, total = await api.annotation_tasks.get_nights(db_session, filters=[_project(test_annotation_project)])
    assert [(n.night, n.total) for n in nights] == [
        # 11:30 UTC is still the night before (it ends at noon)
        ("2026-06-14", 3),
        ("2026-06-15", 1),
        (None, 1),
    ]
    assert total == 3


@pytest.mark.asyncio
async def test_nights_follow_the_utc_offset(db_session, night_tasks, test_annotation_project):
    """At UTC+2, 11:30 UTC is 13:30 local: past noon, so the next night."""
    nights, _ = await api.annotation_tasks.get_nights(
        db_session, filters=[_project(test_annotation_project)], utc_offset=120
    )
    assert [(n.night, n.total) for n in nights] == [("2026-06-14", 2), ("2026-06-15", 2), (None, 1)]


@pytest.mark.asyncio
async def test_night_stats_count_status_of_the_nights_asked_for(
    db_session, night_tasks, test_annotation_project, test_user
):
    task = await api.annotation_tasks.get(db_session, night_tasks["evening"].id, include_status_badges=True)
    await api.annotation_tasks.add_status_badge(db_session, task, data.AnnotationState.completed, test_user)
    await db_session.commit()

    stats = await api.annotation_tasks.get_night_stats(
        db_session, [None, "2026-06-14", "2026-06-20"], filters=[_project(test_annotation_project)]
    )
    # In the order asked; a night without tasks counts zero
    assert [(s.night, s.total) for s in stats] == [(None, 1), ("2026-06-14", 3), ("2026-06-20", 0)]
    first = stats[1]
    assert (first.total, first.done_count, first.completed_count, first.pending_count) == (3, 1, 1, 2)


@pytest.mark.asyncio
async def test_night_stats_apply_the_full_filter(db_session, night_tasks, test_annotation_project, test_user):
    task = await api.annotation_tasks.get(db_session, night_tasks["after_midnight"].id, include_status_badges=True)
    await api.annotation_tasks.add_status_badge(db_session, task, data.AnnotationState.completed, test_user)
    await db_session.commit()

    completed = AnnotationTaskFilter(annotation_project__eq=test_annotation_project.id, completed__eq=True)
    stats = await api.annotation_tasks.get_night_stats(
        db_session, ["2026-06-14", "2026-06-15"], filters=[completed]
    )
    assert [(s.night, s.total) for s in stats] == [("2026-06-14", 1), ("2026-06-15", 0)]


@pytest.mark.asyncio
async def test_night_stats_of_runs_and_gaps_match_the_listing(db_session, night_tasks, test_annotation_project):
    """Nights asked for in separate runs (a gap between them) count the same as listed."""
    listed, _ = await api.annotation_tasks.get_nights(
        db_session, filters=[_project(test_annotation_project)], utc_offset=120
    )
    asked = ["2026-06-15", "2026-06-10", "2026-06-14", None]
    stats = await api.annotation_tasks.get_night_stats(
        db_session, asked, filters=[_project(test_annotation_project)], utc_offset=120
    )
    totals = {n.night: n.total for n in listed}
    assert [s.total for s in stats] == [totals.get(night, 0) for night in asked]


@pytest.mark.asyncio
async def test_nights_are_paged(db_session, night_tasks, test_annotation_project):
    page, total = await api.annotation_tasks.get_nights(
        db_session, filters=[_project(test_annotation_project)], limit=2, offset=2
    )
    assert [n.night for n in page] == [None]
    assert total == 3
    past_end, total = await api.annotation_tasks.get_nights(
        db_session, filters=[_project(test_annotation_project)], limit=2, offset=10
    )
    assert past_end == [] and total == 3


@pytest.mark.asyncio
async def test_recording_night_filter_returns_the_tasks_of_one_night(
    db_session, night_tasks, test_annotation_project
):
    async def task_names(**night):
        tasks, _ = await api.annotation_tasks.get_many(
            db_session,
            limit=-1,
            filters=[
                AnnotationTaskFilter(annotation_project__eq=test_annotation_project.id, **night)
            ],
        )
        ids = {t.id for t in tasks}
        return {name for name, task in night_tasks.items() if task.id in ids}

    assert await task_names(recording_night__eq="2026-06-14") == {"evening", "after_midnight", "late_morning"}
    assert await task_names(recording_night__eq="2026-06-14", recording_night__utc_offset=120) == {
        "evening",
        "after_midnight",
    }
    assert await task_names(recording_night__eq="none") == {"undated"}


@pytest.mark.asyncio
@pytest.mark.parametrize("utc_offset", [0, 120, -300, 330])
async def test_recording_night_filter_matches_the_night_grouping(
    db_session, test_dataset, test_settings, test_recording_id, test_annotation_project, utc_offset
):
    """The filter (a range on recorded_at) puts each task in the night the grouping counts it in,
    also right at the noon boundary and without a recording time (midnight)."""
    project = test_annotation_project
    noon_utc = datetime.datetime(2026, 6, 15, 12, 0) - datetime.timedelta(minutes=utc_offset)
    moments = [
        noon_utc - datetime.timedelta(seconds=1),
        noon_utc,
        noon_utc + datetime.timedelta(seconds=1),
    ]
    for moment in moments:
        recording = await _recording(
            db_session, test_dataset, test_settings, test_recording_id, moment.date(), moment.time()
        )
        await api.annotation_tasks.create(
            db_session, annotation_project=project, recording=recording, start_time=0.0, end_time=1.0
        )
    # No recording time: counts as midnight
    recording = await _recording(
        db_session, test_dataset, test_settings, test_recording_id, datetime.date(2026, 6, 16), None
    )
    await api.annotation_tasks.create(
        db_session, annotation_project=project, recording=recording, start_time=0.0, end_time=1.0
    )
    await db_session.commit()

    nights, _ = await api.annotation_tasks.get_nights(db_session, filters=[_project(project)], utc_offset=utc_offset)
    assert sum(n.total for n in nights) == 4
    for night in nights:
        _, count = await api.annotation_tasks.get_many(
            db_session,
            limit=-1,
            filters=[
                AnnotationTaskFilter(
                    annotation_project__eq=project.id,
                    recording_night__eq=night.night or "none",
                    recording_night__utc_offset=utc_offset,
                )
            ],
        )
        assert count == night.total, night.night

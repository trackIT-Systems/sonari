"""Tests for comparing GUANO detector predictions with reviewed annotations."""

import csv
import io
import json
import uuid
from pathlib import Path

import pytest
from httpx import AsyncClient
from soundevent import data
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from sonari import api, models, schemas
from sonari.services.prediction_corrections import (
    ProjectSource,
    _DirectoryListing,
    build_predictions,
    find_recording_source,
    get_prediction_corrections,
    parse_guano_text,
    parse_project_name,
    summarize_corrections,
)


def _sidecar(run_id: int, detections: list[dict]) -> str:
    return (
        "GUANO|Version: 1.0\n"
        f"SONARIX|Run|ID: {run_id}\n"
        "SONARIX|Detector|Name: yolobat11\n"
        "SONARIX|Detector|Version: 2026.4.1\n"
        f"SONARIX|Detector|Detections: {json.dumps(detections)}\n"
    )


def _det(species: str, coords: list[float], det_prob: float = 0.9, call_type: str | None = None) -> dict:
    return {
        "detector": "yolobat11",
        "species": species,
        "geometry": "bbox",
        "coords": coords,
        "det_prob": str(det_prob),
        "species_prob": None,
        "call_type": call_type,
    }


def test_parse_guano_text():
    fields = parse_guano_text(
        "GUANO|Version: 1.0\nTimestamp: 2026-04-29T11:06:28+02:00\nTS|yolobat|detections: []\n\nbroken line\n"
    )
    assert fields == {
        "GUANO|Version": "1.0",
        "Timestamp": "2026-04-29T11:06:28+02:00",
        "TS|yolobat|detections": "[]",
    }


def test_parse_project_name():
    assert parse_project_name("default-yolobat11 yolobat11 dev-test-rbyn7 3") == ("yolobat11", 3)
    assert parse_project_name("Old project") == (None, None)


def test_build_predictions_maps_and_groups_like_ecohub():
    predictions = build_predictions(
        "yolobat11",
        [
            _det("Mmyo", [0.1, 20000, 0.2, 80000], 0.6),
            # Same box: one event with both tags, highest confidence kept
            _det("Mmyo", [0.1, 20000, 0.2, 80000], 0.8),
            _det("Mdau", [0.1, 20000, 0.2, 80000], 0.7),
            _det("feeding-buzz", [0.3, 20000, 0.4, 80000]),
            _det("Ppip", [0.5, 20000, 0.6, 80000], call_type="social-call"),
            # Below the project's threshold
            _det("Nnoc", [0.7, 20000, 0.8, 80000], 0.1),
        ],
        threshold=0.2,
    )
    tags = {p.coords: [(t.key, t.values, t.detection_confidence) for t in p.tags] for p in predictions}
    assert tags == {
        (0.1, 20000.0, 0.2, 80000.0): [
            ("species", ("Myotis myotis",), 0.8),
            ("species", ("Myotis daubentonii",), 0.7),
        ],
        (0.3, 20000.0, 0.4, 80000.0): [("type", ("feeding-buzz",), 0.9)],
        (0.5, 20000.0, 0.6, 80000.0): [
            ("species", ("Pipistrellus pipistrellus",), 0.9),
            ("type", ("social-call",), 0.9),
        ],
    }


def test_birdedge_accepts_german_and_scientific_names():
    (prediction,) = build_predictions("birdedge", [_det("Amsel", [0.0, 0.0, 3.0, 12000])])
    assert prediction.tags[0].values == ("Amsel", "Turdus merula")
    assert prediction.tags[0].display_value({"Turdus merula"}) == "Turdus merula"
    assert prediction.tags[0].display_value({"Amsel"}) == "Amsel"


def test_find_recording_source_prefers_project_run_then_import(tmp_path: Path):
    audio = tmp_path / "rec.flac"
    audio.touch()
    (tmp_path / "rec.birdedge.0.1.guano").write_text(_sidecar(4, [_det("Amsel", [0.0, 0.0, 3.0, 1.0])]))
    (tmp_path / "rec.guano").write_text(
        "GUANO|Version: 1.0\n"
        'TS|birdedge|detections: [{"Time": 0.5, "Duration (s)": 2.0, "Species": "Turdus merula", '
        '"Confidence": 0.4, "Low": 100, "High": 9000}]\n'
    )

    from_run = find_recording_source(audio, ProjectSource("birdedge", run_id=4), _DirectoryListing())
    assert from_run.path.name == "rec.birdedge.0.1.guano"

    from_import = find_recording_source(audio, ProjectSource("birdedge", run_id=6), _DirectoryListing())
    assert from_import.path.name == "rec.guano"
    (prediction,) = from_import.predictions
    assert prediction.coords == (0.5, 100.0, 2.5, 9000.0)
    assert prediction.tags[0].detection_confidence == 0.4

    (tmp_path / "rec.guano").unlink()
    fallback = find_recording_source(audio, ProjectSource("birdedge", run_id=6), _DirectoryListing())
    assert fallback.path.name == "rec.birdedge.0.1.guano"

    assert find_recording_source(tmp_path / "other.flac", ProjectSource("birdedge"), _DirectoryListing()) is None


async def _tag(session: AsyncSession, key: str, value: str) -> models.Tag:
    tag = await session.scalar(select(models.Tag).where(models.Tag.key == key, models.Tag.value == value))
    if tag is None:
        tag = models.Tag(key=key, value=value, created_by_id=None)
        session.add(tag)
        await session.flush()
    return tag


async def _event(
    session, task, user_id, coords: list[float], tags: list[tuple[str, str]]
) -> models.SoundEventAnnotation:
    event = models.SoundEventAnnotation(
        annotation_task_id=task.id,
        recording_id=task.recording_id,
        geometry_type="BoundingBox",
        geometry=data.BoundingBox(coordinates=coords),
        created_by_id=user_id,
    )
    session.add(event)
    await session.flush()
    for key, value in tags:
        tag = await _tag(session, key, value)
        session.add(
            models.SoundEventAnnotationTag(sound_event_annotation_id=event.id, tag_id=tag.id, created_by_id=user_id)
        )
    return event


@pytest.fixture
async def reviewed_project(
    db_session: AsyncSession,
    test_dataset: schemas.Dataset,
    test_settings,
    test_user,
):
    """Create a yolobat project with one reviewed and one open task, and its GUANO sidecar."""
    import numpy as np
    import soundfile as sf

    wav_path = test_settings.audio_dir / test_dataset.audio_dir / f"rec_{uuid.uuid4().hex[:8]}.wav"
    sf.write(wav_path, np.random.default_rng().uniform(-0.1, 0.1, 44100), 44100)
    test_recording = await api.recordings.create(db_session, path=wav_path)
    station = Path(test_recording.path).parts[0]
    project = await api.annotation_projects.create(
        db_session,
        name=f"proc-{uuid.uuid4().hex[:6]} yolobat11 {station} 7",
        description="",
        annotation_instructions="",
    )
    reviewed = await api.annotation_tasks.create(
        db_session, annotation_project=project, recording=test_recording, start_time=0.0, end_time=0.5
    )
    await api.annotation_tasks.create(
        db_session, annotation_project=project, recording=test_recording, start_time=0.5, end_time=1.0
    )
    yolobat_id = await db_session.scalar(select(models.User.id).where(models.User.username == "yolobat"))

    # Predicted Mmyo, still there
    await _event(db_session, reviewed, yolobat_id, [0.01, 20000.0, 0.02, 80000.0], [("species", "Myotis myotis")])
    # Predicted Mdau, relabeled by the reviewer
    await _event(db_session, reviewed, yolobat_id, [0.05, 20000.0, 0.06, 80000.0], [("species", "Myotis bechsteinii")])
    # Predicted Nnoc, box moved but tag kept
    await _event(db_session, reviewed, yolobat_id, [0.101, 20000.0, 0.111, 79000.0], [("species", "Nyctalus noctula")])
    # Missed by the detector, drawn by the reviewer
    await _event(
        db_session, reviewed, test_user.id, [0.3, 20000.0, 0.31, 60000.0], [("species", "Eptesicus serotinus")]
    )
    db_session.add(
        models.AnnotationStatusBadge(
            annotation_task_id=reviewed.id, state=data.AnnotationState.completed, user_id=test_user.id
        )
    )
    await db_session.commit()

    audio_path = test_settings.audio_dir / test_recording.path
    detections = [
        _det("Mmyo", [0.01, 20000.0, 0.02, 80000.0]),
        _det("Mdau", [0.05, 20000.0, 0.06, 80000.0]),
        _det("Nnoc", [0.1, 20000.0, 0.11, 80000.0]),
        # Deleted by the reviewer
        _det("Ppip", [0.2, 20000.0, 0.21, 80000.0]),
        # In the open task: not compared
        _det("Pnat", [0.7, 20000.0, 0.71, 80000.0]),
    ]
    sidecar = audio_path.with_name(f"{audio_path.stem}.yolobat11.2026.4.1.guano")
    sidecar.write_text(_sidecar(7, detections))
    yield project, reviewed
    sidecar.unlink()


@pytest.mark.asyncio
async def test_prediction_corrections(db_session: AsyncSession, reviewed_project, test_settings):
    project, reviewed = reviewed_project
    corrections = await get_prediction_corrections(db_session, project, test_settings.audio_dir)

    outcomes = sorted((r.outcome, r.predicted_value, tuple(r.final_values), r.box_changed) for r in corrections.rows)
    assert outcomes == [
        ("added", None, ("Eptesicus serotinus",), None),
        ("confirmed", "Myotis myotis", ("Myotis myotis",), False),
        ("confirmed", "Nyctalus noctula", ("Nyctalus noctula",), True),
        ("event_deleted", "Pipistrellus pipistrellus", (), None),
        ("relabeled", "Myotis daubentonii", ("Myotis bechsteinii",), False),
    ]
    assert {r.annotation_task_id for r in corrections.rows} == {reviewed.id}
    assert {r.review_status for r in corrections.rows} == {"completed"}

    stats = summarize_corrections(corrections)
    assert (stats.detector, stats.run_id, stats.model_versions) == ("yolobat11", 7, ["2026.4.1"])
    assert (stats.reviewed_tasks, stats.recordings, stats.recordings_with_source) == (1, 1, 1)
    # Two of the three detector events kept their exact box
    assert stats.match_rate == pytest.approx(2 / 3)
    assert not stats.reliable
    by_value = {s.value: s for s in stats.species}
    assert by_value["Myotis daubentonii"].relabeled_to[0].value == "Myotis bechsteinii"
    assert by_value["Nyctalus noctula"].box_changed == 1
    assert by_value["Pipistrellus pipistrellus"].event_deleted == 1
    assert [(a.value, a.count) for a in stats.added] == [("Eptesicus serotinus", 1)]


@pytest.mark.asyncio
async def test_prediction_corrections_routes(auth_client: AsyncClient, reviewed_project):
    project, _ = reviewed_project
    response = await auth_client.get(
        "/api/v1/annotation_projects/detail/prediction_corrections/",
        params={"annotation_project_id": project.id},
    )
    assert response.status_code == 200, response.text
    assert response.json()["recordings_with_source"] == 1

    response = await auth_client.get("/api/v1/export/corrections/", params={"annotation_project_ids": [project.id]})
    assert response.status_code == 200, response.text
    rows = list(csv.DictReader(io.StringIO(response.text)))
    assert sorted(r["outcome"] for r in rows) == ["added", "confirmed", "confirmed", "event_deleted", "relabeled"]
    relabeled = next(r for r in rows if r["outcome"] == "relabeled")
    assert (relabeled["predicted_label"], relabeled["final_values"]) == ("Mdau", "Myotis bechsteinii")


@pytest.mark.asyncio
async def test_guano_backfill_creates_originals_for_earlier_edits(
    auth_client: AsyncClient, db_session: AsyncSession, reviewed_project, test_user
):
    """Edits from before the history: relabeled and moved events belong to the reviewer, no confidence."""
    project, reviewed = reviewed_project
    events = {
        e.geometry.coordinates[0]: e
        for e in (
            await db_session.scalars(
                select(models.SoundEventAnnotation).where(models.SoundEventAnnotation.annotation_task_id == reviewed.id)
            )
        ).all()
    }
    for start in (0.05, 0.101):
        events[start].created_by_id = test_user.id
    # The untouched prediction still has its confidence.
    db_session.add(
        models.SoundEventAnnotationFeature(
            sound_event_annotation_id=events[0.01].id, name="detection_confidence:Myotis myotis", value=0.9
        )
    )
    await db_session.commit()

    response = await auth_client.post(
        "/api/v1/annotation_projects/detail/prediction_history/backfill/",
        params={"annotation_project_id": project.id},
    )
    assert response.status_code == 200, response.text

    response = await auth_client.get(
        "/api/v1/annotation_projects/detail/prediction_history/",
        params={"annotation_project_id": project.id},
    )
    assert response.status_code == 200, response.text
    stats = schemas.PredictionHistoryStats.model_validate(response.json())
    assert stats.backfill is not None
    assert (stats.backfill.state, stats.backfill.error) == ("done", None)
    assert (stats.backfill.originals_created, stats.backfill.match_rate) == (3, 1.0)

    by_value = {s.value: s for s in stats.species}
    assert by_value["Myotis myotis"].confirmed == 1
    assert by_value["Myotis daubentonii"].relabeled == 1
    assert by_value["Myotis daubentonii"].relabeled_to[0].value == "Myotis bechsteinii"
    assert (by_value["Nyctalus noctula"].confirmed, by_value["Nyctalus noctula"].box_changed) == (1, 1)
    assert by_value["Pipistrellus pipistrellus"].event_deleted == 1
    assert [(a.value, a.count) for a in stats.added] == [("Eptesicus serotinus", 1)]
    assert (stats.reviewed_tasks, stats.predicted_events, stats.edited_events) == (1, 4, 3)

    # A rerun skips the task, which already has GUANO originals.
    response = await auth_client.post(
        "/api/v1/annotation_projects/detail/prediction_history/backfill/",
        params={"annotation_project_id": project.id},
    )
    assert response.status_code == 200, response.text
    originals = (
        await db_session.scalars(
            select(models.SoundEventOriginal).where(models.SoundEventOriginal.annotation_task_id == reviewed.id)
        )
    ).all()
    assert len(originals) == 3


@pytest.mark.asyncio
async def test_guano_backfill_refuses_files_of_another_run(auth_client: AsyncClient, reviewed_project):
    """The fixture's detector events don't match the GUANO boxes well enough (2 of 3)."""
    project, _ = reviewed_project
    response = await auth_client.post(
        "/api/v1/annotation_projects/detail/prediction_history/backfill/",
        params={"annotation_project_id": project.id},
    )
    assert response.status_code == 200, response.text
    response = await auth_client.get(
        "/api/v1/annotation_projects/detail/prediction_history/",
        params={"annotation_project_id": project.id},
    )
    backfill = response.json()["backfill"]
    assert backfill["state"] == "failed"
    assert "another run" in backfill["error"]
    assert backfill["originals_created"] == 0

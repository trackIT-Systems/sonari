"""Tests for guided tour fixture export/import and the sonari-guided-tour CLI."""

import json
import shutil
import uuid
import wave
from pathlib import Path

import pytest
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from sonari import api, models, schemas
from sonari.cli.guided_tour import parse_args, run
from sonari.services.guided_tour_fixture import (
    GuidedTourFixture,
    export_template_fixture,
    import_template_fixture,
)


def _write_wav(path: Path, seconds: float = 1.0, samplerate: int = 8000) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(samplerate)
        # Unique content per file so recording hashes differ.
        w.writeframes(uuid.uuid4().bytes * int(samplerate * seconds / 8))


@pytest.fixture
def audio_root(tmp_path: Path) -> Path:
    return tmp_path / "audio"


def _fixture_dict(folder: str, wrong_tag: str) -> dict:
    return {
        "format_version": 1,
        "variant": "bat",
        "audio_folder": folder,
        "recordings": [
            {"path": f"{folder}/a.wav", "date": "2025-06-01", "time": "21:00:00"},
            {"path": f"{folder}/b.wav", "date": "2025-06-02", "time": "22:30:00"},
        ],
        "tasks": [
            {
                "recording_path": f"{folder}/a.wav",
                "start_time": 0.0,
                "end_time": 0.5,
                "tags": [{"key": "quality", "value": "good"}],
                "features": [{"name": "noise", "value": 0.25}],
                "sound_event_annotations": [
                    {
                        "geometry": {"type": "BoundingBox", "coordinates": [0.1, 100.0, 0.2, 2000.0]},
                        "tags": [{"key": "this", "value": wrong_tag}],
                        "features": [{"name": "duration", "value": 0.1}],
                    },
                ],
            },
            {
                "recording_path": f"{folder}/a.wav",
                "start_time": 0.5,
                "end_time": 1.0,
                "sound_event_annotations": [
                    {"geometry": {"type": "TimeInterval", "coordinates": [0.6, 0.7]}},
                ],
            },
            {"recording_path": f"{folder}/b.wav", "start_time": 0.0, "end_time": 1.0},
        ],
    }


def _setup_audio(audio_root: Path) -> str:
    folder = f"tour-{uuid.uuid4().hex[:8]}"
    _write_wav(audio_root / folder / "a.wav")
    _write_wav(audio_root / folder / "b.wav")
    return folder


@pytest.mark.asyncio
async def test_import_then_export_round_trips(db_session: AsyncSession, audio_root: Path):
    folder = _setup_audio(audio_root)
    fixture = GuidedTourFixture.model_validate(_fixture_dict(folder, f"is wrong {folder}"))

    result = await import_template_fixture(db_session, fixture, audio_dir=audio_root)
    await db_session.commit()

    assert result.status == "imported"
    assert (result.tasks, result.sound_events, result.registered_recordings) == (3, 2, 2)
    assert result.created_tags >= 1
    assert result.warnings == []

    exported = await export_template_fixture(db_session, result.template_id, "bat")
    assert exported.model_dump(mode="json") == fixture.model_dump(mode="json")


@pytest.mark.asyncio
async def test_reimport_is_unchanged_until_fixture_changes(db_session: AsyncSession, audio_root: Path):
    folder = _setup_audio(audio_root)
    data = _fixture_dict(folder, "is wrong")
    first = await import_template_fixture(
        db_session, GuidedTourFixture.model_validate(data), audio_dir=audio_root
    )
    await db_session.commit()

    again = await import_template_fixture(
        db_session, GuidedTourFixture.model_validate(data), audio_dir=audio_root
    )
    assert again.status == "unchanged"
    assert again.checksum == first.checksum

    data["tasks"][1]["sound_event_annotations"] = []
    changed = await import_template_fixture(
        db_session, GuidedTourFixture.model_validate(data), audio_dir=audio_root
    )
    await db_session.commit()
    assert changed.status == "imported"
    assert changed.sound_events == 1
    assert changed.registered_recordings == 0
    assert changed.template_id == first.template_id


@pytest.mark.asyncio
async def test_import_fails_when_audio_is_missing(db_session: AsyncSession, audio_root: Path):
    folder = f"tour-{uuid.uuid4().hex[:8]}"
    _write_wav(audio_root / folder / "a.wav")  # b.wav missing
    fixture = GuidedTourFixture.model_validate(_fixture_dict(folder, "is wrong"))

    with pytest.raises(ValueError, match="b.wav"):
        await import_template_fixture(db_session, fixture, audio_dir=audio_root)
    await db_session.rollback()


@pytest.mark.asyncio
async def test_import_reuses_recording_registered_under_other_path(db_session: AsyncSession, audio_root: Path):
    folder = _setup_audio(audio_root)
    other = audio_root / f"elsewhere-{uuid.uuid4().hex[:8]}" / "a-copy.wav"
    other.parent.mkdir(parents=True)
    shutil.copy(audio_root / folder / "a.wav", other)
    existing = await api.recordings.create(db_session, path=other, audio_dir=audio_root)
    await db_session.commit()

    fixture = GuidedTourFixture.model_validate(_fixture_dict(folder, "is wrong"))
    result = await import_template_fixture(db_session, fixture, audio_dir=audio_root)
    await db_session.commit()

    assert (result.tasks, result.registered_recordings) == (3, 1)
    assert any(f"{folder}/a.wav is already registered as" in w for w in result.warnings)
    recording_ids = (
        await db_session.execute(
            select(models.AnnotationTask.recording_id)
            .where(models.AnnotationTask.annotation_project_id == result.template_id)
            .order_by(models.AnnotationTask.id),
        )
    ).scalars().all()
    assert recording_ids[:2] == [existing.id, existing.id]

    dataset = await api.datasets.get_by_audio_dir(db_session, Path(folder))
    linked = (
        await db_session.execute(
            select(models.DatasetRecording.recording_id).where(models.DatasetRecording.dataset_id == dataset.id),
        )
    ).scalars().all()
    assert existing.id in linked
    assert len(linked) == 2

    # A forced re-import must not link the reused recording twice.
    await import_template_fixture(db_session, fixture, audio_dir=audio_root, force=True)
    await db_session.commit()


@pytest.mark.asyncio
async def test_import_reuses_dataset_with_same_name_and_other_audio_dir(db_session: AsyncSession, audio_root: Path):
    folder = _setup_audio(audio_root)
    other_dir = audio_root / f"elsewhere-{uuid.uuid4().hex[:8]}"
    other_dir.mkdir(parents=True)
    await api.datasets.create_from_data(
        db_session,
        schemas.DatasetCreate(name=folder, audio_dir=other_dir),
        audio_dir=audio_root,
    )
    await db_session.commit()

    fixture = GuidedTourFixture.model_validate(_fixture_dict(folder, "is wrong"))
    result = await import_template_fixture(db_session, fixture, audio_dir=audio_root)
    await db_session.commit()

    assert (result.tasks, result.registered_recordings) == (3, 2)
    assert any(f"Dataset {folder!r} already exists" in w for w in result.warnings)


def test_fixture_rejects_unknown_recording():
    data = _fixture_dict("tour", "is wrong")
    data["recordings"] = data["recordings"][:1]
    with pytest.raises(ValidationError, match="not listed"):
        GuidedTourFixture.model_validate(data)


def test_fixture_rejects_recordings_outside_folder():
    data = _fixture_dict("tour", "is wrong")
    data["recordings"][0]["path"] = "elsewhere/a.wav"
    data["tasks"][0]["recording_path"] = "elsewhere/a.wav"
    data["tasks"][1]["recording_path"] = "elsewhere/a.wav"
    with pytest.raises(ValidationError, match="outside audio_folder"):
        GuidedTourFixture.model_validate(data)


@pytest.mark.asyncio
async def test_cli_import_dry_run_then_import_then_export(
    test_settings, setup_test_db, audio_root: Path, tmp_path: Path, capsys
):
    folder = _setup_audio(audio_root)
    fixture_path = tmp_path / "bat.json"
    fixture_path.write_text(json.dumps(_fixture_dict(folder, "is wrong")))
    audio_args = ["--audio-dir", str(audio_root)]

    assert await run(test_settings, parse_args(["import", str(fixture_path), *audio_args, "--dry-run"])) == 0
    assert "would import 3 tasks" in capsys.readouterr().out

    assert await run(test_settings, parse_args(["import", str(fixture_path), *audio_args])) == 0
    assert "imported 3 tasks" in capsys.readouterr().out

    assert await run(test_settings, parse_args(["import", str(fixture_path), *audio_args])) == 0
    assert "unchanged" in capsys.readouterr().out

    out_path = tmp_path / "exported.json"
    assert await run(
        test_settings, parse_args(["export", "--template", "--variant", "bat", "-o", str(out_path)])
    ) == 0
    exported = json.loads(out_path.read_text())
    assert exported == GuidedTourFixture.model_validate_json(fixture_path.read_text()).model_dump(mode="json")


@pytest.mark.asyncio
async def test_cli_reports_errors(test_settings, setup_test_db, tmp_path: Path, capsys):
    missing = tmp_path / "nope.json"
    assert await run(test_settings, parse_args(["import", str(missing)])) == 1
    assert "Invalid fixture" in capsys.readouterr().err

    args = parse_args(["export", "--project", "does not exist", "--variant", "bat"])
    assert await run(test_settings, args) == 1
    assert "not found" in capsys.readouterr().err


@pytest.mark.asyncio
async def test_bird_layout_subfolder_without_dates_keeps_task_order(db_session: AsyncSession, audio_root: Path):
    """Bird tour layout: audio in <folder>/Birds/, recordings without date/time."""
    folder = f"bird-{uuid.uuid4().hex[:8]}"
    names = [f"Birds/rec{i}.wav" for i in range(3)]
    for name in names:
        _write_wav(audio_root / folder / name)
    fixture = GuidedTourFixture.model_validate(
        {
            "variant": "bird",
            "audio_folder": folder,
            "recordings": [{"path": f"{folder}/{n}"} for n in names],
            # Deliberately not in path order: file order is the lesson order.
            "tasks": [
                {"recording_path": f"{folder}/{n}", "start_time": 0.0, "end_time": 0.5}
                for n in (names[2], names[0], names[1])
            ],
        },
    )

    result = await import_template_fixture(db_session, fixture, audio_dir=audio_root)
    await db_session.commit()
    assert (result.tasks, result.registered_recordings) == (3, 3)

    exported = await export_template_fixture(db_session, result.template_id, "bird")
    assert [t.recording_path for t in exported.tasks] == [f"{folder}/{n}" for n in (names[2], names[0], names[1])]


_SHIPPED_FIXTURES = Path(__file__).resolve().parents[3] / "scripts" / "guided_tour_fixtures"


@pytest.mark.parametrize("variant", ["bird", "bat"])
def test_shipped_fixture_keeps_lesson_order(variant: str):
    """Lessons are bound to tasks by position; dating recordings must not reorder them.

    Tasks are sorted by recording date, time, then id, with undated recordings
    last. So only the first task's recording may carry a date.
    """
    path = _SHIPPED_FIXTURES / f"{variant}.json"
    if not path.exists():
        pytest.skip("shipped fixtures not available")
    fixture = GuidedTourFixture.model_validate_json(path.read_text(encoding="utf-8"))

    by_path = {r.path: r for r in fixture.recordings}
    far_future = (9999, 1, 1)
    keys = []
    for position, task in enumerate(fixture.tasks):
        rec = by_path[task.recording_path]
        date = (rec.date.year, rec.date.month, rec.date.day) if rec.date else far_future
        time = (rec.time.hour, rec.time.minute, rec.time.second) if rec.time else (99, 0, 0)
        keys.append((date, time, position))

    assert keys == sorted(keys), f"{variant}: recording dates would reorder the tour tasks"

    first = by_path[fixture.tasks[0].recording_path]
    assert first.date is not None and first.time is not None
    assert first.latitude is not None and first.longitude is not None, "first lesson shows the location map"

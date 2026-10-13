"""Guided tour templates as portable JSON fixtures.

A fixture holds everything a template needs except the audio itself:
recordings (by path relative to the audio dir, with the metadata that decides
lesson order), tasks, sound events, tags and features. Servers load it with
``sonari-guided-tour import``; nothing is copied between servers at runtime.
"""

from __future__ import annotations

import datetime
import hashlib
import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator
from soundevent import Geometry
from sqlalchemy import insert, select, tuple_
from sqlalchemy.ext.asyncio import AsyncSession

from sonari import api, exceptions, models, schemas
from sonari.schemas.annotation_projects import GuidedTourVariant
from sonari.services.guided_tour import (
    _delete_project_tasks,
    _get_or_create_template,
)

__all__ = [
    "GuidedTourFixture",
    "ImportResult",
    "export_template_fixture",
    "fixture_checksum",
    "import_template_fixture",
]

FORMAT_VERSION = 1
_CHECKSUM_RE = re.compile(r"fixture-sha256=([0-9a-f]{64})")


class FixtureTag(BaseModel):
    key: str
    value: str


class FixtureFeature(BaseModel):
    name: str
    value: float


class FixtureSoundEvent(BaseModel):
    geometry: Geometry = Field(..., discriminator="type")
    tags: list[FixtureTag] = Field(default_factory=list)
    features: list[FixtureFeature] = Field(default_factory=list)


class FixtureRecording(BaseModel):
    path: str
    """Relative to the audio dir, e.g. ``workshop-awst25-bat09/foo.flac``."""
    date: datetime.date | None = None
    time: datetime.time | None = None
    latitude: float | None = None
    longitude: float | None = None
    time_expansion: float = 1.0


class FixtureTask(BaseModel):
    recording_path: str
    start_time: float
    end_time: float
    tags: list[FixtureTag] = Field(default_factory=list)
    features: list[FixtureFeature] = Field(default_factory=list)
    sound_event_annotations: list[FixtureSoundEvent] = Field(default_factory=list)


class GuidedTourFixture(BaseModel):
    format_version: Literal[1] = FORMAT_VERSION
    variant: GuidedTourVariant
    audio_folder: str
    """Folder under the audio dir holding all recordings of this tour."""
    recordings: list[FixtureRecording]
    tasks: list[FixtureTask]
    """In lesson order (recording date, time, then position here)."""

    @model_validator(mode="after")
    def _check_paths(self) -> GuidedTourFixture:
        known = {r.path for r in self.recordings}
        missing = sorted({t.recording_path for t in self.tasks} - known)
        if missing:
            raise ValueError(f"Tasks reference recordings not listed in 'recordings': {missing}")
        outside = sorted(p for p in known if Path(p).parts[:1] != (self.audio_folder,))
        if outside:
            raise ValueError(f"Recordings outside audio_folder {self.audio_folder!r}: {outside}")
        return self


def fixture_checksum(fixture: GuidedTourFixture) -> str:
    canonical = json.dumps(fixture.model_dump(mode="json"), sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode()).hexdigest()


def _template_description(checksum: str) -> str:
    return f"Hidden template for guided user tours. fixture-sha256={checksum}"


# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------


async def export_template_fixture(
    session: AsyncSession,
    project_id: int,
    variant: GuidedTourVariant,
) -> GuidedTourFixture:
    """Read any annotation project into a fixture (notes and badges are skipped)."""
    task_t = models.AnnotationTask.__table__
    rec_t = models.Recording.__table__
    tag_t = models.Tag.__table__
    sea_t = models.SoundEventAnnotation.__table__

    rows = (
        await session.execute(
            select(
                task_t.c.id,
                task_t.c.start_time,
                task_t.c.end_time,
                rec_t.c.path,
                rec_t.c.date,
                rec_t.c.time,
                rec_t.c.latitude,
                rec_t.c.longitude,
                rec_t.c.time_expansion,
            )
            .join(rec_t, rec_t.c.id == task_t.c.recording_id)
            .where(task_t.c.annotation_project_id == project_id)
            .order_by(rec_t.c.date, rec_t.c.time, task_t.c.id),
        )
    ).all()
    if not rows:
        raise ValueError(f"Annotation project {project_id} has no tasks.")

    folders = sorted({Path(r.path).parts[0] for r in rows})
    if len(folders) != 1:
        raise ValueError(f"Recordings must share one top-level folder, found: {folders}")

    task_ids = [r.id for r in rows]

    task_tags: dict[int, list[FixtureTag]] = {}
    for r in await session.execute(
        select(models.AnnotationTaskTag.annotation_task_id, tag_t.c.key, tag_t.c.value)
        .join(tag_t, tag_t.c.id == models.AnnotationTaskTag.tag_id)
        .where(models.AnnotationTaskTag.annotation_task_id.in_(task_ids))
        .distinct()
        .order_by(tag_t.c.key, tag_t.c.value),
    ):
        task_tags.setdefault(r.annotation_task_id, []).append(FixtureTag(key=r.key, value=r.value))

    task_features: dict[int, list[FixtureFeature]] = {}
    for r in await session.execute(
        select(models.AnnotationTaskFeature)
        .where(models.AnnotationTaskFeature.annotation_task_id.in_(task_ids))
        .order_by(models.AnnotationTaskFeature.name),
    ):
        f = r[0]
        task_features.setdefault(f.annotation_task_id, []).append(FixtureFeature(name=f.name, value=f.value))

    events = (
        await session.execute(
            select(sea_t.c.id, sea_t.c.annotation_task_id, sea_t.c.geometry)
            .where(sea_t.c.annotation_task_id.in_(task_ids))
            .order_by(sea_t.c.id),
        )
    ).all()
    event_ids = [e.id for e in events]

    event_tags: dict[int, list[FixtureTag]] = {}
    event_features: dict[int, list[FixtureFeature]] = {}
    if event_ids:
        for r in await session.execute(
            select(models.SoundEventAnnotationTag.sound_event_annotation_id, tag_t.c.key, tag_t.c.value)
            .join(tag_t, tag_t.c.id == models.SoundEventAnnotationTag.tag_id)
            .where(models.SoundEventAnnotationTag.sound_event_annotation_id.in_(event_ids))
            .distinct()
            .order_by(tag_t.c.key, tag_t.c.value),
        ):
            event_tags.setdefault(r.sound_event_annotation_id, []).append(FixtureTag(key=r.key, value=r.value))
        for r in await session.execute(
            select(models.SoundEventAnnotationFeature)
            .where(models.SoundEventAnnotationFeature.sound_event_annotation_id.in_(event_ids))
            .order_by(models.SoundEventAnnotationFeature.name),
        ):
            f = r[0]
            event_features.setdefault(f.sound_event_annotation_id, []).append(
                FixtureFeature(name=f.name, value=f.value),
            )

    events_by_task: dict[int, list[FixtureSoundEvent]] = {}
    for e in events:
        events_by_task.setdefault(e.annotation_task_id, []).append(
            FixtureSoundEvent(
                geometry=e.geometry,
                tags=event_tags.get(e.id, []),
                features=event_features.get(e.id, []),
            ),
        )

    recordings: dict[str, FixtureRecording] = {}
    tasks: list[FixtureTask] = []
    for r in rows:
        path = Path(r.path).as_posix()
        recordings.setdefault(
            path,
            FixtureRecording(
                path=path,
                date=r.date,
                time=r.time,
                latitude=r.latitude,
                longitude=r.longitude,
                time_expansion=r.time_expansion,
            ),
        )
        tasks.append(
            FixtureTask(
                recording_path=path,
                start_time=r.start_time,
                end_time=r.end_time,
                tags=task_tags.get(r.id, []),
                features=task_features.get(r.id, []),
                sound_event_annotations=events_by_task.get(r.id, []),
            ),
        )

    return GuidedTourFixture(
        variant=variant,
        audio_folder=folders[0],
        recordings=list(recordings.values()),
        tasks=tasks,
    )


# ---------------------------------------------------------------------------
# Import
# ---------------------------------------------------------------------------


@dataclass
class ImportResult:
    status: Literal["imported", "unchanged"]
    checksum: str
    template_id: int
    tasks: int = 0
    sound_events: int = 0
    registered_recordings: int = 0
    created_tags: int = 0
    warnings: list[str] = field(default_factory=list)


async def _register_recordings(
    session: AsyncSession,
    fixture: GuidedTourFixture,
    audio_dir: Path,
    result: ImportResult,
) -> dict[str, int]:
    """Make sure every fixture recording has a DB row; return path → id."""
    rec_t = models.Recording.__table__
    paths = [Path(r.path) for r in fixture.recordings]

    def lookup_query():
        return select(rec_t.c.id, rec_t.c.path, rec_t.c.date, rec_t.c.time).where(rec_t.c.path.in_(paths))

    existing = {Path(r.path).as_posix(): r for r in await session.execute(lookup_query())}
    missing = [r for r in fixture.recordings if r.path not in existing]

    if missing:
        folder = audio_dir / fixture.audio_folder
        absent = [r.path for r in missing if not (audio_dir / r.path).is_file()]
        if absent:
            raise ValueError(f"Audio files missing under {audio_dir}: {absent}")
        try:
            dataset = await api.datasets.get_by_audio_dir(session, Path(fixture.audio_folder))
        except exceptions.NotFoundError:
            dataset = await api.datasets.create_from_data(
                session,
                schemas.DatasetCreate(
                    name=fixture.audio_folder,
                    description="Audio for the Sonari guided tour.",
                    audio_dir=folder,
                ),
                audio_dir=audio_dir,
            )
        for rec in missing:
            await api.datasets.add_file(
                session,
                dataset,
                audio_dir / rec.path,
                date=rec.date,
                time=rec.time,
                latitude=rec.latitude,
                longitude=rec.longitude,
                time_expansion=rec.time_expansion,
                audio_dir=audio_dir,
            )
        result.registered_recordings = len(missing)
        existing = {Path(r.path).as_posix(): r for r in await session.execute(lookup_query())}

    # Lesson order follows recording date/time; flag rows registered earlier
    # with different values.
    for rec in fixture.recordings:
        row = existing[rec.path]
        if (row.date, row.time) != (rec.date, rec.time):
            result.warnings.append(
                f"{rec.path}: database has date/time {row.date} {row.time}, "
                f"fixture has {rec.date} {rec.time}; lesson order may differ.",
            )
    return {path: row.id for path, row in existing.items()}


async def _resolve_tags(
    session: AsyncSession,
    fixture: GuidedTourFixture,
    created_by_id: UUID | None,
    result: ImportResult,
) -> dict[tuple[str, str], int]:
    tag_t = models.Tag.__table__
    wanted = {
        (t.key, t.value)
        for task in fixture.tasks
        for t in [*task.tags, *(tag for e in task.sound_event_annotations for tag in e.tags)]
    }
    if not wanted:
        return {}

    def lookup_query():
        return select(tag_t.c.id, tag_t.c.key, tag_t.c.value).where(
            tuple_(tag_t.c.key, tag_t.c.value).in_(sorted(wanted)),
        )

    found = {(r.key, r.value): r.id for r in await session.execute(lookup_query())}
    missing = sorted(wanted - found.keys())
    if missing:
        now = datetime.datetime.now(datetime.timezone.utc)
        await session.execute(
            insert(tag_t),
            [{"key": k, "value": v, "created_by_id": created_by_id, "created_on": now} for k, v in missing],
        )
        result.created_tags = len(missing)
        found = {(r.key, r.value): r.id for r in await session.execute(lookup_query())}
    return found


async def import_template_fixture(
    session: AsyncSession,
    fixture: GuidedTourFixture,
    *,
    audio_dir: Path,
    created_by_id: UUID | None = None,
    force: bool = False,
) -> ImportResult:
    """Replace the variant's template with the fixture content.

    Does not commit. Returns ``status="unchanged"`` without touching the
    database when the template was already imported from an identical fixture.
    """
    checksum = fixture_checksum(fixture)
    template = await _get_or_create_template(session, fixture.variant)
    result = ImportResult(status="imported", checksum=checksum, template_id=template.id)

    current = _CHECKSUM_RE.search(template.description or "")
    if not force and current and current.group(1) == checksum:
        result.status = "unchanged"
        return result

    recording_ids = await _register_recordings(session, fixture, audio_dir, result)
    tag_ids = await _resolve_tags(session, fixture, created_by_id, result)

    await _delete_project_tasks(session, template)

    task_t = models.AnnotationTask.__table__
    sea_t = models.SoundEventAnnotation.__table__
    now = datetime.datetime.now(datetime.timezone.utc)

    new_task_ids = (
        await session.execute(
            insert(task_t).returning(task_t.c.id, sort_by_parameter_order=True),
            [
                {
                    "annotation_project_id": template.id,
                    "recording_id": recording_ids[t.recording_path],
                    "start_time": t.start_time,
                    "end_time": t.end_time,
                    "created_on": now,
                }
                for t in fixture.tasks
            ],
        )
    ).scalars().all()

    task_tag_rows = []
    task_feature_rows = []
    event_rows = []
    event_specs: list[FixtureSoundEvent] = []
    for task, task_id in zip(fixture.tasks, new_task_ids, strict=True):
        for t in {(t.key, t.value) for t in task.tags}:
            task_tag_rows.append(
                {"annotation_task_id": task_id, "tag_id": tag_ids[t], "created_by_id": created_by_id, "created_on": now},
            )
        for f in task.features:
            task_feature_rows.append({"annotation_task_id": task_id, "name": f.name, "value": f.value, "created_on": now})
        for event in task.sound_event_annotations:
            event_rows.append(
                {
                    "annotation_task_id": task_id,
                    "recording_id": recording_ids[task.recording_path],
                    "geometry_type": event.geometry.type,
                    "geometry": event.geometry,
                    "created_by_id": created_by_id,
                    "created_on": now,
                },
            )
            event_specs.append(event)

    if task_tag_rows:
        await session.execute(insert(models.AnnotationTaskTag.__table__), task_tag_rows)
    if task_feature_rows:
        await session.execute(insert(models.AnnotationTaskFeature.__table__), task_feature_rows)

    if event_rows:
        new_event_ids = (
            await session.execute(
                insert(sea_t).returning(sea_t.c.id, sort_by_parameter_order=True),
                event_rows,
            )
        ).scalars().all()
        event_tag_rows = []
        event_feature_rows = []
        for event, event_id in zip(event_specs, new_event_ids, strict=True):
            for t in {(t.key, t.value) for t in event.tags}:
                event_tag_rows.append(
                    {
                        "sound_event_annotation_id": event_id,
                        "tag_id": tag_ids[t],
                        "created_by_id": created_by_id,
                        "created_on": now,
                    },
                )
            for f in event.features:
                event_feature_rows.append(
                    {"sound_event_annotation_id": event_id, "name": f.name, "value": f.value, "created_on": now},
                )
        if event_tag_rows:
            await session.execute(insert(models.SoundEventAnnotationTag.__table__), event_tag_rows)
        if event_feature_rows:
            await session.execute(insert(models.SoundEventAnnotationFeature.__table__), event_feature_rows)

    await session.execute(
        models.AnnotationProject.__table__.update()
        .where(models.AnnotationProject.id == template.id)
        .values(description=_template_description(checksum)),
    )

    result.tasks = len(new_task_ids)
    result.sound_events = len(event_rows)
    return result

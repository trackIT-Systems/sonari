"""Project stats on corrected predictions, and the GUANO backfill of versions.

The stats read the database only:

- A *prediction* is an imported sound event with a detector confidence. Detectors always
  write one, edits remove it from the live event, and versions keep it.
- An edited event is compared through its oldest version: the state before the first
  edit (or the GUANO prediction, see below) against the live event, or a delete.
- Untouched predictions in completed or verified tasks count as confirmed.
- Tags of the other events in those tasks count as added by reviewers.

Edits made before versions existed left no version. :func:`run_guano_backfill` stores
the detector's prediction from the GUANO files as the oldest version (reason ``guano``),
using the matching in ``prediction_corrections``.
"""

from __future__ import annotations

import datetime
import logging
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Sequence

from sqlalchemy import exists, func, insert, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from sonari import exceptions, models, schemas
from sonari.models import INCLUDE_VERSIONS
from sonari.services import sound_event_history as history
from sonari.services.prediction_corrections import (
    MIN_MATCH_RATE,
    PREDICTED_KEYS,
    REVIEWED_STATES,
    get_prediction_corrections,
)

__all__ = [
    "get_backfill_status",
    "get_prediction_history_stats",
    "run_guano_backfill",
    "start_guano_backfill",
]

logger = logging.getLogger(__name__)

Sea = models.SoundEventAnnotation
SeaTag = models.SoundEventAnnotationTag
SeaFeature = models.SoundEventAnnotationFeature
Backfill = models.PredictionBackfill

#: A Core alias of the table: inside a statement on live events it reaches versions (the
#: ORM filter only targets the mapped entity), and as its own FROM it isn't correlated
#: with the outer query's sound_event_annotation.
_sea_table = Sea.__table__.alias("sea_version")

#: A running backfill without progress for this long is treated as dead.
STALE_AFTER = datetime.timedelta(minutes=10)

#: Tasks per transaction in the backfill.
_BACKFILL_CHUNK = 50

_CHUNK = 1000

SPECIES_KEY = "species"

_BOUNDS_TOLERANCE = 1e-6


def _now() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc)


def _reviewed(project_id: int) -> tuple:
    """Conditions on annotation_task for tasks marked completed or verified."""
    return (
        models.AnnotationTask.annotation_project_id == project_id,
        exists(
            select(1).where(
                models.AnnotationStatusBadge.annotation_task_id == models.AnnotationTask.id,
                models.AnnotationStatusBadge.state.in_(REVIEWED_STATES),
            )
        ),
    )


def _reviewed_task_ids(project_id: int):
    return select(models.AnnotationTask.id).where(*_reviewed(project_id)).scalar_subquery()


def _is_confidence(name_column):
    return or_(*(name_column.startswith(prefix) for prefix in history.CONFIDENCE_PREFIXES))


def _has_confidence():
    return exists(select(1).where(SeaFeature.sound_event_annotation_id == Sea.id, _is_confidence(SeaFeature.name)))


def _has_versions():
    """Whether the live event in the statement has versions."""
    return exists(
        select(_sea_table.c.id).where(
            _sea_table.c.version_of_id == Sea.id,
            _sea_table.c.superseded_on.is_not(None),
        )
    )


def _same_bounds(a: history.Bounds, b: history.Bounds) -> bool:
    return all(
        (x is None and y is None) or (x is not None and y is not None and abs(x - y) <= _BOUNDS_TOLERANCE)
        for x, y in zip(a, b, strict=True)
    )


def _chunks(ids: Sequence[int]):
    for start in range(0, len(ids), _CHUNK):
        yield ids[start : start + _CHUNK]


@dataclass
class _TagOutcomes:
    counts: dict[str, int] = field(default_factory=lambda: defaultdict(int))
    box_changed: int = 0
    relabeled_to: dict[tuple[str, str], int] = field(default_factory=lambda: defaultdict(int))


@dataclass
class _Oldest:
    """The oldest version of an event: its state before the first edit."""

    version_id: int
    event_id: int | None
    bounds: history.Bounds
    reason: str
    tags: set[tuple[str, str]] = field(default_factory=set)
    has_confidence: bool = False

    @property
    def is_prediction(self) -> bool:
        return self.reason == history.GUANO or self.has_confidence


def _status(row: models.PredictionBackfill | None) -> schemas.PredictionBackfillStatus | None:
    if row is None:
        return None
    status = schemas.PredictionBackfillStatus.model_validate(row)
    updated_on = row.updated_on if row.updated_on.tzinfo else row.updated_on.replace(tzinfo=datetime.timezone.utc)
    return status.model_copy(update={"stale": row.state == "running" and _now() - updated_on > STALE_AFTER})


async def get_backfill_status(session: AsyncSession, project_id: int) -> schemas.PredictionBackfillStatus | None:
    return _status(await session.get(Backfill, project_id))


async def _oldest_versions(session: AsyncSession, task_ids) -> list[_Oldest]:
    """Oldest version per event in the tasks; GUANO versions come first."""
    rows = (
        await session.execute(
            select(Sea.id, Sea.version_of_id, Sea.geometry, Sea.version_reason, Sea.superseded_on)
            .where(Sea.annotation_task_id.in_(task_ids), Sea.superseded_on.is_not(None))
            .execution_options(**INCLUDE_VERSIONS)
        )
    ).all()
    oldest: dict[object, tuple] = {}
    for row in rows:
        key = row.version_of_id if row.version_of_id is not None else ("gone", row.id)
        rank = (row.version_reason != history.GUANO, row.superseded_on, row.id)
        if key not in oldest or rank < oldest[key][0]:
            oldest[key] = (rank, row)
    result = {
        row.id: _Oldest(
            version_id=row.id,
            event_id=row.version_of_id,
            bounds=history.geometry_bounds(row.geometry),
            reason=row.version_reason or history.EDITED,
        )
        for _, row in oldest.values()
    }
    ids = list(result)
    for chunk in _chunks(ids):
        for version_id, key, value in await session.execute(
            select(SeaTag.sound_event_annotation_id, models.Tag.key, models.Tag.value)
            .join(models.Tag, models.Tag.id == SeaTag.tag_id)
            .where(SeaTag.sound_event_annotation_id.in_(chunk))
        ):
            result[version_id].tags.add((key, value))
        for (version_id,) in await session.execute(
            select(SeaFeature.sound_event_annotation_id)
            .where(SeaFeature.sound_event_annotation_id.in_(chunk), _is_confidence(SeaFeature.name))
            .distinct()
        ):
            result[version_id].has_confidence = True
    return list(result.values())


async def get_prediction_history_stats(session: AsyncSession, project_id: int) -> schemas.PredictionHistoryStats:
    """Outcomes per predicted tag in the project's completed and verified tasks."""
    reviewed = _reviewed_task_ids(project_id)
    reviewed_tasks = await session.scalar(select(func.count(models.AnnotationTask.id)).where(*_reviewed(project_id)))
    outcomes: dict[tuple[str, str], _TagOutcomes] = defaultdict(_TagOutcomes)
    added_counts: dict[tuple[str, str], int] = defaultdict(int)
    edited_events = 0

    # Live events without versions: untouched, or edited before versions existed. The
    # confidence features name the predicted species ("detection_confidence:<species>") and
    # survive some older edits, so a relabel shows even without a GUANO backfill.
    without_versions = (Sea.annotation_task_id.in_(reviewed), ~_has_versions())
    confidences: dict[int, set[str]] = defaultdict(set)
    for event_id, name in await session.execute(
        select(SeaFeature.sound_event_annotation_id, SeaFeature.name)
        .join(Sea, Sea.id == SeaFeature.sound_event_annotation_id)
        .where(*without_versions, _is_confidence(SeaFeature.name))
    ):
        confidences[event_id].add(name)
    tags_now: dict[int, set[tuple[str, str]]] = defaultdict(set)
    for event_id, key, value in await session.execute(
        select(SeaTag.sound_event_annotation_id, models.Tag.key, models.Tag.value)
        .join(models.Tag, models.Tag.id == SeaTag.tag_id)
        .join(Sea, Sea.id == SeaTag.sound_event_annotation_id)
        .where(*without_versions, _has_confidence())
    ):
        tags_now[event_id].add((key, value))

    for event_id, names in confidences.items():
        tags = tags_now[event_id]
        predicted = {name.split(":", 1)[1] for name in names if ":" in name}
        edited = False
        for key, value in tags:
            # Call types, and every tag of older imports whose bare confidence name doesn't say
            # which species was predicted, can only count as kept.
            if key in PREDICTED_KEYS and (key != SPECIES_KEY or not predicted):
                outcomes[(key, value)].counts["confirmed"] += 1
        for value in predicted:
            entry = outcomes[(SPECIES_KEY, value)]
            if (SPECIES_KEY, value) in tags:
                entry.counts["confirmed"] += 1
                continue
            edited = True
            targets = [(k, v) for k, v in tags if history.pairable(SPECIES_KEY, k) and v not in predicted]
            if targets:
                entry.counts["relabeled"] += 1
                for target in targets:
                    entry.relabeled_to[target] += 1
            else:
                entry.counts["tag_removed"] += 1
        edited_events += edited
    untouched_events = len(confidences)

    # Events with versions: the oldest version against the live event.
    oldest = await _oldest_versions(session, reviewed)
    current = await _current_events(session, [o.event_id for o in oldest if o.event_id is not None])
    predictions = 0
    for version in oldest:
        event = current.get(version.event_id) if version.event_id is not None else None
        if not version.is_prediction:
            # Drawn by a reviewer (or imported without confidence) and edited since.
            if event is not None:
                for key, value in event[1]:
                    if key in PREDICTED_KEYS:
                        added_counts[(key, value)] += 1
            continue
        predictions += 1
        box_changed = event is not None and not _same_bounds(version.bounds, event[0])
        now = event[1] if event is not None else set()
        changed = event is None or box_changed
        for key, value in version.tags:
            if key not in PREDICTED_KEYS:
                continue
            entry = outcomes[(key, value)]
            if event is None:
                entry.counts["event_deleted"] += 1
                continue
            if box_changed:
                entry.box_changed += 1
            if (key, value) in now:
                entry.counts["confirmed"] += 1
                continue
            changed = True
            targets = [(k, v) for k, v in now if history.pairable(key, k)]
            if targets:
                entry.counts["relabeled"] += 1
                for target in targets:
                    entry.relabeled_to[target] += 1
            else:
                entry.counts["tag_removed"] += 1
        edited_events += changed

    # Drawn by reviewers and never edited since.
    for key, value, count in await session.execute(
        select(models.Tag.key, models.Tag.value, func.count(func.distinct(Sea.id)))
        .join(SeaTag, SeaTag.sound_event_annotation_id == Sea.id)
        .join(models.Tag, models.Tag.id == SeaTag.tag_id)
        .where(*without_versions, ~_has_confidence(), models.Tag.key.in_(PREDICTED_KEYS))
        .group_by(models.Tag.key, models.Tag.value)
    ):
        added_counts[(key, value)] += count

    species = [
        schemas.PredictionCorrectionCount(
            key=key,
            value=value,
            predicted=sum(entry.counts.values()),
            confirmed=entry.counts["confirmed"],
            relabeled=entry.counts["relabeled"],
            tag_removed=entry.counts["tag_removed"],
            event_deleted=entry.counts["event_deleted"],
            box_changed=entry.box_changed,
            relabeled_to=[
                schemas.PredictionCorrectionTarget(key=k, value=v, count=c)
                for (k, v), c in sorted(entry.relabeled_to.items(), key=lambda item: (-item[1], item[0]))
            ],
        )
        for (key, value), entry in outcomes.items()
    ]
    species.sort(key=lambda s: (-s.predicted, s.key, s.value))

    return schemas.PredictionHistoryStats(
        reviewed_tasks=reviewed_tasks or 0,
        predicted_events=untouched_events + predictions,
        edited_events=edited_events,
        species=species,
        added=[
            schemas.PredictionCorrectionTarget(key=key, value=value, count=count)
            for (key, value), count in sorted(added_counts.items(), key=lambda item: (-item[1], item[0]))
        ],
        backfill=await get_backfill_status(session, project_id),
    )


async def _current_events(
    session: AsyncSession, event_ids: Sequence[int]
) -> dict[int, tuple[history.Bounds, set[tuple[str, str]]]]:
    """Bounds and (key, value) tags of the live events that still exist."""
    events: dict[int, tuple[history.Bounds, set[tuple[str, str]]]] = {}
    for chunk in _chunks(sorted(set(event_ids))):
        for event_id, geometry in await session.execute(select(Sea.id, Sea.geometry).where(Sea.id.in_(chunk))):
            events[event_id] = (history.geometry_bounds(geometry), set())
        for event_id, key, value in await session.execute(
            select(SeaTag.sound_event_annotation_id, models.Tag.key, models.Tag.value)
            .join(models.Tag, models.Tag.id == SeaTag.tag_id)
            .where(SeaTag.sound_event_annotation_id.in_(chunk))
        ):
            # SQLite doesn't enforce FKs, so a deleted event can leave tag links behind.
            if event_id in events:
                events[event_id][1].add((key, value))
    return events


# ---------------------------------------------------------------------------
# GUANO backfill
# ---------------------------------------------------------------------------


async def start_guano_backfill(session: AsyncSession, project_id: int) -> schemas.PredictionBackfillStatus:
    """Mark a backfill as running; refuses while another one is still making progress."""
    row = await session.get(Backfill, project_id)
    status = _status(row)
    if status is not None and status.state == "running" and not status.stale:
        raise exceptions.DuplicateObjectError("A GUANO backfill is already running for this project.")
    now = _now()
    if row is None:
        row = Backfill(annotation_project_id=project_id, state="running", started_on=now, updated_on=now)
        session.add(row)
    else:
        row.state = "running"
        row.started_on = now
        row.updated_on = now
        row.finished_on = None
        row.error = None
        row.originals_created = 0
    await session.commit()
    return _status(row)  # type: ignore[return-value]


def _prediction_geometry(coords: Sequence[float]):
    from soundevent import BoundingBox, TimeInterval

    # GUANO coordinates come in the geometry's own order: [start, low, end, high].
    if len(coords) == 4:
        return BoundingBox(coordinates=list(coords))
    return TimeInterval(coordinates=[coords[0], coords[1]])


async def _tag_ids(session: AsyncSession, needed: set[tuple[str, str]]) -> dict[tuple[str, str], int]:
    """Ids of the predicted tags; creates tags that no longer exist."""
    tag_ids = {
        (key, value): tag_id
        for tag_id, key, value in await session.execute(
            select(models.Tag.id, models.Tag.key, models.Tag.value).where(models.Tag.key.in_(PREDICTED_KEYS))
        )
    }
    missing = [models.Tag(key=key, value=value, created_by_id=None) for key, value in sorted(needed - set(tag_ids))]
    if missing:
        session.add_all(missing)
        await session.flush()
        tag_ids.update({(tag.key, tag.value): tag.id for tag in missing})
    return tag_ids


async def _backfill(session: AsyncSession, project_id: int, audio_dir: Path) -> None:
    from sonari import api

    row = await session.get(Backfill, project_id)
    project = await api.annotation_projects.get(session, project_id)
    corrections = await get_prediction_corrections(session, project, audio_dir)
    row.reviewed_tasks = corrections.reviewed_tasks
    row.recordings = corrections.recordings
    row.recordings_with_source = corrections.recordings_with_source
    row.match_rate = corrections.match_rate
    row.updated_on = _now()
    await session.commit()

    if corrections.match_rate is not None and corrections.match_rate < MIN_MATCH_RATE:
        raise RuntimeError(
            f"Only {corrections.match_rate:.0%} of the detector's events match a GUANO detection exactly; "
            "the GUANO files probably belong to another run."
        )

    # One group per prediction: its rows (one per predicted key) share the matched event and box.
    predictions: dict[int, dict[tuple, list]] = defaultdict(lambda: defaultdict(list))
    for correction in corrections.rows:
        if correction.outcome == "added" or correction.predicted_coords is None:
            continue
        event_key = correction.sound_event_annotation_id or ("deleted", tuple(correction.predicted_coords))
        predictions[correction.annotation_task_id][event_key].append(correction)

    task_ids = sorted(predictions)
    done_tasks: set[int] = set()
    recording_ids: dict[int, int] = {}
    for chunk in _chunks(task_ids):
        done_tasks.update(
            (
                await session.scalars(
                    select(Sea.annotation_task_id)
                    .where(Sea.annotation_task_id.in_(chunk), Sea.version_reason == history.GUANO)
                    .distinct()
                    .execution_options(**INCLUDE_VERSIONS)
                )
            ).all()
        )
        recording_ids.update(
            dict(
                (
                    await session.execute(
                        select(models.AnnotationTask.id, models.AnnotationTask.recording_id).where(
                            models.AnnotationTask.id.in_(chunk)
                        )
                    )
                ).all()
            )
        )
    # Events edited since versions exist have a real first version; GUANO adds nothing there.
    event_ids = [k for groups in predictions.values() for k in groups if isinstance(k, int)]
    with_versions: set[int] = set()
    for chunk in _chunks(event_ids):
        with_versions.update(
            (
                await session.scalars(
                    select(Sea.version_of_id)
                    .where(Sea.version_of_id.in_(chunk), Sea.superseded_on.is_not(None))
                    .execution_options(**INCLUDE_VERSIONS)
                )
            ).all()
        )
    needed = {
        (r.key, r.predicted_value)
        for groups in predictions.values()
        for rows in groups.values()
        for r in rows
        if r.predicted_value is not None
    }
    tag_ids = await _tag_ids(session, needed)

    pending = [task_id for task_id in task_ids if task_id not in done_tasks]
    for start in range(0, len(pending), _BACKFILL_CHUNK):
        now = _now()
        new_versions: list[tuple[models.SoundEventAnnotation, list]] = []
        for task_id in pending[start : start + _BACKFILL_CHUNK]:
            for event_key, rows in predictions[task_id].items():
                event_id = event_key if isinstance(event_key, int) else None
                if event_id is not None and event_id in with_versions:
                    continue
                if all(r.outcome == "confirmed" and not r.box_changed for r in rows):
                    continue
                geometry = _prediction_geometry(rows[0].predicted_coords)
                version = Sea(
                    annotation_task_id=task_id,
                    recording_id=recording_ids[task_id],
                    geometry_type=geometry.type,
                    geometry=geometry,
                    created_by_id=None,
                    version_of_id=event_id,
                    superseded_on=now,
                    version_reason=history.GUANO,
                )
                new_versions.append((version, rows))
        session.add_all([version for version, _ in new_versions])
        await session.flush()

        tag_rows, feature_rows = [], []
        for version, rows in new_versions:
            seen: set[tuple[str, str]] = set()
            for r in rows:
                if r.predicted_value is None or (r.key, r.predicted_value) in seen:
                    continue
                seen.add((r.key, r.predicted_value))
                tag_rows.append(
                    {
                        "sound_event_annotation_id": version.id,
                        "tag_id": tag_ids[(r.key, r.predicted_value)],
                        "created_by_id": None,
                        "created_on": now,
                    }
                )
                confidence, prefix = (
                    (r.species_confidence, "species_confidence")
                    if r.species_confidence is not None
                    else (r.detection_confidence, "detection_confidence")
                )
                if confidence is not None:
                    feature_rows.append(
                        {
                            "sound_event_annotation_id": version.id,
                            "name": f"{prefix}:{r.predicted_value}",
                            "value": confidence,
                            "created_on": now,
                        }
                    )
        if tag_rows:
            await session.execute(insert(SeaTag), tag_rows)
        if feature_rows:
            await session.execute(insert(SeaFeature), feature_rows)
        row.originals_created += len(new_versions)
        row.updated_on = _now()
        await session.commit()


async def run_guano_backfill(project_id: int, audio_dir: Path) -> None:
    """Store GUANO predictions as the oldest versions of events edited before versions existed.

    Runs as a background task with its own session. Commits every few tasks, so a restart
    loses little; a rerun skips tasks that already have GUANO versions.
    """
    from sonari.system.database import get_async_session

    async with get_async_session() as session:
        try:
            await _backfill(session, project_id, audio_dir)
            row = await session.get(Backfill, project_id)
            row.state = "done"
        except Exception as exc:  # noqa: BLE001
            logger.exception("GUANO backfill failed [project=%s]", project_id)
            await session.rollback()
            row = await session.get(Backfill, project_id)
            if row is None:
                return
            row.state = "failed"
            row.error = str(exc)[:1000]
        row.finished_on = row.updated_on = _now()
        await session.commit()

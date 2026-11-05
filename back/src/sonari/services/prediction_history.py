"""Project stats on corrected predictions, and the GUANO backfill of originals.

The stats read the database only:

- A *prediction* is an imported sound event with a detector confidence. Detectors always
  write one, edits remove it, and the stored original keeps it.
- Untouched predictions in completed or verified tasks count as confirmed.
- Edited predictions are compared with their original from ``sound_event_original``.
- Tags of the other events in those tasks count as added by reviewers.

Edits made before the history existed have no original. :func:`run_guano_backfill`
creates them from the GUANO files, using the matching in ``prediction_corrections``.
"""

from __future__ import annotations

import datetime
import logging
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Sequence

from sqlalchemy import exists, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from sonari import exceptions, models, schemas
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
Original = models.SoundEventOriginal
Backfill = models.PredictionBackfill

#: A running backfill without progress for this long is treated as dead.
STALE_AFTER = datetime.timedelta(minutes=10)

#: Tasks per transaction in the backfill.
_BACKFILL_CHUNK = 50

_CHUNK = 1000

_CONFIDENCE_PREFIXES = ("detection_confidence", "species_confidence")

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


def _has_confidence():
    return exists(
        select(1).where(
            SeaFeature.sound_event_annotation_id == Sea.id,
            or_(*(SeaFeature.name.startswith(prefix) for prefix in _CONFIDENCE_PREFIXES)),
        )
    )


def _has_original():
    return exists(select(1).where(Original.sound_event_annotation_id == Sea.id))


def _is_prediction(original: models.SoundEventOriginal) -> bool:
    return original.source == "guano" or any(tag.confidence is not None for tag in original.tags)


def _same_bounds(a: history.Bounds, b: history.Bounds) -> bool:
    return all(
        (x is None and y is None) or (x is not None and y is not None and abs(x - y) <= _BOUNDS_TOLERANCE)
        for x, y in zip(a, b, strict=True)
    )


@dataclass
class _TagOutcomes:
    counts: dict[str, int] = field(default_factory=lambda: defaultdict(int))
    box_changed: int = 0
    relabeled_to: dict[tuple[str, str], int] = field(default_factory=lambda: defaultdict(int))


def _status(row: models.PredictionBackfill | None) -> schemas.PredictionBackfillStatus | None:
    if row is None:
        return None
    status = schemas.PredictionBackfillStatus.model_validate(row)
    updated_on = row.updated_on if row.updated_on.tzinfo else row.updated_on.replace(tzinfo=datetime.timezone.utc)
    return status.model_copy(update={"stale": row.state == "running" and _now() - updated_on > STALE_AFTER})


async def get_backfill_status(session: AsyncSession, project_id: int) -> schemas.PredictionBackfillStatus | None:
    return _status(await session.get(Backfill, project_id))


async def get_prediction_history_stats(session: AsyncSession, project_id: int) -> schemas.PredictionHistoryStats:
    """Outcomes per predicted tag in the project's completed and verified tasks."""
    reviewed = _reviewed_task_ids(project_id)
    reviewed_tasks = await session.scalar(select(func.count(models.AnnotationTask.id)).where(*_reviewed(project_id)))

    # Predictions without an original: untouched, or edited before the history existed. The
    # confidence features name the predicted species ("detection_confidence:<species>") and
    # survive some older edits, so a relabel shows even without a GUANO backfill.
    without_original = Sea.annotation_task_id.in_(reviewed), ~_has_original(), _has_confidence()
    confidences: dict[int, set[str]] = defaultdict(set)
    for event_id, name in await session.execute(
        select(SeaFeature.sound_event_annotation_id, SeaFeature.name)
        .join(Sea, Sea.id == SeaFeature.sound_event_annotation_id)
        .where(
            Sea.annotation_task_id.in_(reviewed),
            ~_has_original(),
            or_(*(SeaFeature.name.startswith(p) for p in _CONFIDENCE_PREFIXES)),
        )
    ):
        confidences[event_id].add(name)
    tags_now: dict[int, set[tuple[str, str]]] = defaultdict(set)
    for event_id, key, value in await session.execute(
        select(SeaTag.sound_event_annotation_id, models.Tag.key, models.Tag.value)
        .join(models.Tag, models.Tag.id == SeaTag.tag_id)
        .join(Sea, Sea.id == SeaTag.sound_event_annotation_id)
        .where(*without_original)
    ):
        tags_now[event_id].add((key, value))

    outcomes: dict[tuple[str, str], _TagOutcomes] = defaultdict(_TagOutcomes)
    edited_events = 0
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

    originals = [
        original
        for original in (
            await session.scalars(
                select(Original).where(Original.annotation_task_id.in_(reviewed)).options(selectinload(Original.tags))
            )
        ).all()
        if _is_prediction(original)
    ]
    current = await _current_events(
        session, [o.sound_event_annotation_id for o in originals if o.sound_event_annotation_id]
    )
    for original in originals:
        event = current.get(original.sound_event_annotation_id) if original.sound_event_annotation_id else None
        before = (original.start_time, original.end_time, original.low_freq, original.high_freq)
        box_changed = event is not None and not _same_bounds(before, event[0])
        tags_now = event[1] if event is not None else set()
        changed = event is None or box_changed
        for tag in original.tags:
            if tag.tag_key not in PREDICTED_KEYS:
                continue
            entry = outcomes[(tag.tag_key, tag.tag_value)]
            if event is None:
                entry.counts["event_deleted"] += 1
                continue
            if box_changed:
                entry.box_changed += 1
            if (tag.tag_key, tag.tag_value) in tags_now:
                entry.counts["confirmed"] += 1
                continue
            changed = True
            targets = [(k, v) for k, v in tags_now if history.pairable(tag.tag_key, k)]
            if targets:
                entry.counts["relabeled"] += 1
                for target in targets:
                    entry.relabeled_to[target] += 1
            else:
                entry.counts["tag_removed"] += 1
        edited_events += changed

    added = await session.execute(
        select(models.Tag.key, models.Tag.value, func.count(func.distinct(Sea.id)))
        .join(SeaTag, SeaTag.sound_event_annotation_id == Sea.id)
        .join(models.Tag, models.Tag.id == SeaTag.tag_id)
        .where(
            Sea.annotation_task_id.in_(reviewed),
            ~_has_original(),
            ~_has_confidence(),
            models.Tag.key.in_(PREDICTED_KEYS),
        )
        .group_by(models.Tag.key, models.Tag.value)
    )

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
        predicted_events=untouched_events + len(originals),
        edited_events=edited_events,
        species=species,
        added=[
            schemas.PredictionCorrectionTarget(key=key, value=value, count=count)
            for key, value, count in sorted(added.all(), key=lambda row: (-row[2], row[0], row[1]))
        ],
        backfill=await get_backfill_status(session, project_id),
    )


async def _current_events(
    session: AsyncSession, event_ids: Sequence[int]
) -> dict[int, tuple[history.Bounds, set[tuple[str, str]]]]:
    """Bounds and (key, value) tags of the events that still exist."""
    events: dict[int, tuple[history.Bounds, set[tuple[str, str]]]] = {}
    for start in range(0, len(event_ids), _CHUNK):
        chunk = event_ids[start : start + _CHUNK]
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


def _original_from_rows(task_id: int, event_id: int | None, rows: list, tag_ids: dict) -> models.SoundEventOriginal:
    coords = rows[0].predicted_coords
    if len(coords) == 4:
        geometry_type, bounds = "BoundingBox", (coords[0], coords[2], coords[1], coords[3])
    else:
        geometry_type, bounds = "TimeInterval", (coords[0], coords[1], None, None)
    tags = {}
    for row in rows:
        if row.predicted_value is None:
            continue
        confidence = row.species_confidence if row.species_confidence is not None else row.detection_confidence
        tags[(row.key, row.predicted_value)] = models.SoundEventOriginalTag(
            tag_id=tag_ids.get((row.key, row.predicted_value)),
            tag_key=row.key,
            tag_value=row.predicted_value,
            confidence=confidence,
        )
    return models.SoundEventOriginal(
        annotation_task_id=task_id,
        sound_event_annotation_id=event_id,
        created_by_id=None,
        source="guano",
        geometry_type=geometry_type,
        start_time=bounds[0],
        end_time=bounds[1],
        low_freq=bounds[2],
        high_freq=bounds[3],
        tags=list(tags.values()),
    )


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
    done_tasks = (
        set(
            (
                await session.scalars(
                    select(Original.annotation_task_id)
                    .where(Original.annotation_task_id.in_(task_ids), Original.source == "guano")
                    .distinct()
                )
            ).all()
        )
        if task_ids
        else set()
    )
    event_ids = [k for groups in predictions.values() for k in groups if isinstance(k, int)]
    with_original: set[int] = set()
    for start in range(0, len(event_ids), _CHUNK):
        with_original.update(
            (
                await session.scalars(
                    select(Original.sound_event_annotation_id).where(
                        Original.sound_event_annotation_id.in_(event_ids[start : start + _CHUNK])
                    )
                )
            ).all()
        )
    tag_ids = {
        (key, value): tag_id
        for tag_id, key, value in await session.execute(
            select(models.Tag.id, models.Tag.key, models.Tag.value).where(models.Tag.key.in_(PREDICTED_KEYS))
        )
    }

    pending = [task_id for task_id in task_ids if task_id not in done_tasks]
    for start in range(0, len(pending), _BACKFILL_CHUNK):
        for task_id in pending[start : start + _BACKFILL_CHUNK]:
            for event_key, rows in predictions[task_id].items():
                event_id = event_key if isinstance(event_key, int) else None
                if event_id is not None and event_id in with_original:
                    continue
                if all(r.outcome == "confirmed" and not r.box_changed for r in rows):
                    continue
                session.add(_original_from_rows(task_id, event_id, rows, tag_ids))
                row.originals_created += 1
        row.updated_on = _now()
        await session.commit()


async def run_guano_backfill(project_id: int, audio_dir: Path) -> None:
    """Create originals from GUANO files for edits made before the history existed.

    Runs as a background task with its own session. Commits every few tasks, so a restart
    loses little; a rerun skips tasks that already have GUANO originals.
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

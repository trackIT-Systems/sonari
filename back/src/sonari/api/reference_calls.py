"""Reference calls: a few clear, loud calls of a species from different recordings.

Measuring every call of a large project takes long (72,000 calls ~ 17 min), and a few
references are all that is needed. Calls come in passes, so a recording's calls are
similarly loud (on bat data the recording explains ~80% of the variance in level).
:func:`find_reference_calls` therefore searches in two stages:

1. **Probe**: measure one random call in each of a sample of recordings (all of them in
   small projects, a quarter in large ones; previous runs count, and every run probes
   further recordings until all are probed).
2. **Expand**: measure every call in the recordings whose probes came out best.

:func:`get_reference_calls` then picks the best call of each recording, so the references
come from as many recordings as possible. On dev bat data, probing a quarter of the
recordings measured ~2.5% of the calls and found references in the top 1-3%.

Calls are ranked by :data:`REFERENCE_ORDER`: unclipped calls first (a clipped call's level
is unknown), then by how far they stand out from the background in their band (SNR), then
by peak level. SNR does not depend on recorder gain, unlike dBFS, and passes over loud
background noise in the call's band.
"""

import inspect
import math
import random
from collections import defaultdict
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from sonari import models
from sonari.api.call_levels import CallLevelsRun, call_scope, is_measured, measure_and_store
from sonari.core.call_levels import LEVEL_CHANNEL, LEVEL_CLIPPED, LEVEL_PEAK, LEVEL_RMS, LEVEL_SNR, CallLevels

__all__ = [
    "DEFAULT_REFERENCE_CALLS",
    "ReferenceCall",
    "ReferenceSearch",
    "find_reference_calls",
    "get_reference_calls",
    "reference_search_coverage",
]

DEFAULT_REFERENCE_CALLS = 20

#: Projects with up to this many recordings get every recording probed at once.
PROBE_ALL_UP_TO = 400
#: Share of the recordings probed per run in larger projects ...
PROBE_SHARE = 0.25
#: ... but at most this many (~30 s of measuring).
MAX_PROBES_PER_RUN = 2000
#: Recordings measured in full, per reference wanted.
EXPAND_PER_REFERENCE = 2
#: Calls measured at most in an expanded recording (a random selection beyond that).
MAX_CALLS_PER_RECORDING = 60


def _score(clipped: bool, snr: float | None, peak: float) -> tuple:
    """Ranking key of a call, best first when sorted descending; see REFERENCE_ORDER."""
    return (not clipped, snr if snr is not None else -math.inf, peak)


@dataclass
class ReferenceSearch(CallLevelsRun):
    """Outcome of :func:`find_reference_calls`."""

    probed_recordings: int = 0
    expanded_recordings: int = 0


async def _stored_scores(session: AsyncSession, scope) -> dict[int, tuple[int, tuple]]:
    """Recording id and ranking key of every measured call in scope, by event id."""
    sea = models.SoundEventAnnotation
    feature = models.SoundEventAnnotationFeature
    rows = (
        await session.execute(
            select(sea.id, sea.recording_id, feature.name, feature.value)
            .join(feature, feature.sound_event_annotation_id == sea.id)
            .where(scope, is_measured(), feature.name.in_((LEVEL_PEAK, LEVEL_SNR, LEVEL_CLIPPED)))
        )
    ).all()
    values: dict[int, dict] = defaultdict(dict)
    recording: dict[int, int] = {}
    for event_id, recording_id, name, value in rows:
        values[event_id][name] = value
        recording[event_id] = recording_id
    return {
        event_id: (
            recording[event_id],
            _score(bool(v.get(LEVEL_CLIPPED)), v.get(LEVEL_SNR), v.get(LEVEL_PEAK, -math.inf)),
        )
        for event_id, v in values.items()
    }


def probes_per_run(recordings: int) -> int:
    if recordings <= PROBE_ALL_UP_TO:
        return recordings
    return min(MAX_PROBES_PER_RUN, max(PROBE_ALL_UP_TO, math.ceil(PROBE_SHARE * recordings)))


async def find_reference_calls(
    session: AsyncSession,
    *,
    tag_id: int,
    annotation_project_id: int,
    audio_dir: Path,
    count: int = DEFAULT_REFERENCE_CALLS,
    workers: int = 4,
    batch_size: int = 100,
    progress: Callable[[int, int], Awaitable[None] | None] | None = None,
    seed: int | None = None,
) -> ReferenceSearch:
    """Measure enough calls of a tag in a project to pick ``count`` reference calls.

    Reuses stored levels, so a rerun probes recordings not probed before and the
    references can only get better. ``progress`` gets (done, total); the total grows
    once the probes show which recordings to expand.
    """
    rng = random.Random(seed)
    sea = models.SoundEventAnnotation
    scope = call_scope(tag_id=tag_id, annotation_project_id=annotation_project_id)
    events = (
        await session.execute(select(sea.id, sea.recording_id, sea.geometry).where(scope).order_by(sea.id))
    ).all()
    by_recording: dict[int, list] = defaultdict(list)
    for event in events:
        by_recording[event.recording_id].append(event)

    stored = await _stored_scores(session, scope)
    probed = {recording_id for recording_id, _ in stored.values()}
    unprobed = [r for r in by_recording if r not in probed]
    rng.shuffle(unprobed)
    to_probe = unprobed[: probes_per_run(len(by_recording))]
    probes = [rng.choice(by_recording[r]) for r in to_probe]

    search = ReferenceSearch(probed_recordings=len(to_probe))
    expand_estimate = EXPAND_PER_REFERENCE * count * min(MAX_CALLS_PER_RECORDING, 10)
    first = await measure_and_store(
        session,
        probes,
        audio_dir,
        workers=workers,
        batch_size=batch_size,
        progress=progress,
        progress_total=len(probes) + expand_estimate,
    )

    best: dict[int, tuple] = {}
    for recording_id, score in stored.values():
        best[recording_id] = max(best.get(recording_id, score), score)
    probe_recording = {e.id: e.recording_id for e in probes}
    for event_id, levels in first.levels.items():
        recording_id = probe_recording[event_id]
        score = _levels_score(levels)
        best[recording_id] = max(best.get(recording_id, score), score)

    top = sorted(best, key=best.get, reverse=True)[: EXPAND_PER_REFERENCE * count]
    measured_ids = set(stored) | set(first.levels)
    expansion = []
    for recording_id in top:
        remaining = [e for e in by_recording[recording_id] if e.id not in measured_ids]
        rng.shuffle(remaining)
        expansion.extend(remaining[:MAX_CALLS_PER_RECORDING])

    second = await measure_and_store(
        session,
        expansion,
        audio_dir,
        workers=workers,
        batch_size=batch_size,
        progress=progress,
        progress_offset=len(probes),
        progress_total=len(probes) + len(expansion),
    )
    if progress is not None:
        result = progress(len(probes) + len(expansion), len(probes) + len(expansion))
        if inspect.isawaitable(result):
            await result

    search.measured = first.measured + second.measured
    search.failed = first.failed + second.failed
    search.expanded_recordings = len(top)
    return search


def _levels_score(levels: CallLevels) -> tuple:
    return _score(levels.clipped, levels.snr_db, levels.peak_dbfs)


@dataclass(frozen=True)
class ReferenceCall:
    """A reference call with what is needed to show it."""

    sound_event_annotation_id: int
    annotation_task_id: int
    recording_id: int
    recording_path: str
    samplerate: int
    channels: int
    time_expansion: float
    recording_duration: float
    start_time: float
    end_time: float
    low_freq: float
    high_freq: float
    peak_dbfs: float
    rms_dbfs: float | None
    snr_db: float | None
    clipped: bool
    channel: int


async def get_reference_calls(
    session: AsyncSession,
    *,
    tag_id: int,
    annotation_project_id: int,
    limit: int = DEFAULT_REFERENCE_CALLS,
) -> list[ReferenceCall]:
    """The best measured calls of a tag in a project, from as many recordings as possible.

    First the best call of each recording, best recordings first; only when there are
    fewer recordings than ``limit`` do second-best calls of a recording follow, and so on.
    """
    sea = models.SoundEventAnnotation
    feature = models.SoundEventAnnotationFeature
    peak, rms, snr, clipped, channel = (aliased(feature) for _ in range(5))

    def joined(alias, name):
        return and_(alias.sound_event_annotation_id == sea.id, alias.name == name)

    not_clipped = func.coalesce(clipped.value, 0) == 0
    order = (not_clipped.desc(), snr.value.desc().nulls_last(), peak.value.desc(), sea.id)
    ranked = (
        select(
            sea.id,
            sea.annotation_task_id,
            sea.recording_id,
            sea.geometry,
            peak.value.label("peak"),
            rms.value.label("rms"),
            snr.value.label("snr"),
            clipped.value.label("clipped"),
            channel.value.label("channel"),
            not_clipped.label("not_clipped"),
            func.row_number().over(partition_by=sea.recording_id, order_by=order).label("in_recording"),
        )
        .join(peak, joined(peak, LEVEL_PEAK))
        .join(channel, joined(channel, LEVEL_CHANNEL))
        .join(rms, joined(rms, LEVEL_RMS), isouter=True)
        .join(snr, joined(snr, LEVEL_SNR), isouter=True)
        .join(clipped, joined(clipped, LEVEL_CLIPPED), isouter=True)
        .where(call_scope(tag_id=tag_id, annotation_project_id=annotation_project_id))
        .subquery()
    )
    rows = (
        await session.execute(
            select(ranked, models.Recording.path, models.Recording.samplerate, models.Recording.channels,
                   models.Recording.time_expansion, models.Recording.duration)
            .join(models.Recording, models.Recording.id == ranked.c.recording_id)
            .order_by(
                ranked.c.in_recording,
                ranked.c.not_clipped.desc(),
                ranked.c.snr.desc().nulls_last(),
                ranked.c.peak.desc(),
                ranked.c.id,
            )
            .limit(limit)
        )
    ).all()

    calls = []
    for row in rows:
        start_time, low_freq, end_time, high_freq = row.geometry.coordinates
        calls.append(
            ReferenceCall(
                sound_event_annotation_id=row.id,
                annotation_task_id=row.annotation_task_id,
                recording_id=row.recording_id,
                recording_path=str(row.path),
                samplerate=row.samplerate,
                channels=row.channels,
                time_expansion=row.time_expansion,
                recording_duration=row.duration,
                start_time=start_time,
                end_time=end_time,
                low_freq=low_freq,
                high_freq=high_freq,
                peak_dbfs=row.peak,
                rms_dbfs=row.rms,
                snr_db=row.snr,
                clipped=bool(row.clipped),
                channel=int(row.channel),
            )
        )
    return calls


async def reference_search_coverage(
    session: AsyncSession, *, tag_id: int, annotation_project_id: int
) -> tuple[int, int]:
    """How many recordings hold calls of the tag, and in how many some call is measured."""
    sea = models.SoundEventAnnotation
    scope = call_scope(tag_id=tag_id, annotation_project_id=annotation_project_id)
    recordings, probed = (
        await session.execute(
            select(
                func.count(sea.recording_id.distinct()),
                func.count(sea.recording_id.distinct()).filter(is_measured()),
            ).where(scope)
        )
    ).one()
    return recordings, probed

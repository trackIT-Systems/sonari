"""Received level of sound events drawn as bounding boxes.

The level of a call is measured from the raw audio inside its box: the samples between
the box's start and end time, band-pass filtered to its low and high frequency. Levels
are in dB relative to full scale (dBFS) and depend on distance, recorder gain and
microphone, so they rank calls within comparable recordings (one dataset, one recorder).
The signal-to-noise ratio compares the box with the same band just before and after it
and is less sensitive to gain.

Levels are stored as features of the sound event (``CALL_LEVEL_FEATURE_NAMES``), so each
call is measured once; :mod:`sonari.api.reference_calls` decides which calls to measure.
Editing an event's geometry deletes its levels (see ``SoundEventAnnotationAPI.update_geometry``).
"""

import asyncio
import dataclasses
import inspect
import logging
from collections.abc import Awaitable, Callable, Sequence
from dataclasses import dataclass
from pathlib import Path

from soundevent import Geometry
from soundevent.arrays import Dimensions, get_dim_step
from sqlalchemy import and_, delete, exists, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from sonari import models, schemas
from sonari.api.audio import load_audio
from sonari.core.call_levels import (
    BOUNDING_BOX,
    CALL_LEVEL_FEATURE_NAMES,
    LEVEL_CHANNEL,
    LEVEL_CLIPPED,
    LEVEL_PEAK,
    LEVEL_RMS,
    LEVEL_SNR,
    CallLevels,
    measure_box_levels,
)

__all__ = [
    "CALL_LEVEL_FEATURE_NAMES",
    "CallLevels",
    "CallLevelsRun",
    "LEVEL_CHANNEL",
    "LEVEL_CLIPPED",
    "LEVEL_PEAK",
    "LEVEL_RMS",
    "LEVEL_SNR",
    "call_level_coverage",
    "call_scope",
    "is_measured",
    "measure_and_store",
    "measure_box_levels",
    "measure_sound_event_levels",
]

logger = logging.getLogger(__name__)



def measure_sound_event_levels(
    recording: schemas.Recording,
    geometry: Geometry,
    audio_dir: Path,
    *,
    channel: int | None = None,
    padding: float = 0.1,
    frame_duration: float = 0.005,
) -> CallLevels:
    """Load the audio around a bounding box and measure the levels of its call.

    The audio is loaded as the spectrogram loads it (time expansion included) but
    without resampling or filtering, so box times and frequencies match what is shown.
    ``padding`` seconds on each side keep the filter's edge effects out of the box and
    give the noise for the SNR. Filtering dominates the cost, so the padding sets the
    speed: on 384 kHz FLAC, 0.1 s takes ~7 ms per call, 0.5 s ~22 ms. 0.1 s still holds
    tens of thousands of noise samples at ultrasonic rates and a few thousand at 48 kHz.

    With ``channel`` None, every channel of a multichannel file is measured and the one
    where the call stands out most (highest SNR) is kept: some recorders put the
    ultrasonic microphone on the second channel and leave the first one near silent.
    """
    if geometry.type != BOUNDING_BOX:
        raise ValueError(f"Levels need a BoundingBox, not {geometry.type}")

    box_start, low_freq, box_end, high_freq = geometry.coordinates
    box_start, box_end = sorted((box_start, box_end))
    start = max(0.0, box_start - padding)
    end = min(recording.duration, box_end + padding)

    wav = load_audio(
        recording,
        start,
        end,
        audio_dir=audio_dir,
        audio_parameters=schemas.AudioParameters(),
    )
    channel_dim = Dimensions.channel.value
    if channel_dim not in wav.dims:
        wav = wav.expand_dims({channel_dim: [0]})
    available = wav.sizes[channel_dim]
    channels = range(available) if channel is None else [min(channel, available - 1)]

    samplerate = 1 / get_dim_step(wav, Dimensions.time.value)
    start_time = float(wav[Dimensions.time.value][0])
    measured = [
        dataclasses.replace(
            measure_box_levels(
                wav.isel({channel_dim: c}).values,
                samplerate,
                start_time,
                (box_start, low_freq, box_end, high_freq),
                frame_duration=frame_duration,
            ),
            channel=c,
        )
        for c in channels
    ]
    return max(measured, key=CallLevels.clarity)


@dataclass
class CallLevelsRun:
    """Outcome of :func:`measure_and_store`."""

    measured: int = 0
    failed: int = 0
    levels: dict[int, CallLevels] = dataclasses.field(default_factory=dict, repr=False)
    """Levels measured in this run, by sound event id."""


def call_scope(*, tag_id: int, annotation_project_id: int):
    """Live BoundingBox events carrying a tag in an annotation project."""
    sea = models.SoundEventAnnotation
    return and_(
        sea.superseded_on.is_(None),
        sea.geometry_type == BOUNDING_BOX,
        exists().where(
            models.AnnotationTask.id == sea.annotation_task_id,
            models.AnnotationTask.annotation_project_id == annotation_project_id,
        ),
        exists().where(
            models.SoundEventAnnotationTag.sound_event_annotation_id == sea.id,
            models.SoundEventAnnotationTag.tag_id == tag_id,
        ),
    )


def is_measured():
    """The event has current levels; older ones, without a channel, are measured again."""
    sea = models.SoundEventAnnotation
    # An alias, so it stays a subquery in queries that select features themselves.
    channel = aliased(models.SoundEventAnnotationFeature)
    return exists().where(
        channel.sound_event_annotation_id == sea.id,
        channel.name == LEVEL_CHANNEL,
    )


async def call_level_coverage(session: AsyncSession, *, tag_id: int, annotation_project_id: int) -> tuple[int, int]:
    """How many calls with the tag there are in a project, and how many of them have levels."""
    sea = models.SoundEventAnnotation
    scope = call_scope(tag_id=tag_id, annotation_project_id=annotation_project_id)
    calls, measured = (
        await session.execute(
            select(func.count(), func.count().filter(is_measured())).select_from(sea).where(scope)
        )
    ).one()
    return calls, measured


async def measure_and_store(
    session: AsyncSession,
    events: Sequence,
    audio_dir: Path,
    *,
    channel: int | None = None,
    workers: int = 4,
    batch_size: int = 200,
    progress: Callable[[int, int], Awaitable[None] | None] | None = None,
    progress_offset: int = 0,
    progress_total: int | None = None,
) -> CallLevelsRun:
    """Measure events (rows with ``id``, ``recording_id`` and ``geometry``) and store their levels.

    Commits after every batch and then calls ``progress(progress_offset + done,
    progress_total or len(events))``. Events whose audio fails to load are logged and
    left without levels.
    """
    run = CallLevelsRun()
    if not events:
        return run

    recording_ids = {e.recording_id for e in events}
    recordings = {
        r.id: schemas.Recording.model_validate(r)
        for r in await session.scalars(select(models.Recording).where(models.Recording.id.in_(recording_ids)))
    }

    semaphore = asyncio.Semaphore(max(1, workers))

    async def measure(event) -> tuple[int, CallLevels | None]:
        async with semaphore:
            try:
                levels = await asyncio.to_thread(
                    measure_sound_event_levels,
                    recordings[event.recording_id],
                    event.geometry,
                    audio_dir,
                    channel=channel,
                )
            except Exception:
                logger.exception("Could not measure sound event %s", event.id)
                return event.id, None
            return event.id, levels

    for offset in range(0, len(events), batch_size):
        batch = events[offset : offset + batch_size]
        results = await asyncio.gather(*(measure(e) for e in batch))
        measured = {event_id: levels for event_id, levels in results if levels is not None}
        run.failed += len(results) - len(measured)
        run.measured += len(measured)
        run.levels.update(measured)

        if measured:
            feature = models.SoundEventAnnotationFeature
            await session.execute(
                delete(feature).where(
                    feature.sound_event_annotation_id.in_(measured),
                    feature.name.in_(CALL_LEVEL_FEATURE_NAMES),
                )
            )
            session.add_all(
                feature(sound_event_annotation_id=event_id, name=name, value=value)
                for event_id, levels in measured.items()
                for name, value in levels.as_features().items()
            )
            await session.commit()

        if progress is not None:
            result = progress(progress_offset + offset + len(batch), progress_total or len(events))
            if inspect.isawaitable(result):
                await result

    return run

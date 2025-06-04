import datetime
from enum import Enum

from soundevent.io.aoef import (
    AnnotationSetObject,
    RecordingSetObject,
)
from sqlalchemy import insert, select
from sqlalchemy.ext.asyncio import AsyncSession

from sonari import models


class GeometricFeature(str, Enum):
    DURATION = "duration"
    LOW_FREQ = "low_freq"
    HIGH_FREQ = "high_freq"
    BANDWIDTH = "bandwidth"
    NUM_SEGMENTS = "num_segments"


async def get_feature_names(
    session: AsyncSession,
    obj: (AnnotationSetObject | RecordingSetObject),
) -> dict[str, int]:
    names: set[str] = set(feat.value for feat in GeometricFeature)

    recordings = obj.recordings or []
    for recording in recordings:
        if not recording.features:
            continue

        for name in recording.features:
            names.add(name)

    if isinstance(obj, AnnotationSetObject):
        clips = obj.clips or []
        for clip in clips:
            if not clip.features:
                continue

            for name in clip.features:
                names.add(name)

        sound_events = obj.sound_events or []
        for sound_event in sound_events:
            if not sound_event.features:
                continue

            for name in sound_event.features:
                names.add(name)

    return await import_feature_names(session, list(names))


async def import_feature_names(
    session: AsyncSession,
    names: list[str],
) -> dict[str, int]:
    """Import a set of recordings in AOEF format into the database."""
    if not names:
        return {}

    # get existing feature names
    stmt = select(models.FeatureName.id, models.FeatureName.name).where(models.FeatureName.name.in_(names))
    result = await session.execute(stmt)
    mapping = {r[1]: r[0] for r in result.all()}

    # create missing feature names
    missing = [name for name in names if name not in mapping]
    if not missing:
        return mapping

    values = [{"name": name, "created_on": datetime.datetime.now()} for name in missing]
    stmt = insert(models.FeatureName).values(values)
    await session.execute(stmt)

    # get new feature names
    stmt = select(models.FeatureName.id, models.FeatureName.name).where(models.FeatureName.name.in_(missing))
    result = await session.execute(stmt)
    mapping.update({r[1]: r[0] for r in result.all()})

    return mapping

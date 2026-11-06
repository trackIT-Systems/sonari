"""Keep the old states of edited sound events as versions.

Before a user edit changes or deletes sound events, the routes call :func:`capture`,
then :func:`save` for the events that actually changed, in the same transaction:

- The live row, its tag links and its features are copied into a new row of
  ``sound_event_annotation`` with ``superseded_on`` set (a *version*). The live event
  keeps its id.
- The live row's ``edit_id`` becomes the current edit session (``X-Sonari-Edit-Id``: one
  sound event edit mode in the annotate view, or one bulk request). Events already
  produced by this session are skipped by :func:`capture`, so each session leaves one
  version per event: its state before the session.
- Deletes copy the event with reason ``deleted`` first (:func:`record_deleted`).

Versions are hidden from ORM queries (:mod:`sonari.models.sound_event_versions`); this
module opts in with ``INCLUDE_VERSIONS`` where it reads or writes them.
"""

from __future__ import annotations

import datetime
import uuid
from dataclasses import dataclass, field
from typing import Iterable, Sequence
from uuid import UUID

from soundevent import Geometry
from sqlalchemy import Select, delete, insert, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from sonari import models, schemas
from sonari.models import INCLUDE_VERSIONS
from sonari.utils.bat_groups import GROUP_TAG_KEY, SPECIES_TAG_KEY

__all__ = [
    "EditContext",
    "PendingVersion",
    "capture",
    "confidence_for",
    "delete_task_versions",
    "geometry_bounds",
    "get_task_history",
    "mark_produced",
    "pairable",
    "record_deleted",
    "save",
]

Sea = models.SoundEventAnnotation
SeaTag = models.SoundEventAnnotationTag
SeaFeature = models.SoundEventAnnotationFeature

EDITED = "edited"
DELETED = "deleted"
GUANO = "guano"

# Confidence features as ecohub writes them: "<prefix>:<tag value>", or the bare prefix
# in older single-species imports.
CONFIDENCE_PREFIXES = ("species_confidence", "detection_confidence")

_CHUNK = 1000

# Replacing species tags with their group is a relabel, so these keys pair with each other.
_LABEL_KEYS = frozenset({SPECIES_TAG_KEY, GROUP_TAG_KEY})


def pairable(old_key: str | None, new_key: str | None) -> bool:
    """Whether removing a tag with ``old_key`` and adding one with ``new_key`` is a replacement."""
    return old_key == new_key or (old_key in _LABEL_KEYS and new_key in _LABEL_KEYS)


def confidence_for(features: dict[str, float], tag_value: str) -> float | None:
    """Return the detector confidence of a tag, from an event's features."""
    for name in [f"{prefix}:{tag_value}" for prefix in CONFIDENCE_PREFIXES] + list(CONFIDENCE_PREFIXES):
        if name in features:
            return features[name]
    return None


@dataclass(frozen=True)
class EditContext:
    """Who edits, and which edit session the change belongs to."""

    user_id: UUID | None
    edit_id: UUID = field(default_factory=uuid.uuid4)


Bounds = tuple[float, float, float | None, float | None]


def _now() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc)


def geometry_bounds(geometry: Geometry) -> Bounds:
    """Start time, end time, low and high frequency; no frequencies for time-only geometries."""
    coordinates = getattr(geometry, "coordinates", None)
    if geometry.type == "BoundingBox":
        start, low, end, high = coordinates
        return float(start), float(end), float(low), float(high)
    if geometry.type == "TimeInterval":
        start, end = coordinates
        return float(start), float(end), None, None
    if geometry.type == "TimeStamp":
        return float(coordinates), float(coordinates), None, None

    # Points, lines and polygons: min/max over their (time, frequency) pairs. Avoids
    # soundevent's compute_bounds, which needs shapely.
    points = list(_points(coordinates))
    times = [t for t, _ in points]
    freqs = [f for _, f in points]
    return min(times), max(times), min(freqs), max(freqs)


def _points(coordinates) -> Iterable[tuple[float, float]]:
    if len(coordinates) == 2 and all(isinstance(c, (int, float)) for c in coordinates):
        yield float(coordinates[0]), float(coordinates[1])
        return
    for item in coordinates:
        yield from _points(item)


@dataclass
class PendingVersion:
    """A live event's state before an edit; becomes a version if the edit changes it."""

    event_id: int
    annotation_task_id: int
    recording_id: int
    geometry_type: str
    geometry: Geometry
    created_by_id: UUID | None
    created_on: datetime.datetime
    edit_id: UUID | None
    tags: list[tuple[int, UUID | None, datetime.datetime]] = field(default_factory=list)
    features: list[tuple[str, float, datetime.datetime]] = field(default_factory=list)


def _chunks(ids: Sequence[int]) -> Iterable[Sequence[int]]:
    for start in range(0, len(ids), _CHUNK):
        yield ids[start : start + _CHUNK]


async def capture(session: AsyncSession, event_ids: Iterable[int], ctx: EditContext) -> dict[int, PendingVersion]:
    """Read the current state of live events, before changing them.

    Events this edit session produced already (created, or edited before) are skipped:
    their state before the session is saved already, or they didn't exist.
    """
    ids = sorted(set(event_ids))
    pending: dict[int, PendingVersion] = {}
    for chunk in _chunks(ids):
        rows = (
            await session.execute(
                select(
                    Sea.id,
                    Sea.annotation_task_id,
                    Sea.recording_id,
                    Sea.geometry_type,
                    Sea.geometry,
                    Sea.created_by_id,
                    Sea.created_on,
                    Sea.edit_id,
                ).where(Sea.id.in_(chunk))
            )
        ).all()
        for row in rows:
            if row.edit_id is not None and row.edit_id == ctx.edit_id:
                continue
            pending[row.id] = PendingVersion(
                event_id=row.id,
                annotation_task_id=row.annotation_task_id,
                recording_id=row.recording_id,
                geometry_type=row.geometry_type,
                geometry=row.geometry,
                created_by_id=row.created_by_id,
                created_on=row.created_on,
                edit_id=row.edit_id,
            )
        candidates = [row.id for row in rows if row.id in pending]
        if not candidates:
            continue
        for event_id, tag_id, created_by_id, created_on in await session.execute(
            select(SeaTag.sound_event_annotation_id, SeaTag.tag_id, SeaTag.created_by_id, SeaTag.created_on)
            .where(SeaTag.sound_event_annotation_id.in_(candidates))
            .order_by(SeaTag.id)
        ):
            pending[event_id].tags.append((tag_id, created_by_id, created_on))
        for event_id, name, value, created_on in await session.execute(
            select(
                SeaFeature.sound_event_annotation_id, SeaFeature.name, SeaFeature.value, SeaFeature.created_on
            ).where(SeaFeature.sound_event_annotation_id.in_(candidates))
        ):
            pending[event_id].features.append((name, value, created_on))
    return pending


async def save(
    session: AsyncSession,
    pending: dict[int, PendingVersion],
    ctx: EditContext,
    changed_event_ids: Iterable[int] | None = None,
    reason: str = EDITED,
) -> None:
    """Store captured states as versions, only for events that changed.

    The live events are then marked as produced by this session.
    """
    changed = sorted(set(pending) if changed_event_ids is None else set(changed_event_ids) & set(pending))
    if not changed:
        return
    now = _now()
    versions = {
        event_id: Sea(
            annotation_task_id=pending[event_id].annotation_task_id,
            recording_id=pending[event_id].recording_id,
            geometry_type=pending[event_id].geometry_type,
            geometry=pending[event_id].geometry,
            created_by_id=pending[event_id].created_by_id,
            created_on=pending[event_id].created_on,
            edit_id=pending[event_id].edit_id,
            version_of_id=event_id,
            superseded_on=now,
            superseded_by_id=ctx.user_id,
            superseded_edit_id=ctx.edit_id,
            version_reason=reason,
        )
        for event_id in changed
    }
    session.add_all(versions.values())
    await session.flush()

    tag_rows = [
        {
            "sound_event_annotation_id": version.id,
            "tag_id": tag_id,
            "created_by_id": created_by_id,
            "created_on": created_on,
        }
        for event_id, version in versions.items()
        for tag_id, created_by_id, created_on in pending[event_id].tags
    ]
    if tag_rows:
        await session.execute(insert(SeaTag), tag_rows)
    feature_rows = [
        {"sound_event_annotation_id": version.id, "name": name, "value": value, "created_on": created_on}
        for event_id, version in versions.items()
        for name, value, created_on in pending[event_id].features
    ]
    if feature_rows:
        await session.execute(insert(SeaFeature), feature_rows)
    await mark_produced(session, changed, ctx)


async def mark_produced(session: AsyncSession, event_ids: Iterable[int], ctx: EditContext) -> None:
    """Mark live events as produced by this edit session (also used for new events)."""
    ids = sorted(set(event_ids))
    for chunk in _chunks(ids):
        await session.execute(
            update(Sea)
            .where(Sea.id.in_(chunk))
            .values(edit_id=ctx.edit_id)
            .execution_options(synchronize_session=False)
        )
    await session.flush()


async def record_deleted(session: AsyncSession, event_ids: Iterable[int], ctx: EditContext) -> None:
    """Keep the last state of events about to be deleted; call before deleting them.

    An event this session already edited has its pre-session version: that one is
    marked as the last state. An event created in this session leaves nothing.
    """
    ids = sorted(set(event_ids))
    if not ids:
        return
    await save(session, await capture(session, ids, ctx), ctx, reason=DELETED)
    for chunk in _chunks(ids):
        await session.execute(
            update(Sea)
            .where(Sea.version_of_id.in_(chunk), Sea.superseded_edit_id == ctx.edit_id)
            .values(version_reason=DELETED)
            .execution_options(synchronize_session=False, **INCLUDE_VERSIONS)
        )


async def delete_task_versions(session: AsyncSession, task_ids: Sequence[int] | Select) -> None:
    """Delete the versions of tasks (guided tour reset)."""
    version_ids = (
        select(Sea.id)
        .where(Sea.annotation_task_id.in_(task_ids), Sea.superseded_on.is_not(None))
        .execution_options(**INCLUDE_VERSIONS)
    )
    ids = list((await session.scalars(version_ids)).all())
    for chunk in _chunks(ids):
        await session.execute(delete(SeaTag).where(SeaTag.sound_event_annotation_id.in_(chunk)))
        await session.execute(delete(SeaFeature).where(SeaFeature.sound_event_annotation_id.in_(chunk)))
        await session.execute(
            delete(Sea).where(Sea.id.in_(chunk)).execution_options(synchronize_session=False, **INCLUDE_VERSIONS)
        )


async def get_task_history(session: AsyncSession, annotation_task_id: int) -> schemas.SoundEventTaskHistory:
    """Return the versions of one task's sound events, and when its live events were produced."""
    versions = (
        await session.scalars(
            select(Sea)
            .where(Sea.annotation_task_id == annotation_task_id, Sea.superseded_on.is_not(None))
            .options(selectinload(Sea.tags), selectinload(Sea.features))
            .order_by(Sea.superseded_on, Sea.id)
            .execution_options(**INCLUDE_VERSIONS)
        )
    ).all()
    live = (
        await session.execute(
            select(Sea.id, Sea.edit_id, Sea.created_on, Sea.created_by_id).where(
                Sea.annotation_task_id == annotation_task_id
            )
        )
    ).all()

    user_ids = {v.created_by_id for v in versions} | {v.superseded_by_id for v in versions}
    user_ids |= {row.created_by_id for row in live}
    user_ids.discard(None)
    usernames = (
        dict(
            (
                await session.execute(select(models.User.id, models.User.username).where(models.User.id.in_(user_ids)))
            ).all()
        )
        if user_ids
        else {}
    )

    def version_schema(version: models.SoundEventAnnotation) -> schemas.SoundEventVersion:
        features = {f.name: f.value for f in version.features}
        return schemas.SoundEventVersion(
            id=version.id,
            version_of_id=version.version_of_id,
            annotation_task_id=version.annotation_task_id,
            geometry_type=version.geometry_type,
            geometry=version.geometry,
            tags=[
                schemas.SoundEventVersionTag(
                    key=tag.key, value=tag.value, confidence=confidence_for(features, tag.value)
                )
                for tag in sorted(version.tags, key=lambda t: (t.key, t.value))
            ],
            created_by_id=version.created_by_id,
            created_by_username=usernames.get(version.created_by_id),
            created_on=version.created_on,
            edit_id=version.edit_id,
            superseded_on=version.superseded_on,
            superseded_by_id=version.superseded_by_id,
            superseded_by_username=usernames.get(version.superseded_by_id),
            superseded_edit_id=version.superseded_edit_id,
            version_reason=version.version_reason or EDITED,
        )

    return schemas.SoundEventTaskHistory(
        annotation_task_id=annotation_task_id,
        versions=[version_schema(v) for v in versions],
        live=[
            schemas.SoundEventLiveState(
                id=row.id,
                edit_id=row.edit_id,
                created_on=row.created_on,
                created_by_username=usernames.get(row.created_by_id),
            )
            for row in live
        ],
    )

"""Record the original state and the user edits of sound events.

The routes that change sound events call this module in the same transaction as the
edit:

1. :func:`capture_originals` before the change, :func:`save_originals` after it.
   Imported events (no ``created`` history row) get their pre-edit state stored once,
   with tags and confidence, because the edit makes the editor the owner and deletes the
   confidence features.
2. One ``record_*`` call per change. Changes with the same edit id (one edit session in
   the annotate view, or one bulk request) are merged per event into their net effect:
   several resizes become one box change, removing A and adding B with the same key
   becomes ``A -> B``, adding and removing the same tag cancels out.
"""

from __future__ import annotations

import datetime
import uuid
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Iterable, Sequence
from uuid import UUID

from soundevent import Geometry
from sqlalchemy import Select, delete, exists, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from sonari import models, schemas
from sonari.utils.bat_groups import GROUP_TAG_KEY, SPECIES_TAG_KEY

__all__ = [
    "EditContext",
    "PendingOriginal",
    "capture_originals",
    "ensure_originals",
    "delete_task_history",
    "get_task_history",
    "geometry_bounds",
    "move_tags",
    "record_bulk_deleted",
    "record_bulk_tag_changes",
    "record_created",
    "record_deleted",
    "record_geometry_changed",
    "record_tag_added",
    "record_tag_removed",
    "save_originals",
]

Change = models.SoundEventChange
Original = models.SoundEventOriginal
OriginalTag = models.SoundEventOriginalTag
Sea = models.SoundEventAnnotation
SeaTag = models.SoundEventAnnotationTag
SeaFeature = models.SoundEventAnnotationFeature

CREATED = "created"
DELETED = "deleted"
GEOMETRY_CHANGED = "geometry_changed"
TAG_ADDED = "tag_added"
TAG_REMOVED = "tag_removed"
TAG_REPLACED = "tag_replaced"

# Confidence features as ecohub writes them: "<prefix>:<tag value>", or the bare prefix
# in older single-species imports.
_CONFIDENCE_PREFIXES = ("species_confidence", "detection_confidence")

_GEOMETRY_FIELDS = ("start_time", "end_time", "low_freq", "high_freq")

# Replacing species tags with their group is a relabel, so these keys pair with each other.
_LABEL_KEYS = frozenset({SPECIES_TAG_KEY, GROUP_TAG_KEY})


def pairable(old_key: str | None, new_key: str | None) -> bool:
    """Whether removing a tag with ``old_key`` and adding one with ``new_key`` is a replacement."""
    return old_key == new_key or (old_key in _LABEL_KEYS and new_key in _LABEL_KEYS)


@dataclass(frozen=True)
class EditContext:
    """Who edits, and which edit session the change belongs to."""

    user_id: UUID | None
    edit_id: UUID = field(default_factory=uuid.uuid4)


@dataclass
class PendingOriginal:
    """An imported event's state before an edit, saved only if the edit changes it."""

    original: models.SoundEventOriginal


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


def _confidence(features: dict[str, float], tag_value: str) -> float | None:
    for name in [f"{prefix}:{tag_value}" for prefix in _CONFIDENCE_PREFIXES] + list(_CONFIDENCE_PREFIXES):
        if name in features:
            return features[name]
    return None


# ---------------------------------------------------------------------------
# Originals
# ---------------------------------------------------------------------------


async def capture_originals(session: AsyncSession, event_ids: Iterable[int]) -> dict[int, PendingOriginal]:
    """Read the current state of imported events that have no original yet.

    Call before changing the events. Events created in Sonari are skipped: their
    ``created`` history row is their original.
    """
    ids = sorted(set(event_ids))
    if not ids:
        return {}

    has_original = exists(select(1).where(Original.sound_event_annotation_id == Sea.id))
    created_in_sonari = exists(
        select(1).where(Change.sound_event_annotation_id == Sea.id, Change.action == CREATED),
    )
    rows = (
        await session.execute(
            select(Sea.id, Sea.annotation_task_id, Sea.created_by_id, Sea.geometry_type, Sea.geometry).where(
                Sea.id.in_(ids),
                ~has_original,
                ~created_in_sonari,
            ),
        )
    ).all()
    if not rows:
        return {}

    candidate_ids = [row.id for row in rows]
    tags: dict[int, list[tuple[int, str, str]]] = defaultdict(list)
    for event_id, tag_id, key, value in (
        await session.execute(
            select(SeaTag.sound_event_annotation_id, models.Tag.id, models.Tag.key, models.Tag.value)
            .join(models.Tag, models.Tag.id == SeaTag.tag_id)
            .where(SeaTag.sound_event_annotation_id.in_(candidate_ids))
            .distinct()
            .order_by(SeaTag.sound_event_annotation_id, models.Tag.key, models.Tag.value),
        )
    ).all():
        tags[event_id].append((tag_id, key, value))

    features: dict[int, dict[str, float]] = defaultdict(dict)
    for event_id, name, value in (
        await session.execute(
            select(SeaFeature.sound_event_annotation_id, SeaFeature.name, SeaFeature.value).where(
                SeaFeature.sound_event_annotation_id.in_(candidate_ids),
                or_(*(SeaFeature.name.startswith(prefix) for prefix in _CONFIDENCE_PREFIXES)),
            ),
        )
    ).all():
        features[event_id][name] = value

    pending: dict[int, PendingOriginal] = {}
    for row in rows:
        start, end, low, high = geometry_bounds(row.geometry)
        original = Original(
            annotation_task_id=row.annotation_task_id,
            sound_event_annotation_id=row.id,
            created_by_id=row.created_by_id,
            source="first_edit",
            geometry_type=row.geometry_type,
            start_time=start,
            end_time=end,
            low_freq=low,
            high_freq=high,
            tags=[
                OriginalTag(
                    tag_id=tag_id,
                    tag_key=key,
                    tag_value=value,
                    confidence=_confidence(features[row.id], value),
                )
                for tag_id, key, value in tags[row.id]
            ],
        )
        pending[row.id] = PendingOriginal(original=original)
    return pending


async def save_originals(
    session: AsyncSession,
    pending: dict[int, PendingOriginal],
    changed_event_ids: Iterable[int] | None = None,
) -> None:
    """Store captured originals, only for the events that actually changed."""
    changed = set(pending) if changed_event_ids is None else set(changed_event_ids) & set(pending)
    if not changed:
        return
    session.add_all([pending[event_id].original for event_id in sorted(changed)])
    await session.flush()


async def ensure_originals(session: AsyncSession, event_ids: Iterable[int]) -> None:
    """Capture and store originals for events that are about to change."""
    await save_originals(session, await capture_originals(session, event_ids))


# ---------------------------------------------------------------------------
# Single edits, merged per edit session
# ---------------------------------------------------------------------------


def _set_geometry(row: models.SoundEventChange, prefix: str, bounds: Bounds | None) -> None:
    values = bounds if bounds is not None else (None, None, None, None)
    for name, value in zip(_GEOMETRY_FIELDS, values, strict=True):
        setattr(row, f"{prefix}_{name}", value)


def _geometry(row: models.SoundEventChange, prefix: str) -> Bounds | None:
    values = tuple(getattr(row, f"{prefix}_{name}") for name in _GEOMETRY_FIELDS)
    return None if values[0] is None else values  # type: ignore[return-value]


def _set_tag(row: models.SoundEventChange, prefix: str, tag: schemas.Tag | None) -> None:
    setattr(row, f"{prefix}_tag_id", tag.id if tag else None)
    setattr(row, f"{prefix}_tag_key", tag.key if tag else None)
    setattr(row, f"{prefix}_tag_value", tag.value if tag else None)


def _copy_tag(row: models.SoundEventChange, source: models.SoundEventChange, prefix: str) -> None:
    for name in ("tag_id", "tag_key", "tag_value"):
        setattr(row, f"{prefix}_{name}", getattr(source, f"{prefix}_{name}"))


async def _session_rows(session: AsyncSession, ctx: EditContext, event_id: int) -> list[models.SoundEventChange]:
    return list(
        (
            await session.scalars(
                select(Change)
                .where(Change.edit_id == ctx.edit_id, Change.sound_event_annotation_id == event_id)
                .order_by(Change.id),
            )
        ).all()
    )


def _new_row(ctx: EditContext, task_id: int, event_id: int, action: str) -> models.SoundEventChange:
    return Change(
        annotation_task_id=task_id,
        sound_event_annotation_id=event_id,
        user_id=ctx.user_id,
        edit_id=ctx.edit_id,
        action=action,
    )


def _touch(row: models.SoundEventChange, ctx: EditContext) -> None:
    row.updated_on = _now()
    row.user_id = ctx.user_id


async def record_created(
    session: AsyncSession,
    ctx: EditContext,
    event: schemas.SoundEventAnnotation,
) -> None:
    """Record a sound event created by a user."""
    row = _new_row(ctx, event.annotation_task_id, event.id, CREATED)
    _set_geometry(row, "new", geometry_bounds(event.geometry))
    session.add(row)
    await session.flush()


async def record_geometry_changed(
    session: AsyncSession,
    ctx: EditContext,
    event: schemas.SoundEventAnnotation,
    new_geometry: Geometry,
) -> None:
    """Record a box change; ``event`` holds the geometry before the change."""
    new = geometry_bounds(new_geometry)
    rows = await _session_rows(session, ctx, event.id)

    created = next((r for r in rows if r.action == CREATED), None)
    if created is not None:
        _set_geometry(created, "new", new)
        _touch(created, ctx)
        await session.flush()
        return

    changed = next((r for r in rows if r.action == GEOMETRY_CHANGED), None)
    if changed is None:
        old = geometry_bounds(event.geometry)
        if old == new:
            return
        changed = _new_row(ctx, event.annotation_task_id, event.id, GEOMETRY_CHANGED)
        _set_geometry(changed, "old", old)
        session.add(changed)
    elif _geometry(changed, "old") == new:
        await session.delete(changed)
        await session.flush()
        return
    else:
        _touch(changed, ctx)
    _set_geometry(changed, "new", new)
    await session.flush()


async def record_tag_added(
    session: AsyncSession,
    ctx: EditContext,
    event: schemas.SoundEventAnnotation,
    tag: schemas.Tag,
) -> None:
    """Record a tag added to a sound event."""
    rows = await _session_rows(session, ctx, event.id)

    removed_same = next((r for r in rows if r.action == TAG_REMOVED and r.old_tag_id == tag.id), None)
    if removed_same is not None:
        # Removed and added back: no net change.
        await session.delete(removed_same)
        await session.flush()
        return

    replaced_from_same = next((r for r in rows if r.action == TAG_REPLACED and r.old_tag_id == tag.id), None)
    if replaced_from_same is not None:
        # A -> X, then A added back: only X was added.
        replaced_from_same.action = TAG_ADDED
        _set_tag(replaced_from_same, "old", None)
        _touch(replaced_from_same, ctx)
        await session.flush()
        return

    unpaired_removal = next(
        (r for r in rows if r.action == TAG_REMOVED and pairable(r.old_tag_key, tag.key)),
        None,
    )
    if unpaired_removal is not None:
        unpaired_removal.action = TAG_REPLACED
        _set_tag(unpaired_removal, "new", tag)
        _touch(unpaired_removal, ctx)
        await session.flush()
        return

    row = _new_row(ctx, event.annotation_task_id, event.id, TAG_ADDED)
    _set_tag(row, "new", tag)
    session.add(row)
    await session.flush()


async def record_tag_removed(
    session: AsyncSession,
    ctx: EditContext,
    event: schemas.SoundEventAnnotation,
    tag: schemas.Tag,
) -> None:
    """Record a tag removed from a sound event."""
    rows = await _session_rows(session, ctx, event.id)

    added_same = next((r for r in rows if r.action == TAG_ADDED and r.new_tag_id == tag.id), None)
    if added_same is not None:
        await session.delete(added_same)
        await session.flush()
        return

    replaced_to_same = next((r for r in rows if r.action == TAG_REPLACED and r.new_tag_id == tag.id), None)
    if replaced_to_same is not None:
        # A -> X, then X removed: only A was removed.
        replaced_to_same.action = TAG_REMOVED
        _set_tag(replaced_to_same, "new", None)
        _touch(replaced_to_same, ctx)
        await session.flush()
        return

    unpaired_addition = next(
        (r for r in rows if r.action == TAG_ADDED and pairable(tag.key, r.new_tag_key)),
        None,
    )
    if unpaired_addition is not None:
        unpaired_addition.action = TAG_REPLACED
        _set_tag(unpaired_addition, "old", tag)
        _touch(unpaired_addition, ctx)
        await session.flush()
        return

    row = _new_row(ctx, event.annotation_task_id, event.id, TAG_REMOVED)
    _set_tag(row, "old", tag)
    session.add(row)
    await session.flush()


async def record_deleted(
    session: AsyncSession,
    ctx: EditContext,
    event: schemas.SoundEventAnnotation,
) -> None:
    """Record a deleted sound event; the session's other changes to it are dropped."""
    rows = await _session_rows(session, ctx, event.id)
    for row in rows:
        await session.delete(row)

    if any(r.action == CREATED for r in rows):
        # Created and deleted in the same session: nothing to keep.
        await session.flush()
        return

    changed = next((r for r in rows if r.action == GEOMETRY_CHANGED), None)
    row = _new_row(ctx, event.annotation_task_id, event.id, DELETED)
    _set_geometry(row, "old", _geometry(changed, "old") if changed else geometry_bounds(event.geometry))
    session.add(row)
    await session.flush()


# ---------------------------------------------------------------------------
# Bulk edits: one edit id per request, rows built set-wise
# ---------------------------------------------------------------------------


async def record_bulk_tag_changes(
    session: AsyncSession,
    ctx: EditContext,
    task_by_event: dict[int, int],
    removed: Iterable[tuple[int, int]],
    added: Iterable[tuple[int, int]],
    replacement_tag_id: int | None = None,
) -> None:
    """Record tag removals and additions from a bulk edit, given (event id, tag id) pairs.

    With ``replacement_tag_id`` (a bulk replace), every removed tag of an event is recorded
    as replaced by that tag, also when the event already had it. Otherwise a removal and an
    addition with pairable keys become one replacement.
    """
    removed_by_event: dict[int, list[int]] = defaultdict(list)
    added_by_event: dict[int, list[int]] = defaultdict(list)
    for event_id, tag_id in removed:
        removed_by_event[event_id].append(tag_id)
    for event_id, tag_id in added:
        added_by_event[event_id].append(tag_id)
    for event_id in set(removed_by_event) & set(added_by_event):
        # Removed and added back in the same edit (replace-all keeping the new tag): no change.
        kept = set(removed_by_event[event_id]) & set(added_by_event[event_id])
        removed_by_event[event_id] = [t for t in removed_by_event[event_id] if t not in kept]
        added_by_event[event_id] = [t for t in added_by_event[event_id] if t not in kept]

    tag_ids = {t for ids in (*removed_by_event.values(), *added_by_event.values()) for t in ids}
    if not tag_ids:
        return
    if replacement_tag_id is not None:
        tag_ids.add(replacement_tag_id)
    tags = {tag.id: tag for tag in (await session.scalars(select(models.Tag).where(models.Tag.id.in_(tag_ids)))).all()}

    rows: list[models.SoundEventChange] = []
    for event_id in sorted(set(removed_by_event) | set(added_by_event)):
        task_id = task_by_event[event_id]
        additions = [tags[t] for t in added_by_event.get(event_id, []) if t in tags]
        replacement = tags.get(replacement_tag_id) if replacement_tag_id is not None else None
        for old_id in removed_by_event.get(event_id, []):
            old = tags.get(old_id)
            if old is None or old_id == replacement_tag_id:
                continue
            if replacement is not None:
                new = replacement
            else:
                new = next((a for a in additions if pairable(old.key, a.key)), None)
            row = _new_row(ctx, task_id, event_id, TAG_REPLACED if new else TAG_REMOVED)
            _set_tag(row, "old", schemas.Tag.model_validate(old))
            if new is not None:
                if new in additions:
                    additions.remove(new)
                _set_tag(row, "new", schemas.Tag.model_validate(new))
            rows.append(row)
        for new in additions:
            row = _new_row(ctx, task_id, event_id, TAG_ADDED)
            _set_tag(row, "new", schemas.Tag.model_validate(new))
            rows.append(row)

    session.add_all(rows)
    await session.flush()


async def record_bulk_deleted(
    session: AsyncSession,
    ctx: EditContext,
    events: Iterable[tuple[int, int, Geometry]],
) -> None:
    """Record deleted events from a bulk edit, given (event id, task id, geometry)."""
    rows = []
    for event_id, task_id, geometry in events:
        row = _new_row(ctx, task_id, event_id, DELETED)
        _set_geometry(row, "old", geometry_bounds(geometry))
        rows.append(row)
    session.add_all(rows)
    await session.flush()


# ---------------------------------------------------------------------------
# Tag merges and reading
# ---------------------------------------------------------------------------


async def move_tags(session: AsyncSession, source_tag_ids: Sequence[int], target_tag_id: int) -> None:
    """Point history rows of merged tags at the surviving tag; key and value text stay."""
    if not source_tag_ids:
        return
    await session.execute(
        update(OriginalTag)
        .where(OriginalTag.tag_id.in_(source_tag_ids))
        .values(tag_id=target_tag_id)
        .execution_options(synchronize_session=False),
    )
    for column in (Change.old_tag_id, Change.new_tag_id):
        await session.execute(
            update(Change)
            .where(column.in_(source_tag_ids))
            .values({column.key: target_tag_id})
            .execution_options(synchronize_session=False),
        )


async def delete_task_history(session: AsyncSession, task_ids: Sequence[int] | Select) -> None:
    """Remove the history of tasks whose events are reset (guided tour)."""
    if isinstance(task_ids, Sequence) and not task_ids:
        return
    original_ids = select(Original.id).where(Original.annotation_task_id.in_(task_ids)).scalar_subquery()
    await session.execute(delete(OriginalTag).where(OriginalTag.original_id.in_(original_ids)))
    await session.execute(delete(Original).where(Original.annotation_task_id.in_(task_ids)))
    await session.execute(delete(Change).where(Change.annotation_task_id.in_(task_ids)))


async def get_task_history(session: AsyncSession, annotation_task_id: int) -> schemas.SoundEventTaskHistory:
    """Originals and the edit history of one task's sound events, oldest change first."""
    from sqlalchemy.orm import selectinload

    originals = (
        await session.scalars(
            select(Original)
            .where(Original.annotation_task_id == annotation_task_id)
            .options(selectinload(Original.tags))
            .order_by(Original.id),
        )
    ).all()
    changes = (
        await session.scalars(
            select(Change)
            .where(Change.annotation_task_id == annotation_task_id)
            .order_by(Change.created_on, Change.id),
        )
    ).all()
    user_ids = {o.created_by_id for o in originals} | {c.user_id for c in changes}
    user_ids.discard(None)
    usernames = (
        dict((await session.execute(select(models.User.id, models.User.username).where(models.User.id.in_(user_ids)))).all())
        if user_ids
        else {}
    )
    return schemas.SoundEventTaskHistory(
        annotation_task_id=annotation_task_id,
        originals=[
            schemas.SoundEventOriginal.model_validate(o).model_copy(
                update={"created_by_username": usernames.get(o.created_by_id)}
            )
            for o in originals
        ],
        changes=[
            schemas.SoundEventChange.model_validate(c).model_copy(update={"username": usernames.get(c.user_id)})
            for c in changes
        ],
    )

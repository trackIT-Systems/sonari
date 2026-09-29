"""Set-based SQL for bulk sound-event tag replace."""

from __future__ import annotations

import datetime
from dataclasses import dataclass
from typing import Sequence
from uuid import UUID

from sqlalchemy import delete, exists, insert, literal, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from sonari import models, schemas
from sonari.api.sound_event_annotations import CONFIDENCE_FEATURE_NAMES, ML_CONFIDENCE_USERNAMES
from sonari.cache import invalidate_cache

__all__ = [
    "BulkSoundEventTagReplaceParams",
    "BulkTagReplaceChunkResult",
    "process_bulk_tag_replace_chunk",
]

Sea = models.SoundEventAnnotation
SeaTag = models.SoundEventAnnotationTag
SeaFeature = models.SoundEventAnnotationFeature
Task = models.AnnotationTask


@dataclass(frozen=True)
class BulkSoundEventTagReplaceParams:
    """Resolved inputs for one bulk tag-replace request."""

    new_tag_id: int | None
    old_tag_id: int | None
    effective_replace_all: bool
    add_only: bool
    add_to_tagged: bool
    user_id: UUID
    retain_confidence: bool


@dataclass
class BulkTagReplaceChunkResult:
    tasks_updated: int
    sound_events_updated: int
    failures: list[schemas.AnnotationTaskBulkFailure]


def _target_seas_select(task_ids: Sequence[int], params: BulkSoundEventTagReplaceParams):
    """SEA ids (and task ids) that match replace / add-only rules."""
    base = (
        select(Sea.id, Sea.annotation_task_id)
        .where(Sea.annotation_task_id.in_(task_ids))
    )
    if params.add_only:
        return base

    if params.effective_replace_all:
        return base.where(
            exists(
                select(1).where(SeaTag.sound_event_annotation_id == Sea.id),
            ),
        )

    if params.old_tag_id is not None:
        return base.where(
            exists(
                select(1).where(
                    SeaTag.sound_event_annotation_id == Sea.id,
                    SeaTag.tag_id == params.old_tag_id,
                ),
            ),
        )

    return base.where(False)


async def _delete_tags(
    session: AsyncSession,
    params: BulkSoundEventTagReplaceParams,
    target_sea_ids,
) -> set[int]:
    if params.add_only or params.add_to_tagged:
        return set()

    stmt = delete(SeaTag).returning(SeaTag.sound_event_annotation_id)

    if params.effective_replace_all:
        stmt = stmt.where(SeaTag.sound_event_annotation_id.in_(target_sea_ids))
    elif params.old_tag_id is not None:
        stmt = stmt.where(
            SeaTag.tag_id == params.old_tag_id,
            SeaTag.sound_event_annotation_id.in_(target_sea_ids),
        )
    else:
        return set()

    result = await session.execute(stmt)
    return {row[0] for row in result.all()}


async def _insert_tags(
    session: AsyncSession,
    params: BulkSoundEventTagReplaceParams,
    target_sea_ids,
) -> set[int]:
    if params.new_tag_id is None:
        return set()

    now = datetime.datetime.now(datetime.timezone.utc)
    already_has_new_tag = exists(
        select(1).where(
            SeaTag.sound_event_annotation_id == Sea.id,
            SeaTag.tag_id == params.new_tag_id,
            SeaTag.created_by_id == params.user_id,
        ),
    )
    source = (
        select(
            Sea.id.label("sound_event_annotation_id"),
            literal(params.new_tag_id).label("tag_id"),
            literal(params.user_id).label("created_by_id"),
            literal(now).label("created_on"),
        )
        .where(Sea.id.in_(target_sea_ids))
        .where(~already_has_new_tag)
    )

    stmt = (
        insert(SeaTag)
        .from_select(
            ["sound_event_annotation_id", "tag_id", "created_by_id", "created_on"],
            source,
        )
        .returning(SeaTag.sound_event_annotation_id)
    )

    result = await session.execute(stmt)
    return {row[0] for row in result.all()}


async def _mark_seas_edited(
    session: AsyncSession,
    changed_sea_ids: set[int],
    params: BulkSoundEventTagReplaceParams,
) -> None:
    if not changed_sea_ids:
        return

    await session.execute(
        update(Sea)
        .where(Sea.id.in_(changed_sea_ids))
        .values(created_by_id=params.user_id),
    )

    if not params.retain_confidence:
        await session.execute(
            delete(SeaFeature).where(
                SeaFeature.sound_event_annotation_id.in_(changed_sea_ids),
                SeaFeature.name.in_(CONFIDENCE_FEATURE_NAMES),
            ),
        )


async def _invalidate_species_counts_for_tasks(
    session: AsyncSession,
    task_ids: Sequence[int],
) -> None:
    if not task_ids:
        return

    result = await session.execute(
        select(Task.annotation_project_id)
        .where(Task.id.in_(task_ids))
        .distinct(),
    )
    for project_id in result.scalars().all():
        if project_id is not None:
            invalidate_cache(f"species_counts:{project_id}")


async def process_bulk_tag_replace_chunk(
    session: AsyncSession,
    task_ids: list[int],
    params: BulkSoundEventTagReplaceParams,
) -> BulkTagReplaceChunkResult:
    """Apply tag replace for one chunk of task ids inside the current transaction."""
    failures: list[schemas.AnnotationTaskBulkFailure] = []

    existing_result = await session.execute(select(Task.id).where(Task.id.in_(task_ids)))
    existing_ids = set(existing_result.scalars().all())
    for task_id in task_ids:
        if task_id not in existing_ids:
            failures.append(
                schemas.AnnotationTaskBulkFailure(
                    annotation_task_id=task_id,
                    message="Annotation task not found.",
                ),
            )

    if not existing_ids:
        return BulkTagReplaceChunkResult(0, 0, failures)

    target_stmt = _target_seas_select(list(existing_ids), params)
    target_result = await session.execute(target_stmt)
    target_rows = target_result.all()
    if not target_rows:
        return BulkTagReplaceChunkResult(0, 0, failures)

    sea_to_task = {row[0]: row[1] for row in target_rows}
    target_sea_ids = select(Sea.id).where(Sea.id.in_(sea_to_task.keys())).scalar_subquery()

    deleted_sea_ids = await _delete_tags(session, params, target_sea_ids)
    inserted_sea_ids = await _insert_tags(session, params, target_sea_ids)
    changed_sea_ids = deleted_sea_ids | inserted_sea_ids

    await _mark_seas_edited(session, changed_sea_ids, params)

    tasks_with_changes = {sea_to_task[sea_id] for sea_id in changed_sea_ids if sea_id in sea_to_task}

    if tasks_with_changes:
        await _invalidate_species_counts_for_tasks(session, list(tasks_with_changes))

    return BulkTagReplaceChunkResult(
        tasks_updated=len(tasks_with_changes),
        sound_events_updated=len(changed_sea_ids),
        failures=failures,
    )


def build_bulk_params(
    *,
    new_tag_id: int | None,
    old_tag_id: int | None,
    effective_replace_all: bool,
    old_tag_provided: bool,
    add_to_tagged: bool,
    user: schemas.SimpleUser,
) -> BulkSoundEventTagReplaceParams:
    """Build params from resolved tag ids and request flags."""
    add_only = (
        not effective_replace_all
        and old_tag_id is None
        and not old_tag_provided
        and not add_to_tagged
    )
    return BulkSoundEventTagReplaceParams(
        new_tag_id=new_tag_id,
        old_tag_id=old_tag_id,
        effective_replace_all=effective_replace_all,
        add_only=add_only,
        add_to_tagged=add_to_tagged,
        user_id=user.id,
        retain_confidence=user.username in ML_CONFIDENCE_USERNAMES,
    )

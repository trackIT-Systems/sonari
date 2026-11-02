"""Tag management: tag groups, tag presets, merging and project tag scopes.

Tags are global across projects. Groups (Bat, Bird, ...) partition tags by
taxon, presets are curated tag lists. A project shows the tags of its
effective group or preset plus all ungrouped (general purpose) tags.
"""

from __future__ import annotations

import datetime
from typing import Literal, Sequence

from sqlalchemy import ColumnElement, delete, exists, func, insert, literal, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from sonari import exceptions, models, schemas
from sonari.api.species_catalog import normalize_name
from sonari.cache import invalidate_cache
from sonari.shared_cache_global import get_shared_cache

__all__ = [
    "assign_group",
    "create_group",
    "create_preset",
    "delete_group",
    "delete_preset",
    "detect_group",
    "get_group",
    "get_preset_model",
    "get_project_tag_scope",
    "get_species_with_several_tags",
    "get_tag_details",
    "get_visible_tag_condition",
    "list_shortcuts",
    "list_groups",
    "list_presets",
    "merge_tags",
    "set_shortcut",
    "update_group",
    "update_preset",
]

Tag = models.Tag
SeaTag = models.SoundEventAnnotationTag
TaskTag = models.AnnotationTaskTag
PresetTag = models.TagPresetTag


def _now() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc)


def _split_keywords(raw: str) -> list[str]:
    return [k.strip() for k in raw.split(",") if k.strip()]


def _join_keywords(keywords: Sequence[str]) -> str:
    return ",".join(k.strip().lower() for k in keywords if k.strip())


def _clear_tag_cache(tags: Sequence[tuple[str, str]]) -> None:
    """Drop tags from the shared TagAPI cache (keyed by (key, value))."""
    cache = get_shared_cache()
    if cache is None:
        return
    for pk in tags:
        cache.pop(("Tag", pk), None)


async def _reset_project_scopes(session: AsyncSession, condition: ColumnElement[bool], **values) -> None:
    """Set projects matching ``condition`` back to auto and evict them from the cache."""
    Project = models.AnnotationProject
    project_ids = (await session.scalars(select(Project.id).where(condition))).all()
    if not project_ids:
        return
    await session.execute(update(Project).where(Project.id.in_(project_ids)).values(tag_scope="auto", **values))
    cache = get_shared_cache()
    if cache is not None:
        for project_id in project_ids:
            cache.pop(("AnnotationProject", project_id), None)


async def _invalidate_all_species_counts(session: AsyncSession) -> None:
    project_ids = (await session.scalars(select(models.AnnotationProject.id))).all()
    for project_id in project_ids:
        invalidate_cache(f"species_counts:{project_id}")


def _usage_columns():
    sea_count = (
        select(func.count()).where(SeaTag.tag_id == Tag.id).correlate(Tag).scalar_subquery()
    )
    task_count = (
        select(func.count()).where(TaskTag.tag_id == Tag.id).correlate(Tag).scalar_subquery()
    )
    return sea_count, task_count


def _detail_select(*, with_usage: bool = True):
    """Select tag columns, its species and usage counts (see :func:`_to_detail`).

    Counting assignments is a query per tag, so callers that do not show the
    counts pass ``with_usage=False`` and get 0.
    """
    sea_count, task_count = _usage_columns() if with_usage else (literal(0), literal(0))
    Species = models.Species
    query = (
        select(
            Tag.id,
            Tag.key,
            Tag.value,
            Tag.group_id,
            Tag.shortcut,
            sea_count.label("sound_event_count"),
            task_count.label("task_count"),
            Species.id.label("species_id"),
            Species.scientific_name,
            Species.name_de,
            Species.group_id.label("species_group_id"),
        )
        .select_from(Tag)
        .outerjoin(Species, Species.id == Tag.species_id)
    )
    return query, sea_count, task_count


def _to_detail(row) -> schemas.TagDetail:
    species = (
        schemas.SpeciesInfo(
            id=row.species_id,
            scientific_name=row.scientific_name,
            name_de=row.name_de,
            group_id=row.species_group_id,
        )
        if row.species_id is not None
        else None
    )
    return schemas.TagDetail(
        id=row.id,
        key=row.key,
        value=row.value,
        group_id=row.group_id,
        shortcut=row.shortcut,
        sound_event_count=row.sound_event_count,
        task_count=row.task_count,
        species=species,
    )


async def _tag_details(
    session: AsyncSession,
    tag_ids: Sequence[int],
    *,
    with_usage: bool = True,
) -> list[schemas.TagDetail]:
    if not tag_ids:
        return []
    query, _, _ = _detail_select(with_usage=with_usage)
    rows = await session.execute(query.where(Tag.id.in_(tag_ids)).order_by(Tag.key, Tag.value))
    return [_to_detail(r) for r in rows]


# ---------------------------------------------------------------------------
# Tags


async def get_tag_details(
    session: AsyncSession,
    *,
    search: str | None = None,
    group: int | Literal["none"] | None = None,
    limit: int = 50,
    offset: int = 0,
    sort_by: str = "key",
) -> tuple[list[schemas.TagDetail], int]:
    """List tags with species and usage counts.

    ``search`` also matches the catalog names of a tag's species, so
    searching "Amsel" finds species:Turdus merula. ``group`` is a group id,
    "none" for tags without a group, or None for all tags.
    ``sort_by`` is one of key, value, usage, -usage.
    """
    query, sea_count, task_count = _detail_select()
    conditions: list[ColumnElement[bool]] = []
    if search:
        pattern = f"%{search}%"
        species_ids = select(models.SpeciesName.species_id).where(
            models.SpeciesName.name.like(f"%{normalize_name(search)}%")
        )
        conditions.append(
            or_(Tag.key.ilike(pattern), Tag.value.ilike(pattern), Tag.species_id.in_(species_ids))
        )
    if group == "none":
        conditions.append(Tag.group_id.is_(None))
    elif group is not None:
        conditions.append(Tag.group_id == group)

    total = await session.scalar(select(func.count()).select_from(Tag).where(*conditions))

    order = {
        "key": [Tag.key, Tag.value],
        "value": [Tag.value, Tag.key],
        "usage": [(sea_count + task_count).asc(), Tag.key, Tag.value],
        "-usage": [(sea_count + task_count).desc(), Tag.key, Tag.value],
    }.get(sort_by, [Tag.key, Tag.value])

    rows = await session.execute(query.where(*conditions).order_by(*order).limit(limit).offset(offset))
    return [_to_detail(r) for r in rows], total or 0


async def get_species_with_several_tags(session: AsyncSession) -> list[schemas.SpeciesTags]:
    """Species named by more than one tag, e.g. species:Amsel and species:Turdus merula.

    These are candidates for merging.
    """
    shared = select(Tag.species_id).where(Tag.species_id.is_not(None)).group_by(Tag.species_id).having(func.count() > 1)
    tag_ids = (await session.scalars(select(Tag.id).where(Tag.species_id.in_(shared)))).all()
    by_species: dict[int, schemas.SpeciesTags] = {}
    for detail in await _tag_details(session, tag_ids):
        species = detail.species
        by_species.setdefault(species.id, schemas.SpeciesTags(species=species, tags=[])).tags.append(detail)
    return sorted(by_species.values(), key=lambda item: item.species.scientific_name)


async def assign_group(
    session: AsyncSession,
    tag_ids: Sequence[int],
    group_id: int | None,
) -> int:
    """Assign tags to a group (None removes the group). Returns rows updated."""
    if group_id is not None:
        await get_group(session, group_id)
    keys = (await session.execute(select(Tag.key, Tag.value).where(Tag.id.in_(tag_ids)))).all()
    result = await session.execute(update(Tag).where(Tag.id.in_(tag_ids)).values(group_id=group_id))
    _clear_tag_cache([(k, v) for k, v in keys])
    return result.rowcount or 0


async def list_shortcuts(session: AsyncSession) -> list[schemas.Tag]:
    """Tags that have a keyboard shortcut, ordered 1-9 then 0."""
    tags = (await session.scalars(select(Tag).where(Tag.shortcut.is_not(None)))).all()
    return sorted(
        (schemas.Tag.model_validate(tag) for tag in tags),
        key=lambda tag: (tag.shortcut == "0", tag.shortcut),
    )


async def set_shortcut(session: AsyncSession, shortcut: str, tag_id: int | None) -> None:
    """Give ``shortcut`` to a tag, taking it from the tag that had it.

    The tag's previous key is freed. ``tag_id=None`` just frees the key.
    """
    if tag_id is not None and await session.get(Tag, tag_id) is None:
        raise exceptions.NotFoundError(f"Tag {tag_id} not found")
    changed = (Tag.shortcut == shortcut) | (Tag.id == tag_id)
    keys = (await session.execute(select(Tag.key, Tag.value).where(changed))).all()
    await session.execute(update(Tag).where(changed).values(shortcut=None))
    if tag_id is not None:
        await session.execute(update(Tag).where(Tag.id == tag_id).values(shortcut=shortcut))
    _clear_tag_cache([(k, v) for k, v in keys])


async def _merge_association(
    session: AsyncSession,
    model: type[SeaTag] | type[TaskTag],
    parent_column: str,
    source_ids: Sequence[int],
    target_id: int,
) -> tuple[int, int]:
    """Repoint one tag association table from source tags to the target.

    Rows that would collide with an existing (parent, target, user) row, or
    with another source row of the same parent and user, are deleted first.
    Returns (rows moved, duplicates removed).
    """
    other = aliased(model)
    parent = getattr(model, parent_column)
    other_parent = getattr(other, parent_column)
    duplicate = exists(
        select(1).where(
            other_parent == parent,
            other.created_by_id.is_not_distinct_from(model.created_by_id),
            or_(
                other.tag_id == target_id,
                (other.tag_id.in_(source_ids)) & (other.id < model.id),
            ),
        )
    )
    removed = await session.execute(
        delete(model).where(model.tag_id.in_(source_ids), duplicate).execution_options(synchronize_session=False)
    )
    moved = await session.execute(
        update(model)
        .where(model.tag_id.in_(source_ids))
        .values(tag_id=target_id)
        .execution_options(synchronize_session=False)
    )
    return moved.rowcount or 0, removed.rowcount or 0


async def merge_tags(
    session: AsyncSession,
    source_tag_ids: Sequence[int],
    target_tag_id: int,
) -> schemas.TagMergeResult:
    """Merge source tags into the target tag and delete the sources.

    All sound event and task tag assignments and preset memberships of the
    source tags are moved to the target tag. If the target has no group,
    species or shortcut, it takes those of the first source tag that has one.
    """
    source_ids = sorted(set(source_tag_ids) - {target_tag_id})
    if not source_ids:
        raise ValueError("Select at least one tag other than the target tag.")

    target = await session.get(Tag, target_tag_id)
    if target is None:
        raise exceptions.NotFoundError(f"Tag {target_tag_id} not found")
    sources = (await session.scalars(select(Tag).where(Tag.id.in_(source_ids)))).all()
    if len(sources) != len(source_ids):
        raise exceptions.NotFoundError("One or more source tags were not found")

    sea_moved, sea_removed = await _merge_association(
        session, SeaTag, "sound_event_annotation_id", source_ids, target_tag_id
    )
    task_moved, task_removed = await _merge_association(
        session, TaskTag, "annotation_task_id", source_ids, target_tag_id
    )

    # Presets that contained a source tag now contain the target tag.
    preset_ids = (
        await session.scalars(
            select(PresetTag.tag_preset_id).where(PresetTag.tag_id.in_(source_ids)).distinct()
        )
    ).all()
    existing = set(
        (
            await session.scalars(select(PresetTag.tag_preset_id).where(PresetTag.tag_id == target_tag_id))
        ).all()
    )
    new_preset_ids = [pid for pid in preset_ids if pid not in existing]
    if new_preset_ids:
        await session.execute(
            insert(PresetTag),
            [{"tag_preset_id": pid, "tag_id": target_tag_id, "created_on": _now()} for pid in new_preset_ids],
        )
    await session.execute(delete(PresetTag).where(PresetTag.tag_id.in_(source_ids)))

    if target.group_id is None:
        target.group_id = next((s.group_id for s in sources if s.group_id is not None), None)
    if target.species_id is None:
        target.species_id = next((s.species_id for s in sources if s.species_id is not None), None)
    shortcut = target.shortcut or next((s.shortcut for s in sources if s.shortcut is not None), None)

    source_keys = [(s.key, s.value) for s in sources]
    await session.execute(delete(Tag).where(Tag.id.in_(source_ids)).execution_options(synchronize_session=False))
    for source in sources:
        session.expunge(source)
    # Set after the sources are gone: shortcut keys are unique.
    target.shortcut = shortcut
    await session.flush()

    _clear_tag_cache([*source_keys, (target.key, target.value)])
    await _invalidate_all_species_counts(session)

    [detail] = await _tag_details(session, [target_tag_id])
    return schemas.TagMergeResult(
        target=detail,
        merged_tags=len(source_ids),
        sound_event_tags_moved=sea_moved,
        task_tags_moved=task_moved,
        duplicates_removed=sea_removed + task_removed,
    )


# ---------------------------------------------------------------------------
# Groups


def _group_schema(group: models.TagGroup, tag_count: int = 0) -> schemas.TagGroup:
    return schemas.TagGroup(
        id=group.id,
        name=group.name,
        project_keywords=_split_keywords(group.project_keywords),
        tag_count=tag_count,
    )


async def list_groups(session: AsyncSession) -> list[schemas.TagGroup]:
    """List all tag groups with the number of tags in each."""
    tag_count = (
        select(func.count()).where(Tag.group_id == models.TagGroup.id).correlate(models.TagGroup).scalar_subquery()
    )
    rows = await session.execute(select(models.TagGroup, tag_count).order_by(models.TagGroup.name))
    return [_group_schema(group, count) for group, count in rows]


async def get_group(session: AsyncSession, group_id: int) -> models.TagGroup:
    group = await session.get(models.TagGroup, group_id)
    if group is None:
        raise exceptions.NotFoundError(f"Tag group {group_id} not found")
    return group


async def _ensure_unique_name(session: AsyncSession, model, name: str, exclude_id: int | None = None) -> None:
    query = select(model.id).where(func.lower(model.name) == name.lower())
    if exclude_id is not None:
        query = query.where(model.id != exclude_id)
    if await session.scalar(query) is not None:
        raise exceptions.DuplicateObjectError(f"'{name}' already exists")


async def create_group(session: AsyncSession, data: schemas.TagGroupCreate) -> schemas.TagGroup:
    name = data.name.strip()
    await _ensure_unique_name(session, models.TagGroup, name)
    group = models.TagGroup(name=name, project_keywords=_join_keywords(data.project_keywords))
    session.add(group)
    await session.flush()
    return _group_schema(group)


async def update_group(session: AsyncSession, group_id: int, data: schemas.TagGroupUpdate) -> schemas.TagGroup:
    group = await get_group(session, group_id)
    if data.name is not None:
        name = data.name.strip()
        await _ensure_unique_name(session, models.TagGroup, name, exclude_id=group_id)
        group.name = name
    if data.project_keywords is not None:
        group.project_keywords = _join_keywords(data.project_keywords)
    await session.flush()
    count = await session.scalar(select(func.count()).where(Tag.group_id == group_id))
    return _group_schema(group, count or 0)


async def delete_group(session: AsyncSession, group_id: int) -> None:
    """Delete a group. Its tags become ungrouped; projects fall back to auto."""
    group = await get_group(session, group_id)
    keys = (await session.execute(select(Tag.key, Tag.value).where(Tag.group_id == group_id))).all()
    await session.execute(update(Tag).where(Tag.group_id == group_id).values(group_id=None))
    await session.execute(update(models.TagPreset).where(models.TagPreset.group_id == group_id).values(group_id=None))
    await _reset_project_scopes(session, models.AnnotationProject.tag_group_id == group_id, tag_group_id=None)
    await session.delete(group)
    await session.flush()
    _clear_tag_cache([(k, v) for k, v in keys])


def detect_group(project_name: str, groups: Sequence[schemas.TagGroup]) -> schemas.TagGroup | None:
    """Find the group whose keyword occurs in the project name.

    Matching is case-insensitive. If several groups match, the one with the
    longest matching keyword wins (e.g. "birdedge" beats "bird").
    """
    name = project_name.lower()
    best: tuple[int, schemas.TagGroup] | None = None
    for group in groups:
        for keyword in group.project_keywords:
            keyword = keyword.lower()
            if keyword and keyword in name and (best is None or len(keyword) > best[0]):
                best = (len(keyword), group)
    return best[1] if best else None


# ---------------------------------------------------------------------------
# Presets


async def _preset_schema(session: AsyncSession, preset: models.TagPreset) -> schemas.TagPreset:
    tag_ids = (await session.scalars(select(PresetTag.tag_id).where(PresetTag.tag_preset_id == preset.id))).all()
    return schemas.TagPreset(
        id=preset.id,
        name=preset.name,
        description=preset.description,
        group_id=preset.group_id,
        created_by_id=preset.created_by_id,
        tags=await _tag_details(session, tag_ids, with_usage=False),
    )


async def get_preset_model(session: AsyncSession, preset_id: int) -> models.TagPreset:
    preset = await session.get(models.TagPreset, preset_id)
    if preset is None:
        raise exceptions.NotFoundError(f"Tag preset {preset_id} not found")
    return preset


async def list_presets(session: AsyncSession) -> list[schemas.TagPreset]:
    presets = (await session.scalars(select(models.TagPreset).order_by(models.TagPreset.name))).all()
    return [await _preset_schema(session, p) for p in presets]


async def _set_preset_tags(session: AsyncSession, preset_id: int, tag_ids: Sequence[int]) -> None:
    tag_ids = sorted(set(tag_ids))
    found = (await session.scalars(select(Tag.id).where(Tag.id.in_(tag_ids)))).all() if tag_ids else []
    if len(found) != len(tag_ids):
        raise exceptions.NotFoundError("One or more tags were not found")
    await session.execute(delete(PresetTag).where(PresetTag.tag_preset_id == preset_id))
    if tag_ids:
        await session.execute(
            insert(PresetTag),
            [{"tag_preset_id": preset_id, "tag_id": tag_id, "created_on": _now()} for tag_id in tag_ids],
        )


async def create_preset(
    session: AsyncSession,
    data: schemas.TagPresetCreate,
    created_by: models.User,
) -> schemas.TagPreset:
    name = data.name.strip()
    await _ensure_unique_name(session, models.TagPreset, name)
    if data.group_id is not None:
        await get_group(session, data.group_id)
    preset = models.TagPreset(
        name=name,
        description=data.description,
        group_id=data.group_id,
        created_by_id=created_by.id,
    )
    session.add(preset)
    await session.flush()
    await _set_preset_tags(session, preset.id, data.tag_ids)
    return await _preset_schema(session, preset)


async def update_preset(
    session: AsyncSession,
    preset_id: int,
    data: schemas.TagPresetUpdate,
) -> schemas.TagPreset:
    preset = await get_preset_model(session, preset_id)
    if data.name is not None:
        name = data.name.strip()
        await _ensure_unique_name(session, models.TagPreset, name, exclude_id=preset_id)
        preset.name = name
    if data.description is not None:
        preset.description = data.description
    if "group_id" in data.model_fields_set:
        if data.group_id is not None:
            await get_group(session, data.group_id)
        preset.group_id = data.group_id
    if data.tag_ids is not None:
        await _set_preset_tags(session, preset_id, data.tag_ids)
    await session.flush()
    return await _preset_schema(session, preset)


async def delete_preset(session: AsyncSession, preset_id: int) -> None:
    """Delete a preset. Projects using it fall back to auto."""
    preset = await get_preset_model(session, preset_id)
    await session.execute(delete(PresetTag).where(PresetTag.tag_preset_id == preset_id))
    await _reset_project_scopes(session, models.AnnotationProject.tag_preset_id == preset_id, tag_preset_id=None)
    await session.delete(preset)
    await session.flush()


# ---------------------------------------------------------------------------
# Project scope


async def get_project_tag_scope(
    session: AsyncSession,
    project: schemas.AnnotationProject,
) -> schemas.ProjectTagScope:
    """Resolve which group/preset an annotation project uses for its tags."""
    scope = project.tag_scope
    if scope == "all":
        return schemas.ProjectTagScope(scope="all")

    groups = await list_groups(session)
    by_id = {g.id: g for g in groups}

    # A project whose preset or group was deleted falls back to auto.
    preset = (
        await session.get(models.TagPreset, project.tag_preset_id)
        if scope == "preset" and project.tag_preset_id is not None
        else None
    )
    if preset is not None:
        return schemas.ProjectTagScope(
            scope="preset",
            preset=await _preset_schema(session, preset),
            group=by_id.get(preset.group_id),
        )

    if scope == "group" and project.tag_group_id in by_id:
        return schemas.ProjectTagScope(scope="group", group=by_id[project.tag_group_id])

    return schemas.ProjectTagScope(scope="auto", group=detect_group(project.name, groups))


def get_visible_tag_condition(scope: schemas.ProjectTagScope) -> ColumnElement[bool] | None:
    """SQL condition for the tags visible under a project tag scope.

    Ungrouped tags are general purpose and always visible. Returns None
    when all tags are visible.
    """
    if scope.preset is not None:
        in_preset = Tag.id.in_(select(PresetTag.tag_id).where(PresetTag.tag_preset_id == scope.preset.id))
        return or_(in_preset, Tag.group_id.is_(None))
    if scope.group is not None:
        return or_(Tag.group_id == scope.group.id, Tag.group_id.is_(None))
    return None

"""REST API routes for tags."""

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException

from sonari import api, schemas
from sonari.filters.tags import TagFilter
from sonari.routes.dependencies import CurrentUser, Session
from sonari.routes.dependencies.auth import create_authenticated_router
from sonari.routes.types import Limit, Offset

__all__ = [
    "get_tags_router",
]


def _require_superuser(user: CurrentUser) -> None:
    if not user.is_superuser:
        raise HTTPException(status_code=403, detail="Only administrators can merge tags.")


def get_tags_router() -> APIRouter:
    tags_router = create_authenticated_router()

    @tags_router.get("/", response_model=schemas.Page[schemas.Tag])
    async def get_tags(
        session: Session,
        filter: Annotated[TagFilter, Depends(TagFilter)],  # type: ignore
        limit: Limit = 100,
        offset: Offset = 0,
        sort_by: str | None = "value",
        annotation_project_id: int | None = None,
    ):
        """Get all tags.

        If ``annotation_project_id`` is given, only the tags visible in that
        project (its tag group or preset, plus ungrouped tags) are returned.
        """
        filters: list = [filter]
        if annotation_project_id is not None:
            project = await api.annotation_projects.get(session, annotation_project_id)
            scope = await api.tag_management.get_project_tag_scope(session, project)
            condition = api.tag_management.get_visible_tag_condition(scope)
            if condition is not None:
                filters.append(condition)

        tags, total = await api.tags.get_many(
            session,
            limit=limit,
            offset=offset,
            filters=filters,
            sort_by=sort_by,
        )
        return schemas.Page(
            items=tags,
            total=total,
            limit=limit,
            offset=offset,
        )

    @tags_router.post("/", response_model=schemas.Tag)
    async def create_tag(
        session: Session,
        data: schemas.TagCreate,
        user: CurrentUser,
        annotation_project_id: int | None = None,
        group_id: int | None = None,
    ):
        """Create a new tag.

        The tag joins ``group_id``, or else the tag group of
        ``annotation_project_id``. A tag that names a catalog species always
        joins the species' group.
        """
        if group_id is not None:
            await api.tag_management.get_group(session, group_id)
        elif annotation_project_id is not None:
            project = await api.annotation_projects.get(session, annotation_project_id)
            scope = await api.tag_management.get_project_tag_scope(session, project)
            group_id = scope.group.id if scope.group is not None else None

        tag = await api.tags.create(
            session,
            key=data.key,
            value=data.value,
            created_by=user,
            group_id=group_id,
        )

        await session.commit()
        return tag

    # ------------------------------------------------------------------
    # Tag management

    @tags_router.get("/manage/", response_model=schemas.Page[schemas.TagDetail])
    async def get_tag_details(
        session: Session,
        search: str | None = None,
        group: int | Literal["none"] | None = None,
        limit: Limit = 50,
        offset: Offset = 0,
        sort_by: str = "key",
    ):
        """List tags with ids, groups, species and usage counts.

        ``group`` is a tag group id, or ``none`` for ungrouped tags.
        """
        items, total = await api.tag_management.get_tag_details(
            session,
            search=search,
            group=group,
            limit=limit,
            offset=offset,
            sort_by=sort_by,
        )
        return schemas.Page(items=items, total=total, limit=limit, offset=offset)

    @tags_router.post("/assign_group/", response_model=int)
    async def assign_tag_group(
        session: Session,
        data: schemas.TagAssignGroup,
    ):
        """Assign tags to a tag group. Returns the number of updated tags."""
        updated = await api.tag_management.assign_group(session, data.tag_ids, data.group_id)
        await session.commit()
        return updated

    @tags_router.get("/shortcuts/", response_model=list[schemas.Tag])
    async def get_tag_shortcuts(session: Session):
        """Tags that have a keyboard shortcut (keys 0-9, shared by all users)."""
        return await api.tag_management.list_shortcuts(session)

    @tags_router.put("/shortcuts/", response_model=list[schemas.Tag])
    async def set_tag_shortcut(session: Session, data: schemas.TagShortcutSet):
        """Give a keyboard key to a tag, or free it with ``tag_id: null``."""
        await api.tag_management.set_shortcut(session, data.shortcut, data.tag_id)
        await session.commit()
        return await api.tag_management.list_shortcuts(session)

    @tags_router.post("/merge/", response_model=schemas.TagMergeResult)
    async def merge_tags(
        session: Session,
        data: schemas.TagMerge,
        user: CurrentUser,
    ):
        """Merge tags into a target tag.

        All annotations using a source tag are moved to the target tag and
        the source tags are deleted. This affects every project.
        """
        _require_superuser(user)
        result = await api.tag_management.merge_tags(session, data.source_tag_ids, data.target_tag_id)
        await session.commit()
        return result

    # ------------------------------------------------------------------
    # Species catalog

    @tags_router.get("/species/duplicates/", response_model=list[schemas.SpeciesTags])
    async def get_species_duplicates(session: Session):
        """Species named by several tags (e.g. in German and Latin), to merge."""
        return await api.tag_management.get_species_with_several_tags(session)

    # ------------------------------------------------------------------
    # Tag groups

    @tags_router.get("/groups/", response_model=list[schemas.TagGroup])
    async def get_tag_groups(session: Session):
        """List tag groups."""
        return await api.tag_management.list_groups(session)

    @tags_router.post("/groups/", response_model=schemas.TagGroup)
    async def create_tag_group(
        session: Session,
        data: schemas.TagGroupCreate,
    ):
        """Create a tag group."""
        group = await api.tag_management.create_group(session, data)
        await session.commit()
        return group

    @tags_router.patch("/groups/detail/", response_model=schemas.TagGroup)
    async def update_tag_group(
        session: Session,
        tag_group_id: int,
        data: schemas.TagGroupUpdate,
    ):
        """Update a tag group."""
        group = await api.tag_management.update_group(session, tag_group_id, data)
        await session.commit()
        return group

    @tags_router.delete("/groups/detail/")
    async def delete_tag_group(
        session: Session,
        tag_group_id: int,
    ):
        """Delete a tag group. Its tags become ungrouped."""
        await api.tag_management.delete_group(session, tag_group_id)
        await session.commit()

    # ------------------------------------------------------------------
    # Tag presets

    @tags_router.get("/presets/", response_model=list[schemas.TagPreset])
    async def get_tag_presets(session: Session):
        """List tag presets."""
        return await api.tag_management.list_presets(session)

    @tags_router.post("/presets/", response_model=schemas.TagPreset)
    async def create_tag_preset(
        session: Session,
        data: schemas.TagPresetCreate,
        user: CurrentUser,
    ):
        """Create a tag preset."""
        preset = await api.tag_management.create_preset(session, data, user)
        await session.commit()
        return preset

    async def _get_editable_preset(session, tag_preset_id: int, user) -> None:
        preset = await api.tag_management.get_preset_model(session, tag_preset_id)
        if not user.is_superuser and preset.created_by_id != user.id:
            raise HTTPException(status_code=403, detail="Only the creator or an administrator can edit this preset.")

    @tags_router.patch("/presets/detail/", response_model=schemas.TagPreset)
    async def update_tag_preset(
        session: Session,
        tag_preset_id: int,
        data: schemas.TagPresetUpdate,
        user: CurrentUser,
    ):
        """Update a tag preset."""
        await _get_editable_preset(session, tag_preset_id, user)
        preset = await api.tag_management.update_preset(session, tag_preset_id, data)
        await session.commit()
        return preset

    @tags_router.delete("/presets/detail/")
    async def delete_tag_preset(
        session: Session,
        tag_preset_id: int,
        user: CurrentUser,
    ):
        """Delete a tag preset."""
        await _get_editable_preset(session, tag_preset_id, user)
        await api.tag_management.delete_preset(session, tag_preset_id)
        await session.commit()

    return tags_router

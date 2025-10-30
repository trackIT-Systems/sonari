"""REST API routes for tags."""

from typing import Annotated

from fastapi import APIRouter, Depends

from sonari import api, schemas
from sonari.filters.recording_tags import RecordingTagFilter
from sonari.filters.tags import TagFilter
from sonari.routes.dependencies import Session, SonariSettings, get_current_user_dependency
from sonari.routes.types import Limit, Offset

__all__ = [
    "get_tags_router",
]


def get_tags_router(settings: SonariSettings) -> APIRouter:
    active_user = get_current_user_dependency(settings)
    tags_router = APIRouter()

    @tags_router.get("/", response_model=schemas.Page[schemas.Tag])
    async def get_tags(
        session: Session,
        filter: Annotated[TagFilter, Depends(TagFilter)],  # type: ignore
        limit: Limit = 100,
        offset: Offset = 0,
        sort_by: str | None = "value",
    ):
        """Get all tags."""
        tags, total = await api.tags.get_many(
            session,
            limit=limit,
            offset=offset,
            filters=[filter],
            sort_by=sort_by,
        )
        return schemas.Page(
            items=tags,
            total=total,
            limit=limit,
            offset=offset,
        )

    @tags_router.get("/recording_tags/", response_model=schemas.Page[schemas.RecordingTag])
    async def get_recording_tags(
        session: Session,
        filter: Annotated[RecordingTagFilter, Depends(RecordingTagFilter)],  # type: ignore
        limit: Limit = 100,
        offset: Offset = 0,
        sort_by: str | None = "recording_id",
    ):
        """Get all recording tags."""
        tags, total = await api.tags.get_recording_tags(
            session,
            limit=limit,
            offset=offset,
            filters=[filter],
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
        user: Annotated[schemas.SimpleUser, Depends(active_user)],
    ):
        """Create a new tag and automatically add it to all annotation projects."""
        # Create the tag
        tag = await api.tags.create(session, key=data.key, value=data.value, created_by=user)

        # Get all annotation projects with tags eagerly loaded
        projects, _ = await api.annotation_projects.get_many_with_tags(
            session,
            limit=None,  # Get all projects
            offset=0,
        )

        # Add the tag to all annotation projects
        for project in projects:
            try:
                await api.annotation_projects.add_tag(session, project, tag)
            except Exception:
                # If tag already exists in project, skip (shouldn't happen with new tags)
                pass

        await session.commit()
        return tag

    return tags_router

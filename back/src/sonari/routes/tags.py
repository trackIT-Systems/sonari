"""REST API routes for tags."""

from typing import Annotated

from fastapi import APIRouter, Depends

from sonari import api, schemas
from sonari.filters.recording_tags import RecordingTagFilter
from sonari.filters.tags import TagFilter
from sonari.routes.dependencies import Session
from sonari.routes.types import Limit, Offset

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
):
    """Create a new tag."""
    tag = await api.tags.create(session, key=data.key, value=data.value)
    await session.commit()
    return tag

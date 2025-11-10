"""REST API routes for tags."""

from typing import Annotated

from fastapi import APIRouter, Depends

from sonari import api, schemas
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

    @tags_router.post("/", response_model=schemas.Tag)
    async def create_tag(
        session: Session,
        data: schemas.TagCreate,
        user: Annotated[schemas.SimpleUser, Depends(active_user)],
    ):
        """Create a new tag."""
        # Create the tag
        tag = await api.tags.create(session, key=data.key, value=data.value, created_by=user)

        await session.commit()
        return tag

    return tags_router

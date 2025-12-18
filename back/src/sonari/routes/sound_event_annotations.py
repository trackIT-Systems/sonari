"""REST API routes for sound_event_annotations."""

from typing import Annotated

from fastapi import APIRouter, Depends

from sonari import api, schemas
from sonari.filters.sound_event_annotations import SoundEventAnnotationFilter
from sonari.routes.dependencies import Session
from sonari.routes.dependencies.auth import CurrentUser, create_authenticated_router
from sonari.routes.dependencies.settings import SonariSettings
from sonari.routes.types import Limit, Offset

__all__ = [
    "get_sound_event_annotations_router",
]


def get_sound_event_annotations_router(settings: SonariSettings) -> APIRouter:
    """Get the API router for sound_event_annotations."""
    sound_event_annotations_router = create_authenticated_router()

    @sound_event_annotations_router.post(
        "/",
        response_model=schemas.SoundEventAnnotation,
    )
    async def create_annotation(
        session: Session,
        user: CurrentUser,
        annotation_task_id: int,
        data: schemas.SoundEventAnnotationCreate,
    ):
        """Create a sound event annotation."""
        annotation_task = await api.annotation_tasks.get(
            session,
            annotation_task_id,
        )

        # Create the annotation
        sound_event_annotation = await api.sound_event_annotations.create(
            session,
            annotation_task=annotation_task,
            geometry=data.geometry,
            created_by=user,
        )

        # Add tags
        for tag_data in data.tags:
            tag = await api.tags.get(session, (tag_data.key, tag_data.value))
            sound_event_annotation = await api.sound_event_annotations.add_tag(
                session,
                sound_event_annotation,
                tag,
                user,
            )

        await session.commit()
        return sound_event_annotation

    @sound_event_annotations_router.get(
        "/detail/",
        response_model=schemas.SoundEventAnnotation,
    )
    async def get_annotation(
        session: Session,
        sound_event_annotation_id: int,
        include_tags: bool = False,
        include_features: bool = False,
        include_created_by: bool = False,
    ):
        """Get a sound event annotation."""
        return await api.sound_event_annotations.get(
            session,
            sound_event_annotation_id,
            include_tags=include_tags,
            include_features=include_features,
            include_created_by=include_created_by,
        )

    @sound_event_annotations_router.get("/", response_model=schemas.Page[schemas.SoundEventAnnotation])
    async def get_sound_event_annotations(
        session: Session,
        filter: Annotated[
            SoundEventAnnotationFilter,  # type: ignore
            Depends(SoundEventAnnotationFilter),
        ],
        limit: Limit = 10,
        offset: Offset = 0,
        sort_by: str = "-created_on",
    ):
        """Get a page of sound event annotations."""
        (
            sound_event_annotations,
            total,
        ) = await api.sound_event_annotations.get_many(
            session,
            limit=limit,
            offset=offset,
            filters=[filter],
            sort_by=sort_by,
        )
        return schemas.Page(
            items=sound_event_annotations,
            total=total,
            limit=limit,
            offset=offset,
        )

    @sound_event_annotations_router.patch(
        "/detail/",
        response_model=schemas.SoundEventAnnotation,
    )
    async def update_annotation(
        session: Session,
        user: Annotated[schemas.SimpleUser, Depends(active_user)],
        sound_event_annotation_id: int,
        data: schemas.SoundEventAnnotationUpdate,
    ):
        """Update a sound event annotation."""
        sound_event_annotation = await api.sound_event_annotations.get(
            session,
            sound_event_annotation_id,
        )

        # Update geometry
        sound_event_annotation = await api.sound_event_annotations.update_geometry(
            session,
            sound_event_annotation,
            data.geometry,
        )

        # Mark as edited by user (remove confidence and update ownership)
        sound_event_annotation = await api.sound_event_annotations.mark_as_edited_by_user(
            session,
            sound_event_annotation,
            user,
        )

        await session.commit()
        return sound_event_annotation

    @sound_event_annotations_router.delete(
        "/detail/",
        response_model=schemas.SoundEventAnnotation,
    )
    async def delete_annotation(
        session: Session,
        sound_event_annotation_id: int,
    ):
        """Delete a sound event annotation."""
        sound_event_annotation = await api.sound_event_annotations.get(
            session,
            sound_event_annotation_id,
            include_created_by=True,
            include_features=True,
            include_tags=True,
        )
        sound_event_annotation = await api.sound_event_annotations.delete(
            session,
            sound_event_annotation,
        )
        await session.commit()
        return sound_event_annotation

    @sound_event_annotations_router.post(
        "/detail/tags/",
        response_model=schemas.SoundEventAnnotation,
    )
    async def add_annotation_tag(
        session: Session,
        sound_event_annotation_id: int,
        key: str,
        value: str,
        user: CurrentUser,
    ):
        """Add a tag to a sound event annotation."""
        sound_event_annotation = await api.sound_event_annotations.get(
            session,
            sound_event_annotation_id,
            include_tags=True,
        )
        tag = await api.tags.get(session, (key, value))
        sound_event_annotation = await api.sound_event_annotations.add_tag(
            session,
            sound_event_annotation,
            tag,
            user,
        )

        # Mark as edited by user (remove confidence and update ownership)
        sound_event_annotation = await api.sound_event_annotations.mark_as_edited_by_user(
            session,
            sound_event_annotation,
            user,
        )

        await session.commit()
        return sound_event_annotation

    @sound_event_annotations_router.delete(
        "/detail/tags/",
        response_model=schemas.SoundEventAnnotation,
    )
    async def remove_annotation_tag(
        session: Session,
        sound_event_annotation_id: int,
        key: str,
        value: str,
        user: Annotated[schemas.SimpleUser, Depends(active_user)],
    ):
        """Remove a tag from a sound event annotation."""
        sound_event_annotation = await api.sound_event_annotations.get(
            session,
            sound_event_annotation_id,
            include_tags=True,
        )
        tag = await api.tags.get(session, (key, value))
        sound_event_annotation = await api.sound_event_annotations.remove_tag(
            session,
            sound_event_annotation,
            tag,
        )

        # Mark as edited by user (remove confidence and update ownership)
        sound_event_annotation = await api.sound_event_annotations.mark_as_edited_by_user(
            session,
            sound_event_annotation,
            user,
        )

        await session.commit()
        return sound_event_annotation

    return sound_event_annotations_router

"""REST API routes for recordings."""

from typing import Annotated

from fastapi import APIRouter, Depends

from sonari import api, schemas
from sonari.filters.recordings import RecordingFilter
from sonari.routes.dependencies import Session, get_current_user_dependency
from sonari.routes.dependencies.settings import SonariSettings
from sonari.routes.types import Limit, Offset

__all__ = [
    "get_recording_router",
]


def get_recording_router(settings: SonariSettings) -> APIRouter:
    """Get the API router for recordings."""
    active_user = get_current_user_dependency(settings)

    recording_router = APIRouter()

    @recording_router.get(
        "/",
        response_model=schemas.Page[schemas.Recording],
        response_model_exclude_none=True,
    )
    async def get_recordings(
        session: Session,
        filter: Annotated[
            RecordingFilter,  # type: ignore
            Depends(RecordingFilter),
        ],
        limit: Limit = 10,
        offset: Offset = 0,
        sort_by: str = "-created_on",
    ):
        """Get a page of datasets."""
        datasets, total = await api.recordings.get_many(
            session,
            limit=limit,
            offset=offset,
            filters=[filter],
            sort_by=sort_by,
        )
        return schemas.Page(
            items=datasets,
            total=total,
            offset=offset,
            limit=limit,
        )

    @recording_router.get(
        "/detail/",
        response_model=schemas.Recording,
        response_model_exclude_none=True,
    )
    async def get_recording(
        session: Session,
        recording_id: int,
    ):
        """Get a recording."""
        return await api.recordings.get(session, recording_id)

    @recording_router.patch(
        "/detail/",
        response_model=schemas.Recording,
        response_model_exclude_none=True,
    )
    async def update_recording(
        session: Session,
        recording_id: int,
        data: schemas.RecordingUpdate,
    ):
        """Update a recording."""
        recording = await api.recordings.get(session, recording_id)
        response = await api.recordings.update(session, recording, data)
        await session.commit()
        return response

    @recording_router.post(
        "/detail/tags/",
        response_model=schemas.Recording,
        response_model_exclude_none=True,
    )
    async def add_recording_tag(
        session: Session,
        recording_id: int,
        key: str,
        value: str,
        user: Annotated[schemas.SimpleUser, Depends(active_user)],
    ):
        """Add a tag to a recording."""
        recording = await api.recordings.get_with_tags(session, recording_id)
        tag = await api.tags.get(session, (key, value))
        response = await api.recordings.add_tag(session, recording, tag, created_by=user)
        await session.commit()
        return response

    @recording_router.delete(
        "/detail/tags/",
        response_model=schemas.Recording,
        response_model_exclude_none=True,
    )
    async def remove_recording_tag(
        session: Session,
        recording_id: int,
        key: str,
        value: str,
        user: Annotated[schemas.SimpleUser, Depends(active_user)],
    ):
        """Remove a tag from a recording."""
        recording = await api.recordings.get_with_tags(session, recording_id)
        tag = await api.tags.get(session, (key, value))
        response = await api.recordings.remove_tag(session, recording, tag, created_by=user)
        await session.commit()
        return response

    @recording_router.post(
        "/detail/features/",
        response_model=schemas.Recording,
        response_model_exclude_none=True,
    )
    async def add_recording_feature(
        session: Session,
        recording_id: int,
        name: str,
        value: float,
    ):
        """Add a feature to a recording."""
        recording = await api.recordings.get_with_features(session, recording_id)

        feature = schemas.Feature(name=name, value=value)
        response = await api.recordings.add_feature(session, recording, feature)
        await session.commit()
        return response

    @recording_router.delete(
        "/detail/features/",
        response_model=schemas.Recording,
        response_model_exclude_none=True,
    )
    async def remove_recording_feature(
        session: Session,
        recording_id: int,
        name: str,
        value: float,
    ):
        """Remove a feature from a recording."""
        recording = await api.recordings.get_with_features(session, recording_id)
        feature = schemas.Feature(name=name, value=value)
        response = await api.recordings.remove_feature(session, recording, feature)
        await session.commit()
        return response

    @recording_router.patch(
        "/detail/features/",
        response_model=schemas.Recording,
        response_model_exclude_none=True,
    )
    async def update_recording_feature(
        session: Session,
        recording_id: int,
        name: str,
        value: float,
    ):
        """Update a feature on a recording."""
        recording = await api.recordings.get_with_features(session, recording_id)
        feature = schemas.Feature(name=name, value=value)
        response = await api.recordings.update_feature(
            session,
            recording,
            feature,
        )
        await session.commit()
        return response

    @recording_router.delete(
        "/detail/",
        response_model=schemas.Recording,
        response_model_exclude_none=True,
    )
    async def delete_recording(
        session: Session,
        recording_id: int,
    ):
        """Delete a recording."""
        recording = await api.recordings.get(session, recording_id)
        await api.recordings.delete(session, recording)
        await session.commit()
        return recording

    return recording_router

"""REST API routes for features."""

from sqlalchemy import func, select, union

from fastapi import Depends

from sonari import models, schemas
from sonari.filters.feature_names import FeatureNameFilter
from sonari.routes.dependencies import Session
from sonari.routes.dependencies.auth import create_authenticated_router
from sonari.routes.types import Limit, Offset

__all__ = [
    "features_router",
]


features_router = create_authenticated_router()


@features_router.get("/", response_model=schemas.Page[str])
async def get_features_names(
    session: Session,
    search: str | None = None,
    limit: Limit = 100,
    offset: Offset = 0,
) -> schemas.Page[str]:
    """Get list of unique feature names across all feature tables.

    Since feature names are now stored directly in feature tables rather than
    in a separate FeatureName table, this endpoint queries all feature tables
    and returns distinct feature names.
    """
    # Query distinct feature names from all three feature tables
    recording_features = select(models.RecordingFeature.name).distinct()
    task_features = select(models.AnnotationTaskFeature.name).distinct()
    sound_event_features = select(models.SoundEventAnnotationFeature.name).distinct()

    # Union all feature names
    all_features = union(recording_features, task_features, sound_event_features).subquery()

    # Build query for feature names
    query = select(all_features.c.name)

    # Apply search filter if provided
    if search:
        query = query.where(all_features.c.name.ilike(f"%{search}%"))

    # Get total count
    count_query = select(func.count()).select_from(query.subquery())
    count_result = await session.execute(count_query)
    total = count_result.scalar() or 0

    # Apply ordering, limit, and offset
    query = query.order_by(all_features.c.name).limit(limit).offset(offset)

    result = await session.execute(query)
    feature_names = [name for (name,) in result.all()]

    return schemas.Page(
        items=feature_names,
        total=total,
        offset=offset,
        limit=limit,
    )

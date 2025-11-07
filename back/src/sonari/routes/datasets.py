"""REST API routes for datasets."""

from typing import Annotated

from fastapi import APIRouter, Depends

from sonari import api, schemas
from sonari.filters.datasets import DatasetFilter
from sonari.routes.dependencies import Session
from sonari.routes.dependencies.settings import SonariSettings
from sonari.routes.types import Limit, Offset

__all__ = [
    "get_dataset_router",
]


def get_dataset_router(settings: SonariSettings) -> APIRouter:
    """Get the API router for datasets."""
    dataset_router = APIRouter()

    @dataset_router.get(
        "/",
        response_model=schemas.Page[schemas.Dataset],
        response_model_exclude_none=True,
    )
    async def get_datasets(
        session: Session,
        filter: Annotated[
            DatasetFilter,  # type: ignore
            Depends(DatasetFilter),
        ],
        limit: Limit = 100,
        offset: Offset = 0,
        sort_by: str = "name",
    ):
        """Get a page of datasets."""
        datasets, total = await api.datasets.get_many(
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

    return dataset_router


"""REST API routes for datasets."""

from typing import Annotated

from fastapi import APIRouter, Depends

from sonari import api, schemas
from sonari.filters.datasets import DatasetFilter
from sonari.routes.dependencies import Session
from sonari.routes.types import Limit, Offset

__all__ = [
    "dataset_router",
]

dataset_router = APIRouter()


@dataset_router.get(
    "/detail/",
    response_model=schemas.Dataset,
)
async def get_dataset(
    session: Session,
    dataset_id: int,
):
    """Get a dataset by ID."""
    return await api.datasets.get(session, dataset_id)


@dataset_router.get(
    "/",
    response_model=schemas.Page[schemas.Dataset],
)
async def get_datasets(
    session: Session,
    filter: Annotated[
        DatasetFilter,  # type: ignore
        Depends(DatasetFilter),
    ],
    limit: Limit = 10,
    offset: Offset = 0,
):
    """Get a page of datasets."""
    datasets, total = await api.datasets.get_many(
        session,
        limit=limit,
        offset=offset,
        filters=[filter],
    )

    return schemas.Page(
        items=datasets,
        total=total,
        offset=offset,
        limit=limit,
    )


@dataset_router.post(
    "/",
    response_model=schemas.Dataset,
)
async def create_dataset(
    session: Session,
    dataset: schemas.DatasetCreate,
):
    """Create a new dataset."""
    created = await api.datasets.create(
        session,
        name=dataset.name,
        description=dataset.description,
        dataset_dir=dataset.audio_dir,
    )
    await session.commit()
    return created


@dataset_router.patch(
    "/detail/",
    response_model=schemas.Dataset,
)
async def update_dataset(
    session: Session,
    dataset_id: int,
    data: schemas.DatasetUpdate,
):
    """Update a dataset."""
    dataset = await api.datasets.get(session, dataset_id)
    updated = await api.datasets.update(session, dataset, data)
    await session.commit()
    return updated


@dataset_router.get(
    "/detail/state/",
    response_model=list[schemas.DatasetFile],
)
async def get_file_state(
    session: Session,
    dataset_id: int,
):
    """Get the status of the files in a dataset."""
    dataset = await api.datasets.get(session, dataset_id)
    return await api.datasets.get_state(session, dataset)


@dataset_router.delete(
    "/detail/",
    response_model=schemas.Dataset,
)
async def delete_dataset(
    session: Session,
    dataset_id: int,
):
    """Delete a dataset."""
    dataset = await api.datasets.get(session, dataset_id)

    deleted = await api.datasets.delete(session, dataset)
    await session.commit()
    return deleted

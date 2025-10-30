"""Tests for dataset endpoints."""

import uuid

import pytest
from httpx import AsyncClient

from sonari.system.settings import Settings


@pytest.mark.asyncio
async def test_get_datasets(auth_client: AsyncClient):
    """Test getting list of datasets."""
    response = await auth_client.get("/api/v1/datasets/")
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert "total" in data
    assert "limit" in data
    assert "offset" in data


@pytest.mark.asyncio
async def test_create_dataset(auth_client: AsyncClient, test_settings: Settings):
    """Test creating a dataset."""
    # Use unique name to avoid conflicts
    dataset_name = f"test_dataset_{uuid.uuid4().hex[:8]}"
    dataset_dir = test_settings.audio_dir / dataset_name
    dataset_dir.mkdir(parents=True, exist_ok=True)

    response = await auth_client.post(
        "/api/v1/datasets/",
        json={
            "name": dataset_name,
            "description": "A test dataset",
            "audio_dir": str(dataset_dir),
        },
    )
    assert response.status_code in [200, 201]
    data = response.json()
    assert data["name"] == dataset_name
    assert "id" in data


@pytest.mark.asyncio
async def test_get_dataset_detail(auth_client: AsyncClient, test_settings: Settings):
    """Test getting dataset details."""
    # First create a dataset with unique name
    dataset_name = f"test_dataset_{uuid.uuid4().hex[:8]}"
    dataset_dir = test_settings.audio_dir / dataset_name
    dataset_dir.mkdir(parents=True, exist_ok=True)

    create_response = await auth_client.post(
        "/api/v1/datasets/",
        json={
            "name": dataset_name,
            "description": "Dataset for detail test",
            "audio_dir": str(dataset_dir),
        },
    )
    assert create_response.status_code in [200, 201]
    dataset = create_response.json()
    dataset_id = dataset["id"]

    # Get the dataset details
    response = await auth_client.get(
        "/api/v1/datasets/detail/",
        params={"dataset_id": dataset_id},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == dataset_id
    assert data["name"] == dataset_name


@pytest.mark.asyncio
async def test_update_dataset(auth_client: AsyncClient, test_settings: Settings):
    """Test updating a dataset."""
    # First create a dataset with unique name
    dataset_name = f"test_dataset_{uuid.uuid4().hex[:8]}"
    dataset_dir = test_settings.audio_dir / dataset_name
    dataset_dir.mkdir(parents=True, exist_ok=True)

    create_response = await auth_client.post(
        "/api/v1/datasets/",
        json={
            "name": dataset_name,
            "description": "Dataset for update test",
            "audio_dir": str(dataset_dir),
        },
    )
    assert create_response.status_code in [200, 201]
    dataset = create_response.json()
    dataset_id = dataset["id"]

    # Update the dataset with unique name
    updated_name = f"Updated Dataset {uuid.uuid4().hex[:8]}"
    response = await auth_client.patch(
        "/api/v1/datasets/detail/",
        params={"dataset_id": dataset_id},
        json={
            "name": updated_name,
            "description": "Updated description",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == updated_name
    assert data["description"] == "Updated description"


@pytest.mark.asyncio
async def test_get_dataset_file_state(auth_client: AsyncClient):
    """Test getting dataset file state."""
    # Get the file state
    response = await auth_client.get(
        "/api/v1/datasets/detail/state/",
        params={"dataset_id": 1},
    )
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)


@pytest.mark.asyncio
async def test_delete_dataset(auth_client: AsyncClient, test_settings: Settings):
    """Test deleting a dataset."""
    # First create a dataset with unique name
    dataset_name = f"test_dataset_{uuid.uuid4().hex[:8]}"
    dataset_dir = test_settings.audio_dir / dataset_name
    dataset_dir.mkdir(parents=True, exist_ok=True)
    create_response = await auth_client.post(
        "/api/v1/datasets/",
        json={
            "name": dataset_name,
            "description": "Dataset for delete test",
            "audio_dir": str(dataset_dir),
        },
    )
    assert create_response.status_code in [200, 201]
    dataset = create_response.json()
    dataset_id = dataset["id"]

    # Delete the dataset
    response = await auth_client.delete(
        "/api/v1/datasets/detail/",
        params={"dataset_id": dataset_id},
    )
    assert response.status_code in [200, 204]

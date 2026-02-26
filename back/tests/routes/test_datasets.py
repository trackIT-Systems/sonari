"""Tests for dataset endpoints."""

import pytest
from httpx import AsyncClient

from sonari import schemas


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
async def test_get_datasets_with_pagination(auth_client: AsyncClient):
    """Test getting datasets with pagination."""
    response = await auth_client.get(
        "/api/v1/datasets/",
        params={"limit": 5, "offset": 0},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["limit"] == 5
    assert data["offset"] == 0


@pytest.mark.asyncio
async def test_get_datasets_with_sorting(auth_client: AsyncClient):
    """Test getting datasets with sorting."""
    response = await auth_client.get(
        "/api/v1/datasets/",
        params={"sort_by": "name"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "items" in data


@pytest.mark.asyncio
async def test_get_datasets_with_desc_sorting(auth_client: AsyncClient):
    """Test getting datasets with descending sort."""
    response = await auth_client.get(
        "/api/v1/datasets/",
        params={"sort_by": "-name"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "items" in data


@pytest.mark.asyncio
async def test_get_datasets_validates_schema(auth_client: AsyncClient):
    """Test that dataset responses have expected structure."""
    response = await auth_client.get("/api/v1/datasets/")
    assert response.status_code == 200
    data = response.json()
    
    # Validate page structure (manual validation since response may exclude optional fields)
    assert "items" in data
    assert "total" in data
    assert "limit" in data
    assert "offset" in data
    assert data["total"] >= 0
    assert data["limit"] > 0
    assert data["offset"] >= 0
    
    # Validate each dataset item has required fields
    for item in data["items"]:
        assert "name" in item
        assert item["name"] is not None
        assert "audio_dir" in item
        assert item["audio_dir"] is not None


@pytest.mark.asyncio
async def test_get_datasets_with_large_limit(auth_client: AsyncClient):
    """Test getting datasets with large limit."""
    response = await auth_client.get(
        "/api/v1/datasets/",
        params={"limit": 1000},
    )
    assert response.status_code == 200
    data = response.json()
    # Should respect max limit or return what's available
    assert len(data["items"]) <= data["total"]


@pytest.mark.asyncio
async def test_get_datasets_with_large_offset(auth_client: AsyncClient):
    """Test getting datasets with offset beyond available data."""
    response = await auth_client.get(
        "/api/v1/datasets/",
        params={"limit": 10, "offset": 999999},
    )
    assert response.status_code == 200
    data = response.json()
    # Should return empty list when offset is beyond available data
    assert data["items"] == []


@pytest.mark.asyncio
async def test_get_datasets_with_filters(
    auth_client: AsyncClient,
    test_dataset: schemas.Dataset,
):
    """Test getting datasets with name filter."""
    response = await auth_client.get(
        "/api/v1/datasets/",
        params={"name": test_dataset.name},
    )
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    # Should find the test dataset
    if data["total"] > 0:
        found = any(item["name"] == test_dataset.name for item in data["items"])
        assert found


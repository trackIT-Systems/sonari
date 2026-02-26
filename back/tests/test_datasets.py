"""Tests for dataset endpoints."""

import pytest
from httpx import AsyncClient


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


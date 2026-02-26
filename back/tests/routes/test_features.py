"""Tests for feature endpoints."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_get_feature_names(auth_client: AsyncClient):
    """Test getting list of feature names."""
    response = await auth_client.get("/api/v1/features/")
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert "total" in data
    assert "limit" in data
    assert "offset" in data
    assert isinstance(data["items"], list)


@pytest.mark.asyncio
async def test_get_feature_names_with_pagination(auth_client: AsyncClient):
    """Test getting feature names with pagination."""
    response = await auth_client.get(
        "/api/v1/features/",
        params={"limit": 50, "offset": 0},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["limit"] == 50
    assert data["offset"] == 0

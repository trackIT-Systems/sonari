"""Tests for tag endpoints."""

import uuid

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_get_tags(auth_client: AsyncClient):
    """Test getting list of tags."""
    response = await auth_client.get("/api/v1/tags/")
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert "total" in data
    assert "limit" in data
    assert "offset" in data


@pytest.mark.asyncio
async def test_get_tags_with_pagination(auth_client: AsyncClient):
    """Test getting tags with pagination."""
    response = await auth_client.get(
        "/api/v1/tags/",
        params={"limit": 10, "offset": 0},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["limit"] == 10
    assert data["offset"] == 0


@pytest.mark.asyncio
async def test_create_tag(auth_client: AsyncClient):
    """Test creating a tag."""
    # Use unique key to avoid conflicts with other tests
    tag_key = f"species_{uuid.uuid4().hex[:8]}"
    response = await auth_client.post(
        "/api/v1/tags/",
        json={"key": tag_key, "value": "bat"},
    )
    assert response.status_code in [200]
    data = response.json()
    assert data["key"] == tag_key
    assert data["value"] == "bat"


@pytest.mark.asyncio
async def test_create_duplicate_tag(auth_client: AsyncClient):
    """Test creating a duplicate tag."""
    # Use unique key for this test
    tag_key = f"duplicate_{uuid.uuid4().hex[:8]}"

    # Create first tag
    await auth_client.post(
        "/api/v1/tags/",
        json={"key": tag_key, "value": "test"},
    )

    # Try to create duplicate - should return conflict
    response = await auth_client.post(
        "/api/v1/tags/",
        json={"key": tag_key, "value": "test"},
    )
    # Should return conflict
    assert response.status_code in [409]


@pytest.mark.asyncio
async def test_get_recording_tags(auth_client: AsyncClient):
    """Test getting recording tags."""
    response = await auth_client.get("/api/v1/tags/recording_tags/")
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert "total" in data
    assert "limit" in data
    assert "offset" in data


@pytest.mark.asyncio
async def test_get_recording_tags_with_pagination(auth_client: AsyncClient):
    """Test getting recording tags with pagination."""
    response = await auth_client.get(
        "/api/v1/tags/recording_tags/",
        params={"limit": 1, "offset": 1},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["limit"] == 1
    assert data["offset"] == 1

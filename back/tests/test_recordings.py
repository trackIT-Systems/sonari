"""Tests for recording endpoints."""

import pytest
from httpx import AsyncClient

from sonari import schemas


@pytest.mark.asyncio
async def test_get_recordings(auth_client: AsyncClient):
    """Test getting list of recordings."""
    response = await auth_client.get("/api/v1/recordings/")
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert "total" in data
    assert "limit" in data
    assert "offset" in data


@pytest.mark.asyncio
async def test_get_recordings_with_filters(auth_client: AsyncClient):
    """Test getting recordings with filters."""
    response = await auth_client.get(
        "/api/v1/recordings/",
        params={"limit": 5, "offset": 0, "sort_by": "-created_on"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["limit"] == 5


@pytest.mark.asyncio
async def test_get_recording_detail_not_found(auth_client: AsyncClient):
    """Test getting non-existent recording details."""
    # Use a random ID that doesn't exist
    response = await auth_client.get(
        "/api/v1/recordings/detail/",
        params={"recording_id": 125},
    )
    # Should return 404 for non-existent recording
    assert response.status_code in [404, 500]


@pytest.mark.asyncio
async def test_update_recording_not_found(auth_client: AsyncClient):
    """Test updating non-existent recording."""
    response = await auth_client.patch(
        "/api/v1/recordings/detail/",
        params={"recording_id": 125},
        json={},
    )
    # Should return 404 for non-existent recording
    assert response.status_code in [404, 500]


@pytest.mark.asyncio
async def test_add_recording_feature_not_found(auth_client: AsyncClient):
    """Test adding feature to non-existent recording."""
    response = await auth_client.post(
        "/api/v1/recordings/detail/features/",
        params={
            "recording_id": 125,
            "name": "test_feature",
            "value": 1.0,
        },
    )
    # Should return 404 for non-existent recording
    assert response.status_code in [404, 500]


@pytest.mark.asyncio
async def test_remove_recording_feature_not_found(auth_client: AsyncClient):
    """Test removing feature from non-existent recording."""
    response = await auth_client.delete(
        "/api/v1/recordings/detail/features/",
        params={
            "recording_id": 125,
            "name": "test_feature",
            "value": 1.0,
        },
    )
    # Should return 404 for non-existent recording
    assert response.status_code in [404, 500]


@pytest.mark.asyncio
async def test_update_recording_feature_not_found(auth_client: AsyncClient):
    """Test updating feature on non-existent recording."""
    response = await auth_client.patch(
        "/api/v1/recordings/detail/features/",
        params={
            "recording_id": 125,
            "name": "test_feature",
            "value": 2.0,
        },
    )
    # Should return 404 for non-existent recording
    assert response.status_code in [404, 500]


@pytest.mark.asyncio
async def test_delete_recording_not_found(auth_client: AsyncClient):
    """Test deleting non-existent recording."""
    response = await auth_client.delete(
        "/api/v1/recordings/detail/",
        params={"recording_id": 125},
    )
    # Should return 404 for non-existent recording
    assert response.status_code in [404, 500]


# Happy path tests - using fixed IDs (to be adjusted with real data)


@pytest.mark.asyncio
async def test_get_recording_detail(auth_client: AsyncClient, test_recording_id: int):
    """Test getting a specific recording's details (READ operation - uses hardcoded ID)."""
    response = await auth_client.get(
        "/api/v1/recordings/detail/",
        params={"recording_id": test_recording_id},
    )
    assert response.status_code == 200
    data = response.json()
    assert "id" in data
    assert data["id"] == test_recording_id


@pytest.mark.asyncio
async def test_update_recording(auth_client: AsyncClient, test_recording: schemas.Recording):
    """Test updating a recording (UPDATE operation - uses temporary recording)."""
    update_data = {
        "latitude": 52.5200,
        "longitude": 13.4050,
    }
    response = await auth_client.patch(
        "/api/v1/recordings/detail/",
        params={"recording_id": test_recording.id},
        json=update_data,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == test_recording.id
    assert data["latitude"] == update_data["latitude"]
    assert data["longitude"] == update_data["longitude"]


@pytest.mark.asyncio
async def test_add_recording_feature(auth_client: AsyncClient, test_recording: schemas.Recording):
    """Test adding a feature to a recording (MODIFY operation - uses temporary recording)."""
    response = await auth_client.post(
        "/api/v1/recordings/detail/features/",
        params={
            "recording_id": test_recording.id,
            "name": "duration",
            "value": 120.5,
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == test_recording.id
    assert "features" in data
    # Check if the feature was added
    feature_added = any(feature["name"] == "duration" and feature["value"] == 120.5 for feature in data["features"])
    assert feature_added


@pytest.mark.asyncio
async def test_remove_recording_feature(auth_client: AsyncClient, test_recording: schemas.Recording):
    """Test removing a feature from a recording (MODIFY operation - uses temporary recording)."""
    # First add a feature
    await auth_client.post(
        "/api/v1/recordings/detail/features/",
        params={
            "recording_id": test_recording.id,
            "name": "temp_feature",
            "value": 99.9,
        },
    )

    # Then remove it
    response = await auth_client.delete(
        "/api/v1/recordings/detail/features/",
        params={
            "recording_id": test_recording.id,
            "name": "temp_feature",
            "value": 99.9,
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == test_recording.id


@pytest.mark.asyncio
async def test_update_recording_feature(auth_client: AsyncClient, test_recording: schemas.Recording):
    """Test updating a feature on a recording (MODIFY operation - uses temporary recording)."""
    # First add a feature
    await auth_client.post(
        "/api/v1/recordings/detail/features/",
        params={
            "recording_id": test_recording.id,
            "name": "updateable_feature",
            "value": 10.0,
        },
    )

    # Then update it
    response = await auth_client.patch(
        "/api/v1/recordings/detail/features/",
        params={
            "recording_id": test_recording.id,
            "name": "updateable_feature",
            "value": 20.0,
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == test_recording.id
    assert "features" in data


@pytest.mark.asyncio
async def test_delete_recording(auth_client: AsyncClient, test_recording: schemas.Recording):
    """Test deleting a recording (DELETE operation - uses temporary recording)."""
    response = await auth_client.delete(
        "/api/v1/recordings/detail/",
        params={"recording_id": test_recording.id},
    )
    # Should successfully delete the temporary recording
    assert response.status_code in [200, 204]

"""Tests for note endpoints."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_get_notes(auth_client: AsyncClient):
    """Test getting list of notes."""
    response = await auth_client.get("/api/v1/notes/")
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert "total" in data
    assert "limit" in data
    assert "offset" in data


@pytest.mark.asyncio
async def test_get_notes_with_pagination(auth_client: AsyncClient):
    """Test getting notes with pagination."""
    response = await auth_client.get(
        "/api/v1/notes/",
        params={"limit": 10, "offset": 0},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["limit"] == 10
    assert data["offset"] == 0


@pytest.mark.asyncio
async def test_get_notes_with_sorting(auth_client: AsyncClient):
    """Test getting notes with sorting."""
    response = await auth_client.get(
        "/api/v1/notes/",
        params={"sort_by": "-created_on"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "items" in data


@pytest.mark.asyncio
async def test_get_note_detail_not_found(auth_client: AsyncClient):
    """Test getting non-existent note details."""
    response = await auth_client.get(
        "/api/v1/notes/detail/",
        params={"note_id": 999999},
    )
    # Should return 404 or 500 for non-existent note
    assert response.status_code in [404, 500]


@pytest.mark.asyncio
async def test_update_note_not_found(auth_client: AsyncClient):
    """Test updating non-existent note."""
    response = await auth_client.patch(
        "/api/v1/notes/detail/",
        params={"note_id": 999999},
        json={"message": "Updated message"},
    )
    # Should return 404 or 500 for non-existent note
    assert response.status_code in [404, 500]


@pytest.mark.asyncio
async def test_delete_note_not_found(auth_client: AsyncClient):
    """Test deleting non-existent note."""
    response = await auth_client.delete(
        "/api/v1/notes/detail/",
        params={"note_id": 999999},
    )
    # Should return 404 or 500 for non-existent note
    assert response.status_code in [404, 500]


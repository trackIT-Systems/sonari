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

"""Tests for user endpoints."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_get_current_user(auth_client: AsyncClient):
    """Test getting current user information."""
    # App exposes current user at /auth/me, not /users/me
    response = await auth_client.get("/api/v1/auth/me")
    assert response.status_code == 200
    data = response.json()
    assert "email" in data
    assert "username" in data

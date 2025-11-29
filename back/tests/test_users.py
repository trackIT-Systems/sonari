"""Tests for user endpoints."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_get_current_user(auth_client: AsyncClient):
    """Test getting current user information."""
    response = await auth_client.get("/api/v1/users/me")
    assert response.status_code == 200
    data = response.json()
    assert "email" in data
    assert "username" in data


@pytest.mark.asyncio
async def test_create_first_user_fails_when_users_exist(client: AsyncClient):
    """Test that creating first user fails when users already exist."""
    response = await client.post(
        "/api/v1/users/first/",
        json={
            "username": "another_admin",
            "email": "another@example.com",
            "password": "password123",
        },
    )
    # Should fail because admin user already exists
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_update_current_user(auth_client: AsyncClient):
    """Test updating current user."""
    # First get the current user to get their ID
    me_response = await auth_client.get("/api/v1/users/me")
    assert me_response.status_code == 200
    user_data = me_response.json()
    user_id = user_data["id"]

    # Update the user
    response = await auth_client.patch(
        f"/api/v1/users/{user_id}",
        json={"name": "Updated Admin Name"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Updated Admin Name"

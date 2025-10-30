"""Tests for authentication endpoints."""

import uuid

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_login_success(client: AsyncClient, admin_user: dict):
    """Test successful login with cookie-based authentication."""
    response = await client.post(
        "/api/v1/auth/login",
        data={
            "username": admin_user["username"],
            "password": admin_user["password"],
        },
    )
    # CookieTransport returns 204 No Content on successful login
    assert response.status_code == 204
    # With cookie-based auth, verify the authentication cookie is set
    assert "sonariauth" in response.cookies, "Authentication cookie should be set"


@pytest.mark.asyncio
async def test_login_invalid_credentials(client: AsyncClient):
    """Test login with invalid credentials."""
    response = await client.post(
        "/api/v1/auth/login",
        data={
            "username": "invalid@example.com",
            "password": "wrongpassword",
        },
    )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_register_new_user(client: AsyncClient):
    """Test user registration."""
    # Use unique username and email to avoid conflicts
    unique_id = uuid.uuid4().hex[:8]
    username = f"testuser_{unique_id}"
    email = f"testuser_{unique_id}@example.com"

    response = await client.post(
        "/api/v1/auth/register",
        json={
            "username": username,
            "email": email,
            "password": "testpass123",
        },
    )
    assert response.status_code in [200, 201]
    data = response.json()
    assert data["email"] == email
    assert data["username"] == username


@pytest.mark.asyncio
async def test_logout(auth_client: AsyncClient):
    """Test logout endpoint."""
    response = await auth_client.post("/api/v1/auth/logout")
    # CookieTransport logout returns 204 No Content
    assert response.status_code == 204

"""Tests for annotation project endpoints."""

import uuid

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_get_annotation_projects(auth_client: AsyncClient):
    """Test getting list of annotation projects."""
    response = await auth_client.get("/api/v1/annotation_projects/")
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert "total" in data
    assert "limit" in data
    assert "offset" in data


@pytest.mark.asyncio
async def test_create_annotation_project(auth_client: AsyncClient):
    """Test creating an annotation project."""
    # Use unique name to avoid conflicts with other tests
    project_name = f"Test Project {uuid.uuid4().hex[:8]}"
    response = await auth_client.post(
        "/api/v1/annotation_projects/",
        json={
            "name": project_name,
            "description": "A test annotation project",
            "annotation_instructions": "Test instructions",
        },
    )
    assert response.status_code in [200, 201]
    data = response.json()
    assert data["name"] == project_name
    assert data["description"] == "A test annotation project"
    assert "id" in data


@pytest.mark.asyncio
async def test_get_annotation_project_detail(auth_client: AsyncClient):
    """Test getting annotation project details."""
    # First create a project with unique name
    project_name = f"Detail Test Project {uuid.uuid4().hex[:8]}"
    create_response = await auth_client.post(
        "/api/v1/annotation_projects/",
        json={
            "name": project_name,
            "description": "Project for detail test",
        },
    )
    assert create_response.status_code in [200, 201]
    project = create_response.json()
    project_id = project["id"]

    # Get the project details
    response = await auth_client.get(
        "/api/v1/annotation_projects/detail/",
        params={"annotation_project_id": project_id},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == project_id
    assert data["name"] == project_name


@pytest.mark.asyncio
async def test_update_annotation_project(auth_client: AsyncClient):
    """Test updating an annotation project."""
    # First create a project with unique name
    project_name = f"Update Test Project {uuid.uuid4().hex[:8]}"
    create_response = await auth_client.post(
        "/api/v1/annotation_projects/",
        json={
            "name": project_name,
            "description": "Project for update test",
        },
    )
    assert create_response.status_code in [200, 201]
    project = create_response.json()
    project_id = project["id"]

    # Update the project
    updated_name = f"Updated Project Name {uuid.uuid4().hex[:8]}"
    response = await auth_client.patch(
        "/api/v1/annotation_projects/detail/",
        params={"annotation_project_id": project_id},
        json={
            "name": updated_name,
            "description": "Updated description",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == updated_name
    assert data["description"] == "Updated description"


@pytest.mark.asyncio
async def test_remove_tag_from_annotation_project(auth_client: AsyncClient):
    """Test removing a tag from an annotation project."""
    # First create a project with unique name
    project_name = f"Remove Tag Test Project {uuid.uuid4().hex[:8]}"
    create_response = await auth_client.post(
        "/api/v1/annotation_projects/",
        json={
            "name": project_name,
            "description": "Project for remove tag test",
        },
    )
    assert create_response.status_code in [200, 201]
    project = create_response.json()
    project_id = project["id"]

    # Create and add a tag with unique key
    tag_key = f"remove_key_{uuid.uuid4().hex[:8]}"
    tag_response = await auth_client.post(
        "/api/v1/tags/",
        json={"key": tag_key, "value": "remove_value"},
    )
    assert tag_response.status_code in [200, 201]

    # Remove the tag
    response = await auth_client.delete(
        "/api/v1/annotation_projects/detail/tags/",
        params={
            "annotation_project_id": project_id,
            "key": tag_key,
            "value": "remove_value",
        },
    )
    assert response.status_code in [200, 204]


@pytest.mark.asyncio
async def test_delete_annotation_project(auth_client: AsyncClient):
    """Test deleting an annotation project."""
    # First create a project with unique name
    project_name = f"Delete Test Project {uuid.uuid4().hex[:8]}"
    create_response = await auth_client.post(
        "/api/v1/annotation_projects/",
        json={
            "name": project_name,
            "description": "Project for delete test",
        },
    )
    assert create_response.status_code in [200, 201]
    project = create_response.json()
    project_id = project["id"]

    # Delete the project
    response = await auth_client.delete(
        "/api/v1/annotation_projects/detail/",
        params={"annotation_project_id": project_id},
    )
    assert response.status_code in [200, 204]

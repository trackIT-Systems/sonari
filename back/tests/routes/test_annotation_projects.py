"""Tests for annotation project endpoints."""

import uuid

import pytest
from httpx import AsyncClient

from sonari import schemas


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
    
    # Validate response against schema
    project = schemas.AnnotationProject.model_validate(data)
    assert project.name == project_name
    assert project.description == "A test annotation project"
    assert project.id is not None


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


@pytest.mark.asyncio
async def test_get_annotation_project_progress(auth_client: AsyncClient):
    """Test getting annotation project progress statistics."""
    # First create a project with unique name
    project_name = f"Progress Test Project {uuid.uuid4().hex[:8]}"
    create_response = await auth_client.post(
        "/api/v1/annotation_projects/",
        json={
            "name": project_name,
            "description": "Project for progress test",
        },
    )
    assert create_response.status_code in [200, 201]
    project = create_response.json()
    project_id = project["id"]

    # Get the project progress
    response = await auth_client.get(
        "/api/v1/annotation_projects/detail/progress/",
        params={"annotation_project_id": project_id},
    )
    assert response.status_code == 200
    data = response.json()
    # Progress should have expected fields
    assert "total" in data
    assert "verified" in data
    assert "rejected" in data


@pytest.mark.asyncio
async def test_get_annotation_project_species_counts(auth_client: AsyncClient):
    """Test getting species tag counts for an annotation project."""
    project_name = f"Species Counts Test Project {uuid.uuid4().hex[:8]}"
    create_response = await auth_client.post(
        "/api/v1/annotation_projects/",
        json={
            "name": project_name,
            "description": "Project for species counts test",
        },
    )
    assert create_response.status_code in [200, 201]
    project = create_response.json()
    project_id = project["id"]

    response = await auth_client.get(
        "/api/v1/annotation_projects/detail/species_counts/",
        params={"annotation_project_id": project_id},
    )
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    for item in data:
        assert "key" in item
        assert "value" in item
        assert "count" in item
        assert "accepted" in item
        assert "verified" in item
        assert "unsure" in item
        assert "rejected" in item
        assert "no_status" in item
        assert (
            item["accepted"]
            + item["verified"]
            + item["unsure"]
            + item["rejected"]
            + item["no_status"]
            == item["count"]
        )



@pytest.mark.asyncio
async def test_species_counts_include_task_and_recording_counts(
    auth_client: AsyncClient,
    db_session,
    test_annotation_project,
    test_recording_id: int,
    test_annotation_task,
    test_tag,
):
    """Two tasks of one recording count as 2 tasks but 1 recording."""
    from sonari import api

    recording = await api.recordings.get(db_session, test_recording_id)
    task2 = await api.annotation_tasks.create(
        db_session,
        annotation_project=test_annotation_project,
        recording=recording,
        start_time=1.0,
        end_time=2.0,
    )
    await db_session.commit()

    for task_id, n_events in ((test_annotation_task.id, 2), (task2.id, 1)):
        for _ in range(n_events):
            response = await auth_client.post(
                "/api/v1/sound_event_annotations/",
                params={"annotation_task_id": task_id},
                json={
                    "geometry": {"type": "TimeInterval", "coordinates": [0.1, 0.2]},
                    "tags": [{"key": test_tag.key, "value": test_tag.value}],
                },
            )
            assert response.status_code in [200, 201], response.text

    response = await auth_client.get(
        "/api/v1/annotation_projects/detail/species_counts/",
        params={"annotation_project_id": test_annotation_project.id},
    )
    assert response.status_code == 200, response.text
    item = next(i for i in response.json() if i["key"] == test_tag.key)
    assert (item["count"], item["task_count"], item["recording_count"]) == (3, 2, 1)

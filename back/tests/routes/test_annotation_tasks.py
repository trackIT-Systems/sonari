"""Tests for annotation task endpoints."""

import uuid

import pytest
from httpx import AsyncClient

from sonari import schemas


@pytest.mark.asyncio
async def test_get_annotation_tasks(auth_client: AsyncClient):
    """Test getting list of annotation tasks."""
    response = await auth_client.get("/api/v1/annotation_tasks/")
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert "total" in data
    assert "limit" in data
    assert "offset" in data


@pytest.mark.asyncio
async def test_get_annotation_tasks_with_filters(auth_client: AsyncClient):
    """Test getting annotation tasks with filters."""
    response = await auth_client.get(
        "/api/v1/annotation_tasks/",
        params={"limit": 3, "offset": 0},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["limit"] == 3
    assert data["offset"] == 0


@pytest.mark.asyncio
async def test_create_annotation_tasks(auth_client: AsyncClient):
    """Test creating annotation tasks."""
    # First create an annotation project with unique name
    project_name = f"Tasks Test Project {uuid.uuid4().hex[:8]}"
    project_response = await auth_client.post(
        "/api/v1/annotation_projects/",
        json={
            "name": project_name,
            "description": "Project for tasks test",
        },
    )
    assert project_response.status_code in [200, 201]
    project = project_response.json()
    project_id = project["id"]

    # Try to create tasks using recording ID 1 which should exist
    response = await auth_client.post(
        "/api/v1/annotation_tasks/",
        params={"annotation_project_id": project_id},
        json=[(1, {"start_time": 0, "end_time": 1})],
    )
    # Should return 200 with created tasks
    assert response.status_code in [200, 201]


@pytest.mark.asyncio
async def test_get_annotation_task_detail_not_found(auth_client: AsyncClient):
    """Test getting non-existent annotation task details."""
    fake_id = 999999
    response = await auth_client.get(
        "/api/v1/annotation_tasks/detail/",
        params={"annotation_task_id": fake_id},
    )
    # Should return 404 for non-existent task
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_get_annotation_task_detail(
    auth_client: AsyncClient,
    test_annotation_task: schemas.AnnotationTask,
):
    """Test getting annotation task details."""
    response = await auth_client.get(
        "/api/v1/annotation_tasks/detail/",
        params={"annotation_task_id": test_annotation_task.id},
    )
    assert response.status_code == 200
    data = response.json()
    
    # Validate response against schema
    task = schemas.AnnotationTask.model_validate(data)
    assert task.id == test_annotation_task.id
    assert task.start_time is not None
    assert task.end_time is not None


@pytest.mark.asyncio
async def test_get_annotation_task_detail_with_includes(
    auth_client: AsyncClient,
    test_annotation_task: schemas.AnnotationTask,
):
    """Test getting annotation task details with related data."""
    response = await auth_client.get(
        "/api/v1/annotation_tasks/detail/",
        params={
            "annotation_task_id": test_annotation_task.id,
            "include_recording": True,
            "include_annotation_project": True,
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == test_annotation_task.id
    # Check that related data is included
    assert "recording" in data or data.get("recording") is not None
    assert "annotation_project" in data or data.get("annotation_project") is not None


@pytest.mark.asyncio
async def test_delete_annotation_task_not_found(auth_client: AsyncClient):
    """Test deleting non-existent annotation task."""
    fake_id = 999999
    response = await auth_client.delete(
        "/api/v1/annotation_tasks/detail/",
        params={"annotation_task_id": fake_id},
    )
    # Should return 404 for non-existent task
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_get_annotation_tasks_stats(auth_client: AsyncClient):
    """Test getting annotation task statistics."""
    response = await auth_client.get("/api/v1/annotation_tasks/stats")
    # Stats endpoint may not be available in all configurations
    assert response.status_code in [200, 404]
    if response.status_code == 200:
        data = response.json()
        # Stats should have some expected fields
        assert isinstance(data, dict)


@pytest.mark.asyncio
async def test_get_annotation_tasks_index(auth_client: AsyncClient):
    """Test getting annotation task index."""
    response = await auth_client.get("/api/v1/annotation_tasks/index")
    # Index endpoint may not be available in all configurations
    assert response.status_code in [200, 404]
    if response.status_code == 200:
        data = response.json()
        assert "items" in data
        assert "total" in data



@pytest.mark.asyncio
async def test_filter_annotation_tasks_by_ids(
    auth_client: AsyncClient,
    test_annotation_task: schemas.AnnotationTask,
):
    """id__lst limits the tasks to the given ids (e.g. ticked table rows).

    The index endpoint uses the same AnnotationTaskFilter dependency; it is not
    routed in the test app (see test_get_annotation_tasks_index).
    """
    project = test_annotation_task.annotation_project_id
    for path in ("/api/v1/annotation_tasks/",):
        hit = await auth_client.get(
            path,
            params={"annotation_project__eq": project, "id__lst": f"{test_annotation_task.id},999999999", "limit": -1},
        )
        assert hit.status_code == 200, hit.text
        assert [t["id"] for t in hit.json()["items"]] == [test_annotation_task.id]

        miss = await auth_client.get(path, params={"annotation_project__eq": project, "id__lst": "999999999", "limit": -1})
        assert miss.status_code == 200
        assert miss.json()["items"] == []

        invalid = await auth_client.get(path, params={"annotation_project__eq": project, "id__lst": "abc", "limit": -1})
        assert invalid.status_code == 200
        assert invalid.json()["items"] == []


@pytest.mark.asyncio
async def test_filter_annotation_tasks_by_task_tag(
    auth_client: AsyncClient,
    db_session,
    test_annotation_task: schemas.AnnotationTask,
):
    """annotation_task_tag__key/value keeps only tasks with that task-level tag."""
    from sonari import api

    project = test_annotation_task.annotation_project_id
    params = {"annotation_project__eq": project, "limit": -1,
              "annotation_task_tag__key": "tour", "annotation_task_tag__value": "bulk"}
    before = await auth_client.get("/api/v1/annotation_tasks/", params=params)
    assert before.status_code == 200
    assert before.json()["items"] == []

    admin = await api.users.get_by_username(db_session, "admin")
    task = await api.annotation_tasks.get(db_session, test_annotation_task.id, include_tags=True)
    await api.annotation_tasks.add_tag(
        db_session, task, await api.tags.get_or_create(db_session, "tour", "bulk", admin), user=admin,
    )
    await db_session.commit()

    after = await auth_client.get("/api/v1/annotation_tasks/", params=params)
    assert [t["id"] for t in after.json()["items"]] == [test_annotation_task.id]

"""Tests for note endpoints."""

import pytest
from httpx import AsyncClient

from sonari import schemas


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
    # Should return 404 for non-existent note
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_get_note_detail(
    auth_client: AsyncClient,
    test_note: schemas.Note,
):
    """Test getting a specific note's details."""
    response = await auth_client.get(
        "/api/v1/notes/detail/",
        params={"note_id": test_note.id},
    )
    assert response.status_code == 200
    data = response.json()
    
    # Validate response against schema
    note = schemas.Note.model_validate(data)
    assert note.id == test_note.id
    assert note.message is not None


@pytest.mark.asyncio
async def test_update_note_not_found(auth_client: AsyncClient):
    """Test updating non-existent note."""
    response = await auth_client.patch(
        "/api/v1/notes/detail/",
        params={"note_id": 999999},
        json={"message": "Updated message"},
    )
    # Should return 404 for non-existent note
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_update_note_message(
    auth_client: AsyncClient,
    test_note: schemas.Note,
):
    """Test updating a note's message."""
    new_message = "Updated test message"
    response = await auth_client.patch(
        "/api/v1/notes/detail/",
        params={"note_id": test_note.id},
        json={"message": new_message},
    )
    assert response.status_code == 200
    data = response.json()
    
    # Validate response
    note = schemas.Note.model_validate(data)
    assert note.id == test_note.id
    assert note.message == new_message


@pytest.mark.asyncio
async def test_update_note_issue_flag(
    auth_client: AsyncClient,
    test_note: schemas.Note,
):
    """Test updating a note's issue flag."""
    response = await auth_client.patch(
        "/api/v1/notes/detail/",
        params={"note_id": test_note.id},
        json={"is_issue": True},
    )
    assert response.status_code == 200
    data = response.json()
    
    # Validate response
    note = schemas.Note.model_validate(data)
    assert note.id == test_note.id
    assert note.is_issue is True


@pytest.mark.asyncio
async def test_delete_note_not_found(auth_client: AsyncClient):
    """Test deleting non-existent note."""
    response = await auth_client.delete(
        "/api/v1/notes/detail/",
        params={"note_id": 999999},
    )
    # Should return 404 for non-existent note
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_delete_note(
    auth_client: AsyncClient,
    test_annotation_task: schemas.AnnotationTask,
    test_user,
):
    """Test deleting a note."""
    import uuid
    
    # Create a note specifically for deletion test
    message = f"Note to delete {uuid.uuid4().hex[:8]}"
    create_response = await auth_client.post(
        "/api/v1/annotation_tasks/detail/notes/",
        params={"annotation_task_id": test_annotation_task.id},
        json={
            "message": message,
            "is_issue": False,
        },
    )
    assert create_response.status_code == 200
    task_data = create_response.json()
    
    # Find the created note
    note_id = None
    for note in task_data.get("notes", []):
        if note["message"] == message:
            note_id = note["id"]
            break
    
    assert note_id is not None, "Created note not found in response"
    
    # Delete the note
    response = await auth_client.delete(
        "/api/v1/notes/detail/",
        params={"note_id": note_id},
    )
    assert response.status_code == 200
    
    # Verify deletion by trying to get it
    get_response = await auth_client.get(
        "/api/v1/notes/detail/",
        params={"note_id": note_id},
    )
    assert get_response.status_code == 404


@pytest.mark.asyncio
async def test_get_notes_validates_schema(auth_client: AsyncClient):
    """Test that note responses validate against Pydantic schema."""
    response = await auth_client.get("/api/v1/notes/")
    assert response.status_code == 200
    data = response.json()
    
    # Validate page structure
    page = schemas.Page[schemas.Note].model_validate(data)
    assert page.total >= 0
    assert page.limit > 0
    assert page.offset >= 0
    
    # Validate each note item
    for item in page.items:
        assert isinstance(item, schemas.Note)
        assert item.message is not None
        assert isinstance(item.is_issue, bool)


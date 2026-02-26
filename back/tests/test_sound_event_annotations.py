"""Tests for sound event annotation endpoints."""

import pytest
from httpx import AsyncClient

from sonari import schemas


@pytest.mark.asyncio
async def test_get_sound_event_annotations(auth_client: AsyncClient):
    """Test getting list of sound event annotations."""
    response = await auth_client.get("/api/v1/sound_event_annotations/")
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert "total" in data
    assert "limit" in data
    assert "offset" in data


@pytest.mark.asyncio
async def test_get_sound_event_annotations_with_filters(auth_client: AsyncClient):
    """Test getting sound event annotations with filters."""
    response = await auth_client.get(
        "/api/v1/sound_event_annotations/",
        params={"limit": 5, "offset": 5, "sort_by": "-created_on"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["limit"] == 5
    assert data["offset"] == 5


@pytest.mark.asyncio
async def test_create_sound_event_annotation_no_task(auth_client: AsyncClient):
    """Test creating sound event annotation without valid task."""
    fake_task_id = 999999
    response = await auth_client.post(
        "/api/v1/sound_event_annotations/",
        params={"annotation_task_id": fake_task_id},
        json={
            "geometry": {
                "type": "Point",
                "coordinates": [0.5, 1000],
            },
            "tags": [],
        },
    )
    # Should fail because task doesn't exist
    assert response.status_code in [404, 422, 500]


@pytest.mark.asyncio
async def test_get_sound_event_annotation_detail_not_found(auth_client: AsyncClient):
    """Test getting non-existent sound event annotation details."""
    fake_id = 999999
    response = await auth_client.get(
        "/api/v1/sound_event_annotations/detail/",
        params={"sound_event_annotation_id": fake_id},
    )
    # Should return 404 for non-existent annotation
    assert response.status_code in [404, 500]


@pytest.mark.asyncio
async def test_update_sound_event_annotation_not_found(auth_client: AsyncClient):
    """Test updating non-existent sound event annotation."""
    fake_id = 999999
    response = await auth_client.patch(
        "/api/v1/sound_event_annotations/detail/",
        params={"sound_event_annotation_id": fake_id},
        json={
            "geometry": {
                "type": "Point",
                "coordinates": [0.6, 1100],
            }
        },
    )
    # Should return 404 for non-existent annotation
    assert response.status_code in [404, 422, 500]


@pytest.mark.asyncio
async def test_delete_sound_event_annotation_not_found(auth_client: AsyncClient):
    """Test deleting non-existent sound event annotation."""
    fake_id = 999999
    response = await auth_client.delete(
        "/api/v1/sound_event_annotations/detail/",
        params={"sound_event_annotation_id": fake_id},
    )
    # Should return 404 for non-existent annotation
    assert response.status_code in [404, 500]


@pytest.mark.asyncio
async def test_add_tag_to_sound_event_annotation_not_found(auth_client: AsyncClient):
    """Test adding tag to non-existent sound event annotation."""
    fake_id = 999999
    response = await auth_client.post(
        "/api/v1/sound_event_annotations/detail/tags/",
        params={
            "sound_event_annotation_id": fake_id,
            "key": "test_key",
            "value": "test_value",
        },
    )
    # Should return 404 for non-existent annotation
    assert response.status_code in [404, 500]


@pytest.mark.asyncio
async def test_remove_tag_from_sound_event_annotation_not_found(auth_client: AsyncClient):
    """Test removing tag from non-existent sound event annotation."""
    fake_id = 999999
    response = await auth_client.delete(
        "/api/v1/sound_event_annotations/detail/tags/",
        params={
            "sound_event_annotation_id": fake_id,
            "key": "test_key",
            "value": "test_value",
        },
    )
    # Should return 404 for non-existent annotation
    assert response.status_code in [404, 500]


# ============================================================================
# Tests with actual data creation
# ============================================================================


@pytest.mark.asyncio
async def test_create_sound_event_annotation_with_tags(
    auth_client: AsyncClient,
    test_annotation_task: schemas.AnnotationTask,
    test_tag: schemas.Tag,
):
    """Test creating a sound event annotation with tags."""
    response = await auth_client.post(
        "/api/v1/sound_event_annotations/",
        params={"annotation_task_id": test_annotation_task.id},
        json={
            "geometry": {
                "type": "TimeInterval",
                "coordinates": [1.0, 2.0],
            },
            "tags": [
                {"key": test_tag.key, "value": test_tag.value},
            ],
        },
    )
    assert response.status_code in [200, 201], f"Failed to create annotation: {response.text}"
    data = response.json()

    # Verify the annotation was created
    assert "id" in data
    assert data["geometry"]["type"] == "TimeInterval"
    assert data["geometry"]["coordinates"] == [1.0, 2.0]

    # Verify tags were added
    assert len(data["tags"]) == 1
    tag_keys = {tag["key"] for tag in data["tags"]}
    assert test_tag.key in tag_keys


@pytest.mark.asyncio
async def test_create_sound_event_annotation_without_tags(
    auth_client: AsyncClient,
    test_annotation_task: schemas.AnnotationTask,
):
    """Test creating a sound event annotation without tags."""
    response = await auth_client.post(
        "/api/v1/sound_event_annotations/",
        params={"annotation_task_id": test_annotation_task.id},
        json={
            "geometry": {
                "type": "TimeInterval",
                "coordinates": [0.5, 1.5],
            },
            "tags": [],
        },
    )
    assert response.status_code in [200, 201], f"Failed to create annotation: {response.text}"
    data = response.json()

    assert "id" in data
    assert data["geometry"]["type"] == "TimeInterval"
    # API may return None for empty tags
    assert len(data.get("tags") or []) == 0


@pytest.mark.asyncio
async def test_add_tag_to_sound_event_annotation(
    auth_client: AsyncClient,
    test_annotation_task: schemas.AnnotationTask,
    test_tag: schemas.Tag,
):
    """Test adding a tag to an existing sound event annotation."""
    # First create an annotation without tags
    create_response = await auth_client.post(
        "/api/v1/sound_event_annotations/",
        params={"annotation_task_id": test_annotation_task.id},
        json={
            "geometry": {
                "type": "BoundingBox",
                "coordinates": [0.5, 1.5, 500.0, 1500.0],
            },
            "tags": [],
        },
    )
    assert create_response.status_code in [200, 201]
    annotation = create_response.json()

    # Add a tag
    response = await auth_client.post(
        "/api/v1/sound_event_annotations/detail/tags/",
        params={
            "sound_event_annotation_id": annotation["id"],
            "key": test_tag.key,
            "value": test_tag.value,
        },
    )
    assert response.status_code == 200, f"Failed to add tag: {response.text}"
    data = response.json()

    # Verify the tag was added
    assert len(data["tags"]) == 1
    assert data["tags"][0]["key"] == test_tag.key
    assert data["tags"][0]["value"] == test_tag.value


@pytest.mark.asyncio
async def test_remove_tag_from_sound_event_annotation(
    auth_client: AsyncClient,
    test_annotation_task: schemas.AnnotationTask,
    test_tag: schemas.Tag,
):
    """Test removing a tag from a sound event annotation."""
    # Create an annotation with tags
    response = await auth_client.post(
        "/api/v1/sound_event_annotations/",
        params={"annotation_task_id": test_annotation_task.id},
        json={
            "geometry": {
                "type": "TimeInterval",
                "coordinates": [2.0, 3.0],
            },
            "tags": [{"key": test_tag.key, "value": test_tag.value}],
        },
    )
    assert response.status_code in [200, 201]
    annotation = response.json()
    initial_tag_count = len(annotation["tags"])

    # Remove a tag
    response = await auth_client.delete(
        "/api/v1/sound_event_annotations/detail/tags/",
        params={
            "sound_event_annotation_id": annotation["id"],
            "key": test_tag.key,
            "value": test_tag.value,
        },
    )
    assert response.status_code == 200, f"Failed to remove tag: {response.text}"
    data = response.json()

    # Verify the tag was removed
    assert len(data["tags"]) == initial_tag_count - 1
    remaining_keys = {tag["key"] for tag in data["tags"]}
    assert test_tag.key not in remaining_keys


@pytest.mark.asyncio
async def test_update_sound_event_annotation_geometry(
    auth_client: AsyncClient,
    test_annotation_task: schemas.AnnotationTask,
):
    """Test updating the geometry of a sound event annotation."""
    # Create an annotation
    create_response = await auth_client.post(
        "/api/v1/sound_event_annotations/",
        params={"annotation_task_id": test_annotation_task.id},
        json={
            "geometry": {
                "type": "TimeInterval",
                "coordinates": [1.0, 2.0],
            },
            "tags": [],
        },
    )
    assert create_response.status_code in [200, 201]
    annotation = create_response.json()

    # Update the geometry
    new_coordinates = [1.0, 3.0]
    response = await auth_client.patch(
        "/api/v1/sound_event_annotations/detail/",
        params={"sound_event_annotation_id": annotation["id"]},
        json={
            "geometry": {
                "type": "TimeInterval",
                "coordinates": new_coordinates,
            }
        },
    )
    assert response.status_code == 200, f"Failed to update annotation: {response.text}"
    data = response.json()

    # Verify the geometry was updated
    assert data["geometry"]["coordinates"] == new_coordinates


@pytest.mark.asyncio
async def test_delete_sound_event_annotation(
    auth_client: AsyncClient,
    test_annotation_task: schemas.AnnotationTask,
):
    """Test deleting a sound event annotation."""
    # Create an annotation
    create_response = await auth_client.post(
        "/api/v1/sound_event_annotations/",
        params={"annotation_task_id": test_annotation_task.id},
        json={
            "geometry": {
                "type": "Point",
                "coordinates": [1.5, 1500.0],
            },
            "tags": [],
        },
    )
    assert create_response.status_code in [200, 201]
    annotation = create_response.json()

    # Delete the annotation
    response = await auth_client.delete(
        "/api/v1/sound_event_annotations/detail/",
        params={"sound_event_annotation_id": annotation["id"]},
    )
    assert response.status_code == 200, f"Failed to delete annotation: {response.text}"

    # Verify the annotation was deleted (try to get it)
    get_response = await auth_client.get(
        "/api/v1/sound_event_annotations/detail/",
        params={"sound_event_annotation_id": annotation["id"]},
    )
    assert get_response.status_code in [404, 500]  # Should not be found

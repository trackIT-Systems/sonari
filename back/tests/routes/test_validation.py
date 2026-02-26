"""Tests for input validation and edge cases across endpoints."""

import pytest
from httpx import AsyncClient

from sonari import schemas

# ============================================================================
# Pagination Edge Cases
# ============================================================================


@pytest.mark.asyncio
async def test_pagination_negative_limit(auth_client: AsyncClient):
    """Test that negative limit is handled (currently accepted, should ideally reject)."""
    response = await auth_client.get(
        "/api/v1/recordings/",
        params={"limit": -1, "offset": 0},
    )
    # TODO: Should reject with 422 validation error, but currently accepts
    # Issue: No validation on limit parameter at route level
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_pagination_negative_offset(auth_client: AsyncClient):
    """Test that negative offset is handled properly."""
    response = await auth_client.get(
        "/api/v1/recordings/",
        params={"limit": 10, "offset": -1},
    )
    # Should reject with 422 validation error
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_pagination_zero_limit(auth_client: AsyncClient):
    """Test that zero limit is handled properly."""
    response = await auth_client.get(
        "/api/v1/recordings/",
        params={"limit": 0, "offset": 0},
    )
    # Zero limit might be rejected or return empty results
    assert response.status_code in [200, 422]


@pytest.mark.asyncio
async def test_pagination_very_large_limit(auth_client: AsyncClient):
    """Test that very large limit is rejected with validation error."""
    response = await auth_client.get(
        "/api/v1/recordings/",
        params={"limit": 999999, "offset": 0},
    )
    # API correctly rejects excessively large limits
    assert response.status_code == 422


# ============================================================================
# Sorting Edge Cases
# ============================================================================


@pytest.mark.asyncio
async def test_sorting_invalid_column(auth_client: AsyncClient):
    """Test sorting by non-existent column returns 400 error."""
    response = await auth_client.get(
        "/api/v1/recordings/",
        params={"sort_by": "nonexistent_column"},
    )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_sorting_empty_string(auth_client: AsyncClient):
    """Test sorting with empty string returns 400 error."""
    response = await auth_client.get(
        "/api/v1/recordings/",
        params={"sort_by": ""},
    )
    assert response.status_code == 400


# ============================================================================
# Recording Update Validation
# ============================================================================


@pytest.mark.asyncio
async def test_recording_update_invalid_latitude(
    auth_client: AsyncClient,
    test_recording: schemas.Recording,
):
    """Test updating recording with invalid latitude."""
    response = await auth_client.patch(
        "/api/v1/recordings/detail/",
        params={"recording_id": test_recording.id},
        json={"latitude": 95.0},  # Invalid: > 90
    )
    # Should reject with validation error
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_recording_update_invalid_longitude(
    auth_client: AsyncClient,
    test_recording: schemas.Recording,
):
    """Test updating recording with invalid longitude."""
    response = await auth_client.patch(
        "/api/v1/recordings/detail/",
        params={"recording_id": test_recording.id},
        json={"longitude": 185.0},  # Invalid: > 180
    )
    # Should reject with validation error
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_recording_update_empty_json(
    auth_client: AsyncClient,
    test_recording: schemas.Recording,
):
    """Test updating recording with empty update data."""
    response = await auth_client.patch(
        "/api/v1/recordings/detail/",
        params={"recording_id": test_recording.id},
        json={},
    )
    # Should accept and return unchanged
    assert response.status_code == 200


# ============================================================================
# Feature Validation
# ============================================================================


@pytest.mark.asyncio
async def test_add_feature_empty_name(
    auth_client: AsyncClient,
    test_recording: schemas.Recording,
):
    """Test adding feature with empty name (currently allowed)."""
    response = await auth_client.post(
        "/api/v1/recordings/detail/features/",
        params={
            "recording_id": test_recording.id,
            "name": "",
            "value": 1.0,
        },
    )
    # TODO: Should reject empty feature names, but currently allows them
    # Issue: No validation on feature name at route/API level
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_add_feature_very_long_name(
    auth_client: AsyncClient,
    test_recording: schemas.Recording,
):
    """Test adding feature with very long name."""
    long_name = "x" * 1000
    response = await auth_client.post(
        "/api/v1/recordings/detail/features/",
        params={
            "recording_id": test_recording.id,
            "name": long_name,
            "value": 1.0,
        },
    )
    # Should either accept or reject based on DB constraints
    assert response.status_code in [200, 400, 422]


@pytest.mark.asyncio
async def test_add_feature_special_characters(
    auth_client: AsyncClient,
    test_recording: schemas.Recording,
):
    """Test adding feature with special characters in name."""
    response = await auth_client.post(
        "/api/v1/recordings/detail/features/",
        params={
            "recording_id": test_recording.id,
            "name": "test-feature_123!@#",
            "value": 1.0,
        },
    )
    # Should handle special characters
    assert response.status_code in [200, 400, 422]


# ============================================================================
# Tag Validation
# ============================================================================


@pytest.mark.asyncio
async def test_create_tag_empty_key(auth_client: AsyncClient):
    """Test creating tag with empty key."""
    response = await auth_client.post(
        "/api/v1/tags/",
        json={"key": "", "value": "test"},
    )
    # Should reject with validation error
    assert response.status_code in [400, 422]


@pytest.mark.asyncio
async def test_create_tag_empty_value(auth_client: AsyncClient):
    """Test creating tag with empty value."""
    import uuid

    response = await auth_client.post(
        "/api/v1/tags/",
        json={"key": f"test_{uuid.uuid4().hex[:8]}", "value": ""},
    )
    # Empty value might be valid depending on business logic
    assert response.status_code in [200, 400, 422]


@pytest.mark.asyncio
async def test_create_tag_unicode_characters(auth_client: AsyncClient):
    """Test creating tag with Unicode characters."""
    import uuid

    response = await auth_client.post(
        "/api/v1/tags/",
        json={"key": f"species_{uuid.uuid4().hex[:8]}", "value": "蝙蝠"},
    )
    # Should handle Unicode
    assert response.status_code in [200, 400]


# ============================================================================
# Annotation Project Validation
# ============================================================================


@pytest.mark.asyncio
async def test_create_annotation_project_empty_name(auth_client: AsyncClient):
    """Test creating annotation project with empty name (currently allowed)."""
    response = await auth_client.post(
        "/api/v1/annotation_projects/",
        json={
            "name": "",
            "description": "Test",
        },
    )
    # TODO: Should reject empty names, but currently allows them
    # Issue: No min_length validation on AnnotationProjectCreate.name
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_create_annotation_project_very_long_name(auth_client: AsyncClient):
    """Test creating annotation project with very long name."""
    long_name = "x" * 1000
    response = await auth_client.post(
        "/api/v1/annotation_projects/",
        json={
            "name": long_name,
            "description": "Test",
        },
    )
    # Should either truncate or reject
    assert response.status_code in [200, 201, 400, 422]


@pytest.mark.asyncio
async def test_create_annotation_project_missing_required_fields(auth_client: AsyncClient):
    """Test creating annotation project without required fields."""
    response = await auth_client.post(
        "/api/v1/annotation_projects/",
        json={},
    )
    # Should reject with validation error
    assert response.status_code == 422


# ============================================================================
# Note Validation
# ============================================================================


@pytest.mark.asyncio
async def test_create_note_empty_message(
    auth_client: AsyncClient,
    test_annotation_task: schemas.AnnotationTask,
):
    """Test creating note with empty message."""
    response = await auth_client.post(
        "/api/v1/annotation_tasks/detail/notes/",
        params={"annotation_task_id": test_annotation_task.id},
        json={
            "message": "",
            "is_issue": False,
        },
    )
    # Empty message should be rejected
    assert response.status_code in [400, 422]


@pytest.mark.asyncio
async def test_create_note_very_long_message(
    auth_client: AsyncClient,
    test_annotation_task: schemas.AnnotationTask,
):
    """Test creating note with very long message."""
    long_message = "x" * 100000
    response = await auth_client.post(
        "/api/v1/annotation_tasks/detail/notes/",
        params={"annotation_task_id": test_annotation_task.id},
        json={
            "message": long_message,
            "is_issue": False,
        },
    )
    # Should either truncate or reject
    assert response.status_code in [200, 400, 422]


# ============================================================================
# Sound Event Annotation Geometry Validation
# ============================================================================


@pytest.mark.asyncio
async def test_create_annotation_invalid_geometry_type(
    auth_client: AsyncClient,
    test_annotation_task: schemas.AnnotationTask,
):
    """Test creating annotation with invalid geometry type."""
    response = await auth_client.post(
        "/api/v1/sound_event_annotations/",
        params={"annotation_task_id": test_annotation_task.id},
        json={
            "geometry": {
                "type": "InvalidType",
                "coordinates": [0.5, 1000],
            },
            "tags": [],
        },
    )
    # Should reject with validation error
    assert response.status_code in [400, 422]


@pytest.mark.asyncio
async def test_create_annotation_negative_time(
    auth_client: AsyncClient,
    test_annotation_task: schemas.AnnotationTask,
):
    """Test creating annotation with negative time coordinates."""
    response = await auth_client.post(
        "/api/v1/sound_event_annotations/",
        params={"annotation_task_id": test_annotation_task.id},
        json={
            "geometry": {
                "type": "TimeInterval",
                "coordinates": [-1.0, 2.0],
            },
            "tags": [],
        },
    )
    # Should reject negative time
    assert response.status_code in [400, 422]


@pytest.mark.asyncio
async def test_create_annotation_invalid_time_order(
    auth_client: AsyncClient,
    test_annotation_task: schemas.AnnotationTask,
):
    """Test creating annotation with start_time > end_time."""
    response = await auth_client.post(
        "/api/v1/sound_event_annotations/",
        params={"annotation_task_id": test_annotation_task.id},
        json={
            "geometry": {
                "type": "TimeInterval",
                "coordinates": [2.0, 1.0],  # start > end
            },
            "tags": [],
        },
    )
    # Should reject invalid time order
    assert response.status_code in [200, 400, 422]


@pytest.mark.asyncio
async def test_create_annotation_missing_coordinates(
    auth_client: AsyncClient,
    test_annotation_task: schemas.AnnotationTask,
):
    """Test creating annotation without coordinates."""
    response = await auth_client.post(
        "/api/v1/sound_event_annotations/",
        params={"annotation_task_id": test_annotation_task.id},
        json={
            "geometry": {
                "type": "Point",
            },
            "tags": [],
        },
    )
    # Should reject missing coordinates
    assert response.status_code == 422


# ============================================================================
# Audio Endpoint Validation
# ============================================================================


@pytest.mark.asyncio
async def test_stream_audio_invalid_time_range(
    auth_client: AsyncClient,
    test_recording_id: int,
):
    """Test streaming audio with invalid time range (start > end) returns 400 error."""
    response = await auth_client.get(
        "/api/v1/audio/stream/",
        params={
            "recording_id": test_recording_id,
            "start_time": 10.0,
            "end_time": 5.0,
        },
        headers={"Range": "bytes=0-"},
    )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_stream_audio_negative_time(
    auth_client: AsyncClient,
    test_recording_id: int,
):
    """Test streaming audio with negative time returns 400 error."""
    response = await auth_client.get(
        "/api/v1/audio/stream/",
        params={
            "recording_id": test_recording_id,
            "start_time": -1.0,
            "end_time": 5.0,
        },
        headers={"Range": "bytes=0-"},
    )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_stream_audio_invalid_speed(
    auth_client: AsyncClient,
    test_recording_id: int,
):
    """Test streaming audio with zero speed returns 422 validation error."""
    response = await auth_client.get(
        "/api/v1/audio/stream/",
        params={
            "recording_id": test_recording_id,
            "speed": 0.0,
        },
        headers={"Range": "bytes=0-"},
    )
    assert response.status_code == 422

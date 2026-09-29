"""Tests for bulk annotation task operations."""

import uuid
from unittest.mock import patch

import pytest
from httpx import AsyncClient

from sonari import api, schemas


async def _create_task(
    db_session,
    project: schemas.AnnotationProject,
    recording_id: int,
    start: float = 0.0,
    end: float = 1.0,
) -> schemas.AnnotationTask:
    recording = await api.recordings.get(db_session, recording_id)
    task = await api.annotation_tasks.create(
        db_session,
        annotation_project=project,
        recording=recording,
        start_time=start,
        end_time=end,
    )
    await db_session.commit()
    return task


async def _create_sea_with_tag(
    auth_client: AsyncClient,
    task: schemas.AnnotationTask,
    tag: schemas.Tag,
) -> dict:
    response = await auth_client.post(
        "/api/v1/sound_event_annotations/",
        params={"annotation_task_id": task.id},
        json={
            "geometry": {"type": "TimeInterval", "coordinates": [0.1, 0.2]},
            "tags": [{"key": tag.key, "value": tag.value}],
        },
    )
    assert response.status_code in [200, 201], response.text
    return response.json()


@pytest.mark.asyncio
async def test_bulk_add_badge_updates_and_skips_duplicate(
    auth_client: AsyncClient,
    db_session,
    test_annotation_project: schemas.AnnotationProject,
    test_recording_id: int,
    test_annotation_task: schemas.AnnotationTask,
):
    """Duplicate badges are skipped; other tasks are updated."""
    task2 = await _create_task(db_session, test_annotation_project, test_recording_id, 1.0, 2.0)

    first = await auth_client.post(
        "/api/v1/annotation_tasks/detail/badges/",
        params={"annotation_task_id": test_annotation_task.id, "state": "completed"},
    )
    assert first.status_code in [200, 201]

    response = await auth_client.post(
        "/api/v1/annotation_tasks/bulk/badges/",
        params={"annotation_project__eq": test_annotation_project.id},
        json={
            "annotation_task_ids": [test_annotation_task.id, task2.id],
            "state": "completed",
        },
    )
    assert response.status_code == 200, response.text
    data = schemas.AnnotationTaskBulkResult.model_validate(response.json())
    assert data.tasks_targeted == 2
    assert data.tasks_updated == 1
    assert data.tasks_skipped == 1


@pytest.mark.asyncio
async def test_bulk_replace_sound_event_tags(
    auth_client: AsyncClient,
    db_session,
    test_annotation_project: schemas.AnnotationProject,
    test_recording_id: int,
    test_annotation_task: schemas.AnnotationTask,
    test_tag: schemas.Tag,
):
    """Replace old sound event tag with a new tag across tasks."""
    task2 = await _create_task(db_session, test_annotation_project, test_recording_id, 2.0, 3.0)
    await _create_sea_with_tag(auth_client, test_annotation_task, test_tag)
    await _create_sea_with_tag(auth_client, task2, test_tag)

    new_key = f"new_species_{uuid.uuid4().hex[:8]}"
    response = await auth_client.post(
        "/api/v1/annotation_tasks/bulk/sound_event_tags/replace/",
        params={"annotation_project__eq": test_annotation_project.id},
        json={
            "annotation_task_ids": [test_annotation_task.id, task2.id],
            "old_tag": {"key": test_tag.key, "value": test_tag.value},
            "new_tag": {"key": new_key, "value": "bat"},
        },
    )
    assert response.status_code == 200, response.text
    data = schemas.AnnotationTaskBulkResult.model_validate(response.json())
    assert data.tasks_targeted == 2
    assert data.tasks_updated == 2
    assert data.sound_events_updated == 2

    detail = await auth_client.get(
        "/api/v1/annotation_tasks/detail/",
        params={
            "annotation_task_id": test_annotation_task.id,
            "include_sound_event_annotations": True,
            "include_sound_event_tags": True,
        },
    )
    assert detail.status_code == 200
    payload = detail.json()
    tags = (payload.get("sound_event_annotations") or [])[0].get("tags") or []
    assert any(t["key"] == new_key for t in tags)


@pytest.mark.asyncio
async def test_bulk_add_to_tagged_keeps_filter_tag(
    auth_client: AsyncClient,
    db_session,
    test_annotation_project: schemas.AnnotationProject,
    test_recording_id: int,
    test_annotation_task: schemas.AnnotationTask,
    test_tag: schemas.Tag,
):
    """add_to_tagged adds new_tag on SEAs with old_tag without removing old_tag."""
    await _create_sea_with_tag(auth_client, test_annotation_task, test_tag)
    added_key = f"extra_{uuid.uuid4().hex[:8]}"

    response = await auth_client.post(
        "/api/v1/annotation_tasks/bulk/sound_event_tags/replace/",
        params={"annotation_project__eq": test_annotation_project.id},
        json={
            "annotation_task_ids": [test_annotation_task.id],
            "old_tag": {"key": test_tag.key, "value": test_tag.value},
            "new_tag": {"key": added_key, "value": "bat"},
            "add_to_tagged": True,
        },
    )
    assert response.status_code == 200, response.text
    data = schemas.AnnotationTaskBulkResult.model_validate(response.json())
    assert data.sound_events_updated == 1

    detail = await auth_client.get(
        "/api/v1/annotation_tasks/detail/",
        params={
            "annotation_task_id": test_annotation_task.id,
            "include_sound_event_annotations": True,
            "include_sound_event_tags": True,
        },
    )
    tags = (detail.json().get("sound_event_annotations") or [])[0].get("tags") or []
    keys = {t["key"] for t in tags}
    assert test_tag.key in keys
    assert added_key in keys


@pytest.mark.asyncio
async def test_bulk_replace_multiple_tasks_same_chunk(
    auth_client: AsyncClient,
    db_session,
    test_annotation_project: schemas.AnnotationProject,
    test_recording_id: int,
    test_annotation_task: schemas.AnnotationTask,
    test_tag: schemas.Tag,
):
    """All tasks in one bulk chunk are updated (no expire-on-commit failures)."""
    task2 = await _create_task(db_session, test_annotation_project, test_recording_id, 2.0, 3.0)
    task3 = await _create_task(db_session, test_annotation_project, test_recording_id, 3.0, 4.0)
    for task in (test_annotation_task, task2, task3):
        await _create_sea_with_tag(auth_client, task, test_tag)

    new_key = f"chunk_species_{uuid.uuid4().hex[:8]}"
    task_ids = [test_annotation_task.id, task2.id, task3.id]
    response = await auth_client.post(
        "/api/v1/annotation_tasks/bulk/sound_event_tags/replace/",
        params={"annotation_project__eq": test_annotation_project.id},
        json={
            "annotation_task_ids": task_ids,
            "old_tag": {"key": test_tag.key, "value": test_tag.value},
            "new_tag": {"key": new_key, "value": "bat"},
        },
    )
    assert response.status_code == 200, response.text
    data = schemas.AnnotationTaskBulkResult.model_validate(response.json())
    assert data.tasks_targeted == 3
    assert data.tasks_updated == 3
    assert data.sound_events_updated == 3
    assert data.failures == []

    for task_id in task_ids:
        detail = await auth_client.get(
            "/api/v1/annotation_tasks/detail/",
            params={
                "annotation_task_id": task_id,
                "include_sound_event_annotations": True,
                "include_sound_event_tags": True,
            },
        )
        assert detail.status_code == 200
        tags = (detail.json().get("sound_event_annotations") or [])[0].get("tags") or []
        assert any(t["key"] == new_key for t in tags)


@pytest.mark.asyncio
async def test_bulk_replace_when_new_tag_already_present_does_not_fail_chunk(
    auth_client: AsyncClient,
    db_session,
    test_annotation_project: schemas.AnnotationProject,
    test_recording_id: int,
    test_tag: schemas.Tag,
    test_user,
):
    """Replacing old with new must not break the chunk when new tag already exists on a SEA."""
    task1 = await _create_task(db_session, test_annotation_project, test_recording_id, 0.0, 1.0)
    task2 = await _create_task(db_session, test_annotation_project, test_recording_id, 2.0, 3.0)
    new_key = f"dup_target_{uuid.uuid4().hex[:8]}"
    await api.tags.get_or_create(
        db_session,
        new_key,
        "bat",
        schemas.SimpleUser.model_validate(test_user),
    )
    await db_session.commit()

    both_tags = await auth_client.post(
        "/api/v1/sound_event_annotations/",
        params={"annotation_task_id": task1.id},
        json={
            "geometry": {"type": "TimeInterval", "coordinates": [0.1, 0.2]},
            "tags": [
                {"key": test_tag.key, "value": test_tag.value},
                {"key": new_key, "value": "bat"},
            ],
        },
    )
    assert both_tags.status_code in [200, 201], both_tags.text
    await _create_sea_with_tag(auth_client, task2, test_tag)

    response = await auth_client.post(
        "/api/v1/annotation_tasks/bulk/sound_event_tags/replace/",
        params={"annotation_project__eq": test_annotation_project.id},
        json={
            "annotation_task_ids": [task1.id, task2.id],
            "old_tag": {"key": test_tag.key, "value": test_tag.value},
            "new_tag": {"key": new_key, "value": "bat"},
        },
    )
    assert response.status_code == 200, response.text
    data = schemas.AnnotationTaskBulkResult.model_validate(response.json())
    assert data.failures == []
    assert data.tasks_updated == 2
    assert data.sound_events_updated == 2


@pytest.mark.asyncio
async def test_bulk_target_by_filter_only(
    auth_client: AsyncClient,
    db_session,
    test_annotation_project: schemas.AnnotationProject,
    test_recording_id: int,
    test_annotation_task: schemas.AnnotationTask,
):
    """Omitting task IDs targets all tasks matching the filter."""
    task2 = await _create_task(db_session, test_annotation_project, test_recording_id, 3.0, 4.0)

    response = await auth_client.post(
        "/api/v1/annotation_tasks/bulk/badges/",
        params={"annotation_project__eq": test_annotation_project.id},
        json={"state": "verified"},
    )
    assert response.status_code == 200, response.text
    data = schemas.AnnotationTaskBulkResult.model_validate(response.json())
    assert data.tasks_targeted >= 2

    for task_id in (test_annotation_task.id, task2.id):
        detail = await auth_client.get(
            "/api/v1/annotation_tasks/detail/",
            params={
                "annotation_task_id": task_id,
                "include_status_badges": True,
            },
        )
        assert detail.status_code == 200
        task = schemas.AnnotationTask.model_validate(detail.json())
        assert any(b.state == "verified" for b in (task.status_badges or []))


@pytest.mark.asyncio
async def test_bulk_max_tasks_limit(
    auth_client: AsyncClient,
    test_annotation_project: schemas.AnnotationProject,
    test_annotation_task: schemas.AnnotationTask,
):
    """Reject bulk operations that exceed MAX_BULK_TASKS."""
    assert test_annotation_task.annotation_project_id == test_annotation_project.id
    with patch("sonari.api.annotation_tasks.MAX_BULK_TASKS", 0):
        response = await auth_client.post(
            "/api/v1/annotation_tasks/bulk/badges/",
            params={"annotation_project__eq": test_annotation_project.id},
            json={"state": "completed"},
        )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_bulk_sound_event_tag_summary(
    auth_client: AsyncClient,
    db_session,
    test_annotation_project: schemas.AnnotationProject,
    test_recording_id: int,
    test_annotation_task: schemas.AnnotationTask,
    test_tag: schemas.Tag,
):
    """Tag summary aggregates across all targeted tasks, not only the current page."""
    task2 = await _create_task(db_session, test_annotation_project, test_recording_id, 4.0, 5.0)
    await _create_sea_with_tag(auth_client, test_annotation_task, test_tag)
    await _create_sea_with_tag(auth_client, task2, test_tag)

    response = await auth_client.post(
        "/api/v1/annotation_tasks/bulk/sound_event_tags/summary/",
        params={"annotation_project__eq": test_annotation_project.id},
        json={"annotation_task_ids": [test_annotation_task.id, task2.id]},
    )
    assert response.status_code == 200, response.text
    data = response.json()
    match = next(
        (row for row in data if row["key"] == test_tag.key and row["value"] == test_tag.value),
        None,
    )
    assert match is not None
    assert match["count"] == 2


@pytest.mark.asyncio
async def test_bulk_replace_sound_event_tags_replace_all(
    auth_client: AsyncClient,
    db_session,
    test_annotation_project: schemas.AnnotationProject,
    test_recording_id: int,
    test_annotation_task: schemas.AnnotationTask,
    test_tag: schemas.Tag,
):
    """replace_all removes every tag on each sound event and applies the new tag."""
    await _create_sea_with_tag(auth_client, test_annotation_task, test_tag)
    new_key = f"after_all_{uuid.uuid4().hex[:8]}"

    response = await auth_client.post(
        "/api/v1/annotation_tasks/bulk/sound_event_tags/replace/",
        params={"annotation_project__eq": test_annotation_project.id},
        json={
            "annotation_task_ids": [test_annotation_task.id],
            "replace_all": True,
            "new_tag": {"key": new_key, "value": "bat"},
        },
    )
    assert response.status_code == 200, response.text
    result = schemas.AnnotationTaskBulkResult.model_validate(response.json())
    assert result.sound_events_updated == 1

    detail = await auth_client.get(
        "/api/v1/annotation_tasks/detail/",
        params={
            "annotation_task_id": test_annotation_task.id,
            "include_sound_event_annotations": True,
            "include_sound_event_tags": True,
        },
    )
    tags = (detail.json().get("sound_event_annotations") or [])[0].get("tags") or []
    assert len(tags) == 1
    assert tags[0]["key"] == new_key


@pytest.mark.asyncio
async def test_bulk_add_tag_to_all_sound_events_without_old_tag(
    auth_client: AsyncClient,
    test_annotation_task: schemas.AnnotationTask,
    test_annotation_project: schemas.AnnotationProject,
):
    """Omitting old_tag adds the new tag to every sound event on targeted tasks."""
    create = await auth_client.post(
        "/api/v1/sound_event_annotations/",
        params={"annotation_task_id": test_annotation_task.id},
        json={
            "geometry": {"type": "TimeInterval", "coordinates": [0.2, 0.3]},
            "tags": [],
        },
    )
    assert create.status_code in [200, 201]

    new_key = f"added_{uuid.uuid4().hex[:8]}"
    response = await auth_client.post(
        "/api/v1/annotation_tasks/bulk/sound_event_tags/replace/",
        params={"annotation_project__eq": test_annotation_project.id},
        json={
            "annotation_task_ids": [test_annotation_task.id],
            "new_tag": {"key": new_key, "value": "bat"},
        },
    )
    assert response.status_code == 200, response.text
    result = schemas.AnnotationTaskBulkResult.model_validate(response.json())
    assert result.sound_events_updated >= 1


@pytest.mark.asyncio
async def test_bulk_intersects_explicit_ids_with_filter(
    auth_client: AsyncClient,
    db_session,
    test_annotation_project: schemas.AnnotationProject,
    test_recording_id: int,
    test_annotation_task: schemas.AnnotationTask,
):
    """Task IDs outside the filter are not updated."""
    other_project = await api.annotation_projects.create(
        db_session,
        name=f"other_{uuid.uuid4().hex[:8]}",
        description="other",
        annotation_instructions="",
    )
    await db_session.commit()
    foreign_task = await _create_task(db_session, other_project, test_recording_id, 5.0, 6.0)

    response = await auth_client.post(
        "/api/v1/annotation_tasks/bulk/badges/",
        params={"annotation_project__eq": test_annotation_project.id},
        json={
            "annotation_task_ids": [test_annotation_task.id, foreign_task.id],
            "state": "completed",
        },
    )
    assert response.status_code == 200, response.text
    data = schemas.AnnotationTaskBulkResult.model_validate(response.json())
    assert data.tasks_targeted == 1
    assert data.tasks_updated == 1

    foreign_detail = await auth_client.get(
        "/api/v1/annotation_tasks/detail/",
        params={
            "annotation_task_id": foreign_task.id,
            "include_status_badges": True,
        },
    )
    foreign = schemas.AnnotationTask.model_validate(foreign_detail.json())
    assert not any(b.state == "completed" for b in (foreign.status_badges or []))


@pytest.mark.asyncio
async def test_bulk_replace_removes_confidence_for_human_user(
    auth_client: AsyncClient,
    db_session,
    test_annotation_project: schemas.AnnotationProject,
    test_annotation_task: schemas.AnnotationTask,
    test_tag: schemas.Tag,
):
    """Bulk tag replace by a normal user strips ML confidence features."""
    sea = await _create_sea_with_tag(auth_client, test_annotation_task, test_tag)
    annotation = await api.sound_event_annotations.get(
        db_session,
        sea["id"],
        include_features=True,
    )
    await api.sound_event_annotations.add_feature(
        db_session,
        annotation,
        schemas.Feature(name="detection_confidence", value=0.88),
    )
    await db_session.commit()

    new_key = f"human_edit_{uuid.uuid4().hex[:8]}"
    response = await auth_client.post(
        "/api/v1/annotation_tasks/bulk/sound_event_tags/replace/",
        params={"annotation_project__eq": test_annotation_project.id},
        json={
            "annotation_task_ids": [test_annotation_task.id],
            "old_tag": {"key": test_tag.key, "value": test_tag.value},
            "new_tag": {"key": new_key, "value": "bat"},
        },
    )
    assert response.status_code == 200, response.text

    detail = await auth_client.get(
        "/api/v1/sound_event_annotations/detail/",
        params={
            "sound_event_annotation_id": sea["id"],
            "include_features": True,
        },
    )
    assert detail.status_code == 200
    features = detail.json().get("features") or []
    assert not any(f["name"] in ("detection_confidence", "species_confidence") for f in features)

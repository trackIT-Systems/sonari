"""Tests for adding and removing the status badge of a single task."""

import pytest
from httpx import AsyncClient
from soundevent import data
from sqlalchemy.ext.asyncio import AsyncSession

from sonari import api, schemas

BADGES = "/api/v1/annotation_tasks/detail/badges/"


@pytest.fixture
async def task_with_sound_event(
    db_session: AsyncSession,
    test_annotation_task: schemas.AnnotationTask,
) -> schemas.AnnotationTask:
    admin = await api.users.get_by_username(db_session, "admin")
    await api.sound_event_annotations.create(
        db_session,
        test_annotation_task,
        data.TimeInterval(coordinates=[0.1, 0.2]),
        created_by=admin,
    )
    await db_session.commit()
    return test_annotation_task


@pytest.mark.asyncio
async def test_add_badge_returns_only_the_badges(auth_client: AsyncClient, task_with_sound_event):
    """The response carries the badges (with their user), not the sound events."""
    response = await auth_client.post(
        BADGES,
        params={"annotation_task_id": task_with_sound_event.id, "state": "completed"},
    )
    assert response.status_code == 200, response.text
    task = response.json()
    assert task["id"] == task_with_sound_event.id
    assert [badge["state"] for badge in task["status_badges"]] == ["completed"]
    assert task["status_badges"][0]["user"] is not None
    # Not loaded: the task has a sound event, the response lists none
    assert not task["sound_event_annotations"]


@pytest.mark.asyncio
async def test_add_badge_twice_is_refused(auth_client: AsyncClient, test_annotation_task):
    params = {"annotation_task_id": test_annotation_task.id, "state": "verified"}
    assert (await auth_client.post(BADGES, params=params)).status_code == 200
    assert (await auth_client.post(BADGES, params=params)).status_code == 409


@pytest.mark.asyncio
async def test_remove_badge_returns_the_remaining_badges(auth_client: AsyncClient, task_with_sound_event):
    task_id = task_with_sound_event.id
    for state in ("completed", "assigned"):
        added = await auth_client.post(BADGES, params={"annotation_task_id": task_id, "state": state})
        assert added.status_code == 200, added.text

    response = await auth_client.delete(BADGES, params={"annotation_task_id": task_id, "state": "completed"})
    assert response.status_code == 200, response.text
    task = response.json()
    assert [badge["state"] for badge in task["status_badges"]] == ["assigned"]
    assert not task["sound_event_annotations"]


@pytest.mark.asyncio
async def test_task_detail_still_has_its_sound_events_after_a_badge(
    auth_client: AsyncClient,
    task_with_sound_event,
):
    """The slim task cached by the badge request must not stand in for the full one."""
    task_id = task_with_sound_event.id
    added = await auth_client.post(BADGES, params={"annotation_task_id": task_id, "state": "completed"})
    assert added.status_code == 200, added.text

    detail = await auth_client.get(
        "/api/v1/annotation_tasks/detail/",
        params={
            "annotation_task_id": task_id,
            "include_sound_event_annotations": True,
            "include_status_badges": True,
        },
    )
    assert detail.status_code == 200, detail.text
    task = detail.json()
    assert len(task["sound_event_annotations"]) == 1
    assert [badge["state"] for badge in task["status_badges"]] == ["completed"]

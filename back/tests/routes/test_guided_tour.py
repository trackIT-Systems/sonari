"""Tests for guided tour annotation projects."""

import pytest
from httpx import AsyncClient
from soundevent import data
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from sonari import api, models, schemas
from sonari.services.guided_tour import (
    _delete_project_tasks,
    get_template_project,
    guided_tour_template_name,
)


async def _ensure_template(
    db_session: AsyncSession,
    test_recording_id: int,
    variant: str,
) -> schemas.AnnotationProject:
    existing = await get_template_project(db_session, variant)
    if existing is not None:
        return existing

    project = await api.annotation_projects.create(
        db_session,
        name=guided_tour_template_name(variant),
        description="Template for guided tours",
        is_guided_tour=True,
        guided_tour_variant=variant,
        guided_tour_owner_user_id=None,
    )
    recording = await api.recordings.get(db_session, test_recording_id)
    await api.annotation_tasks.create(
        db_session,
        annotation_project=project,
        recording=recording,
        start_time=0.0,
        end_time=min(1.0, recording.duration) if recording.duration else 1.0,
    )
    await db_session.commit()
    return project


@pytest.fixture
async def guided_tour_bird_template(
    db_session: AsyncSession,
    test_recording_id: int,
) -> schemas.AnnotationProject:
    """Hidden bird template with one task."""
    return await _ensure_template(db_session, test_recording_id, "bird")


@pytest.fixture
async def guided_tour_bat_template(
    db_session: AsyncSession,
    test_recording_id: int,
) -> schemas.AnnotationProject:
    """Hidden bat template with one task."""
    return await _ensure_template(db_session, test_recording_id, "bat")


@pytest.mark.asyncio
async def test_guided_tour_available_variants(
    auth_client: AsyncClient,
    guided_tour_bird_template: schemas.AnnotationProject,
    guided_tour_bat_template: schemas.AnnotationProject,
):
    resp = await auth_client.get("/api/v1/annotation_projects/guided_tour/")
    assert resp.status_code == 200
    variants = resp.json()["variants"]
    assert "bird" in variants
    assert "bat" in variants


@pytest.mark.asyncio
async def test_guided_tour_hidden_from_list(
    auth_client: AsyncClient,
    guided_tour_bird_template: schemas.AnnotationProject,
):
    create_resp = await auth_client.post(
        "/api/v1/annotation_projects/guided_tour/",
        json={"variant": "bird", "reset": False},
    )
    assert create_resp.status_code == 200
    tour_id = create_resp.json()["annotation_project_id"]

    list_resp = await auth_client.get("/api/v1/annotation_projects/", params={"limit": 100})
    assert list_resp.status_code == 200
    ids = [item["id"] for item in list_resp.json()["items"]]
    assert tour_id not in ids
    assert guided_tour_bird_template.id not in ids

    detail_resp = await auth_client.get(
        "/api/v1/annotation_projects/detail/",
        params={"annotation_project_id": tour_id},
    )
    assert detail_resp.status_code == 200
    assert detail_resp.json()["is_guided_tour"] is True
    assert detail_resp.json()["guided_tour_variant"] == "bird"


@pytest.mark.asyncio
async def test_guided_tour_ensure_idempotent(
    auth_client: AsyncClient,
    guided_tour_bird_template: schemas.AnnotationProject,
):
    first = await auth_client.post(
        "/api/v1/annotation_projects/guided_tour/",
        json={"variant": "bird", "reset": False},
    )
    assert first.status_code == 200

    second = await auth_client.post(
        "/api/v1/annotation_projects/guided_tour/",
        json={"variant": "bird", "reset": False},
    )
    assert second.status_code == 200
    assert second.json()["created"] is False
    assert second.json()["annotation_project_id"] == first.json()["annotation_project_id"]


@pytest.mark.asyncio
async def test_guided_tour_two_variants_per_user(
    auth_client: AsyncClient,
    guided_tour_bird_template: schemas.AnnotationProject,
    guided_tour_bat_template: schemas.AnnotationProject,
):
    bird = await auth_client.post(
        "/api/v1/annotation_projects/guided_tour/",
        json={"variant": "bird", "reset": False},
    )
    bat = await auth_client.post(
        "/api/v1/annotation_projects/guided_tour/",
        json={"variant": "bat", "reset": False},
    )
    assert bird.status_code == 200
    assert bat.status_code == 200
    assert bird.json()["annotation_project_id"] != bat.json()["annotation_project_id"]


@pytest.mark.asyncio
async def test_guided_tour_missing_template(
    auth_client: AsyncClient,
    db_session: AsyncSession,
):
    templates, _ = await api.annotation_projects.get_many(
        db_session,
        limit=-1,
        filters=[
            models.AnnotationProject.is_guided_tour.is_(True),
            models.AnnotationProject.guided_tour_owner_user_id.is_(None),
        ],
    )
    for template in templates:
        await _delete_project_tasks(db_session, template)
        await api.annotation_projects.delete(db_session, template)
    await db_session.commit()

    resp = await auth_client.post(
        "/api/v1/annotation_projects/guided_tour/",
        json={"variant": "bird", "reset": False},
    )
    assert resp.status_code == 404


async def _template_with_tagged_event(
    db_session: AsyncSession,
    test_recording_id: int,
) -> schemas.AnnotationProject:
    """Bat template whose single task has one tagged sound event."""
    template = await _ensure_template(db_session, test_recording_id, "bat")
    await _delete_project_tasks(db_session, template)
    recording = await api.recordings.get(db_session, test_recording_id)
    await api.annotation_tasks.create(
        db_session,
        annotation_project=template,
        recording=recording,
        start_time=0.0,
        end_time=0.25,
    )
    admin = await api.users.get_by_username(db_session, "admin")
    tasks, _ = await api.annotation_tasks.get_many(
        db_session,
        filters=[models.AnnotationTask.annotation_project_id == template.id],
    )
    sea = await api.sound_event_annotations.create(
        db_session,
        tasks[0],
        data.TimeInterval(coordinates=[0.1, 0.2]),
        created_by=admin,
    )
    sea = await api.sound_event_annotations.get(db_session, sea.id, include_tags=True)
    tag = await api.tags.get_or_create(db_session, "this", "is wrong", admin)
    await api.sound_event_annotations.add_tag(db_session, sea, tag, admin)
    await db_session.commit()
    return template


async def _tour_contents(db_session: AsyncSession, project_id: int):
    tasks, _ = await api.annotation_tasks.get_many(
        db_session,
        filters=[models.AnnotationTask.annotation_project_id == project_id],
        include_sound_event_annotations=True,
        include_sound_event_tags=True,
        include_status_badges=True,
    )
    return tasks


@pytest.mark.asyncio
async def test_guided_tour_clone_copies_sound_events_and_tags(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_recording_id: int,
):
    await _template_with_tagged_event(db_session, test_recording_id)
    resp = await auth_client.post(
        "/api/v1/annotation_projects/guided_tour/",
        json={"variant": "bat", "reset": True},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["resume_annotation_task_id"] == body["first_annotation_task_id"]

    tasks = await _tour_contents(db_session, body["annotation_project_id"])
    assert len(tasks) == 1
    [sea] = tasks[0].sound_event_annotations
    assert sea.geometry.type == "TimeInterval"
    assert [(t.key, t.value) for t in sea.tags] == [("this", "is wrong")]


@pytest.mark.asyncio
async def test_guided_tour_reset_rolls_back_user_changes(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_recording_id: int,
):
    await _template_with_tagged_event(db_session, test_recording_id)
    first = await auth_client.post(
        "/api/v1/annotation_projects/guided_tour/",
        json={"variant": "bat", "reset": True},
    )
    project_id = first.json()["annotation_project_id"]
    [task] = await _tour_contents(db_session, project_id)

    # The user deletes the event and badges the task.
    [event] = task.sound_event_annotations
    await db_session.execute(
        delete(models.SoundEventAnnotationTag).where(
            models.SoundEventAnnotationTag.sound_event_annotation_id == event.id,
        ),
    )
    await db_session.execute(
        delete(models.SoundEventAnnotation).where(
            models.SoundEventAnnotation.annotation_task_id == task.id,
        ),
    )
    admin = await api.users.get_by_username(db_session, "admin")
    db_session.add(
        models.AnnotationStatusBadge(
            annotation_task_id=task.id,
            user_id=admin.id,
            state="completed",
        ),
    )
    await db_session.commit()

    progress = await auth_client.get("/api/v1/annotation_projects/guided_tour/")
    [tour] = [t for t in progress.json()["tours"] if t["variant"] == "bat"]
    assert tour["annotation_project_id"] == project_id
    assert (tour["done_tasks"], tour["total_tasks"]) == (1, 1)

    # Keep going returns the same project with its changes.
    keep = await auth_client.post(
        "/api/v1/annotation_projects/guided_tour/",
        json={"variant": "bat", "reset": False},
    )
    assert keep.json()["annotation_project_id"] == project_id
    assert keep.json()["created"] is False

    # Start from scratch restores the template state.
    reset = await auth_client.post(
        "/api/v1/annotation_projects/guided_tour/",
        json={"variant": "bat", "reset": True},
    )
    assert reset.json()["created"] is True
    assert reset.json()["annotation_project_id"] == project_id
    [new_task] = await _tour_contents(db_session, project_id)
    assert len(new_task.sound_event_annotations) == 1
    assert not new_task.status_badges

    progress = await auth_client.get("/api/v1/annotation_projects/guided_tour/")
    [tour] = [t for t in progress.json()["tours"] if t["variant"] == "bat"]
    assert tour["done_tasks"] == 0

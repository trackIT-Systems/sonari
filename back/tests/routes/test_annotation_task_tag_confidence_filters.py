"""Tests for correlated sound-event tag and confidence task filters."""

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from sonari import api, models, schemas
from sonari.schemas.sound_event_annotations import SoundEventAnnotationCreate


async def _create_task(
    db_session: AsyncSession,
    project: schemas.AnnotationProject,
    recording_id: int,
    start_time: float,
    end_time: float,
) -> schemas.AnnotationTask:
    recording = await api.recordings.get(db_session, recording_id)
    task = await api.annotation_tasks.create(
        db_session,
        annotation_project=project,
        recording=recording,
        start_time=start_time,
        end_time=end_time,
    )
    await db_session.commit()
    return task


async def _create_sound_event(
    db_session: AsyncSession,
    task: schemas.AnnotationTask,
    user: schemas.SimpleUser,
    start_time: float = 0.6,
    end_time: float = 1.4,
) -> schemas.SoundEventAnnotation:
    create_data = SoundEventAnnotationCreate(
        geometry={
            "type": "BoundingBox",
            "coordinates": [start_time, 100.0, end_time, 500.0],
        },
        tags=[],
    )
    annotation = await api.sound_event_annotations.create(
        db_session,
        annotation_task=task,
        geometry=create_data.geometry,
        created_by=user,
    )
    await db_session.commit()
    return annotation


async def _add_tag(
    db_session: AsyncSession,
    annotation: schemas.SoundEventAnnotation,
    tag: schemas.Tag,
    user: schemas.SimpleUser,
) -> None:
    await api.sound_event_annotations.add_tag(db_session, annotation, tag, user=user)
    await db_session.commit()


async def _create_species_tag(
    db_session: AsyncSession,
    user: schemas.SimpleUser,
    species: str,
) -> schemas.Tag:
    suffix = uuid.uuid4().hex[:8]
    tag = await api.tags.create(
        db_session,
        key="species",
        value=f"{species}_{suffix}",
        created_by=user,
    )
    await db_session.commit()
    return tag


async def _set_confidence(
    db_session: AsyncSession,
    annotation: schemas.SoundEventAnnotation,
    value: float,
) -> None:
    annotation = await api.sound_event_annotations.get(
        db_session, annotation.id, include_features=True
    )
    feature = schemas.Feature(name="detection_confidence", value=value)
    existing = next(
        (f for f in annotation.features if f.name == "detection_confidence"),
        None,
    )
    if existing is not None:
        await api.sound_event_annotations.remove_feature(db_session, annotation, existing)
        annotation = await api.sound_event_annotations.get(
            db_session, annotation.id, include_features=True
        )
    await api.sound_event_annotations.add_feature(db_session, annotation, feature)
    await db_session.commit()


async def _set_feature(
    db_session: AsyncSession,
    annotation: schemas.SoundEventAnnotation,
    name: str,
    value: float,
) -> None:
    annotation = await api.sound_event_annotations.get(
        db_session, annotation.id, include_features=True
    )
    feature = schemas.Feature(name=name, value=value)
    existing = next((f for f in annotation.features if f.name == name), None)
    if existing is not None:
        await api.sound_event_annotations.remove_feature(db_session, annotation, existing)
        annotation = await api.sound_event_annotations.get(
            db_session, annotation.id, include_features=True
        )
    await api.sound_event_annotations.add_feature(db_session, annotation, feature)
    await db_session.commit()


async def _birdedge_user(db_session: AsyncSession) -> schemas.SimpleUser:
    result = await db_session.execute(
        select(models.User).where(models.User.username == "birdedge")
    )
    user = result.scalar_one()
    return schemas.SimpleUser.model_validate(user)


async def _fetch_task_ids(
    auth_client: AsyncClient,
    project_id: int,
    **filter_params: object,
) -> set[int]:
    response = await auth_client.get(
        "/api/v1/annotation_tasks/",
        params={
            "annotation_project__eq": project_id,
            "limit": 100,
            "offset": 0,
            **filter_params,
        },
    )
    assert response.status_code == 200
    return {item["id"] for item in response.json()["items"]}


@pytest.mark.asyncio
async def test_tag_and_confidence_on_same_sound_event_included(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_annotation_project: schemas.AnnotationProject,
    test_recording_id: int,
    test_user,
):
    """Task matches when the tagged event also has confidence in range."""
    user = schemas.SimpleUser.model_validate(test_user)
    project_name = f"tag_conf_{uuid.uuid4().hex[:8]}"
    project = await api.annotation_projects.create(
        db_session,
        name=project_name,
        description="filter test",
    )
    await db_session.commit()

    task = await _create_task(db_session, project, test_recording_id, 0.0, 5.0)
    event = await _create_sound_event(db_session, task, user)
    tag = await _create_species_tag(db_session, user, "pip")
    await _add_tag(db_session, event, tag, user)
    await _set_confidence(db_session, event, 0.9)

    ids = await _fetch_task_ids(
        auth_client,
        project.id,
        sound_event_annotation_tag__keys="species",
        sound_event_annotation_tag__values=tag.value,
        confidence__gt=0.8,
    )
    assert task.id in ids


@pytest.mark.asyncio
async def test_tag_and_confidence_on_different_events_excluded(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_recording_id: int,
    test_user,
):
    """Task does not match when tag and confidence are on different sound events."""
    user = schemas.SimpleUser.model_validate(test_user)
    project = await api.annotation_projects.create(
        db_session,
        name=f"tag_conf_{uuid.uuid4().hex[:8]}",
        description="filter test",
    )
    await db_session.commit()

    task = await _create_task(db_session, project, test_recording_id, 10.0, 15.0)
    tagged_event = await _create_sound_event(db_session, task, user, 10.5, 11.0)
    other_event = await _create_sound_event(db_session, task, user, 12.0, 13.0)
    tag = await _create_species_tag(db_session, user, "pip")
    await _add_tag(db_session, tagged_event, tag, user)
    await _set_confidence(db_session, other_event, 0.95)

    ids = await _fetch_task_ids(
        auth_client,
        project.id,
        sound_event_annotation_tag__keys="species",
        sound_event_annotation_tag__values=tag.value,
        confidence__gt=0.8,
    )
    assert task.id not in ids


@pytest.mark.asyncio
async def test_multiple_tags_require_confidence_for_each_tag(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_recording_id: int,
    test_user,
):
    """With two tags and shared confidence min, both tags need an in-range event."""
    user = schemas.SimpleUser.model_validate(test_user)
    project = await api.annotation_projects.create(
        db_session,
        name=f"tag_conf_{uuid.uuid4().hex[:8]}",
        description="filter test",
    )
    await db_session.commit()

    task = await _create_task(db_session, project, test_recording_id, 20.0, 25.0)
    pip_event = await _create_sound_event(db_session, task, user, 20.5, 21.0)
    nyct_event = await _create_sound_event(db_session, task, user, 22.0, 23.0)
    pip_tag = await _create_species_tag(db_session, user, "pip")
    nyct_tag = await _create_species_tag(db_session, user, "nyct")
    await _add_tag(db_session, pip_event, pip_tag, user)
    await _add_tag(db_session, nyct_event, nyct_tag, user)
    await _set_confidence(db_session, pip_event, 0.9)
    await _set_confidence(db_session, nyct_event, 0.5)

    both_params = {
        "sound_event_annotation_tag__keys": "species,species",
        "sound_event_annotation_tag__values": f"{pip_tag.value},{nyct_tag.value}",
        "sound_event_annotation_tag__include_match": "and",
        "confidence__gt": 0.8,
    }
    ids_both = await _fetch_task_ids(auth_client, project.id, **both_params)
    assert task.id not in ids_both

    await _set_confidence(db_session, nyct_event, 0.85)
    ids_both_after = await _fetch_task_ids(auth_client, project.id, **both_params)
    assert task.id in ids_both_after


@pytest.mark.asyncio
async def test_confidence_only_matches_events_on_same_task(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_recording_id: int,
    test_user,
):
    """Confidence without tags does not match events on another task of the same recording."""
    user = schemas.SimpleUser.model_validate(test_user)
    project = await api.annotation_projects.create(
        db_session,
        name=f"tag_conf_{uuid.uuid4().hex[:8]}",
        description="filter test",
    )
    await db_session.commit()

    task_without_event = await _create_task(db_session, project, test_recording_id, 30.0, 35.0)
    other_task = await _create_task(db_session, project, test_recording_id, 36.0, 40.0)
    event = await _create_sound_event(db_session, other_task, user, 36.5, 37.0)
    tag = await _create_species_tag(db_session, user, "pip")
    await _add_tag(db_session, event, tag, user)
    await _set_confidence(db_session, event, 0.99)

    ids = await _fetch_task_ids(auth_client, project.id, confidence__gt=0.8)
    assert task_without_event.id not in ids
    assert other_task.id in ids


@pytest.mark.asyncio
async def test_tags_only_still_or(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_recording_id: int,
    test_user,
):
    """Multiple tag filters match if any tag is present."""
    user = schemas.SimpleUser.model_validate(test_user)
    project = await api.annotation_projects.create(
        db_session,
        name=f"tag_conf_{uuid.uuid4().hex[:8]}",
        description="filter test",
    )
    await db_session.commit()

    task = await _create_task(db_session, project, test_recording_id, 40.0, 45.0)
    event = await _create_sound_event(db_session, task, user, 40.5, 41.0)
    pip_tag = await _create_species_tag(db_session, user, "pip")
    nyct_tag = await _create_species_tag(db_session, user, "nyct")
    await _add_tag(db_session, event, pip_tag, user)

    ids = await _fetch_task_ids(
        auth_client,
        project.id,
        sound_event_annotation_tag__keys="species,species",
        sound_event_annotation_tag__values=f"{pip_tag.value},{nyct_tag.value}",
    )
    assert task.id in ids


@pytest.mark.asyncio
async def test_confidence_only_uses_tag_creator_for_feature_choice(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_recording_id: int,
    test_user,
):
    """Confidence-only filter uses species_confidence for birdedge-created tags."""
    admin = schemas.SimpleUser.model_validate(test_user)
    birdedge = await _birdedge_user(db_session)
    project = await api.annotation_projects.create(
        db_session,
        name=f"tag_conf_{uuid.uuid4().hex[:8]}",
        description="filter test",
    )
    await db_session.commit()

    task = await _create_task(db_session, project, test_recording_id, 45.0, 50.0)
    event = await _create_sound_event(db_session, task, admin, 45.5, 46.0)
    suffix = uuid.uuid4().hex[:8]
    tag = await api.tags.create(
        db_session,
        key="species",
        value=f"pip_{suffix}",
        created_by=birdedge,
    )
    await db_session.commit()
    await _add_tag(db_session, event, tag, admin)
    await _set_feature(db_session, event, "species_confidence", 0.91)

    ids = await _fetch_task_ids(auth_client, project.id, confidence__gt=0.8)
    assert task.id in ids


@pytest.mark.asyncio
async def test_birdedge_tag_uses_species_confidence(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_recording_id: int,
    test_user,
):
    """Tags created by birdedge use species_confidence when combined with a confidence filter."""
    admin = schemas.SimpleUser.model_validate(test_user)
    birdedge = await _birdedge_user(db_session)
    project = await api.annotation_projects.create(
        db_session,
        name=f"tag_conf_{uuid.uuid4().hex[:8]}",
        description="filter test",
    )
    await db_session.commit()

    task = await _create_task(db_session, project, test_recording_id, 50.0, 55.0)
    event = await _create_sound_event(db_session, task, admin, 50.5, 51.0)
    suffix = uuid.uuid4().hex[:8]
    tag = await api.tags.create(
        db_session,
        key="species",
        value=f"pip_{suffix}",
        created_by=birdedge,
    )
    await db_session.commit()
    await _add_tag(db_session, event, tag, admin)
    await _set_feature(db_session, event, "species_confidence", 0.92)

    ids = await _fetch_task_ids(
        auth_client,
        project.id,
        sound_event_annotation_tag__keys="species",
        sound_event_annotation_tag__values=tag.value,
        confidence__gt=0.8,
    )
    assert task.id in ids


@pytest.mark.asyncio
async def test_non_birdedge_tag_ignores_species_confidence(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_recording_id: int,
    test_user,
):
    """Human-created tags only consider detection_confidence in combined filters."""
    user = schemas.SimpleUser.model_validate(test_user)
    project = await api.annotation_projects.create(
        db_session,
        name=f"tag_conf_{uuid.uuid4().hex[:8]}",
        description="filter test",
    )
    await db_session.commit()

    task = await _create_task(db_session, project, test_recording_id, 60.0, 65.0)
    event = await _create_sound_event(db_session, task, user, 60.5, 61.0)
    tag = await _create_species_tag(db_session, user, "pip")
    await _add_tag(db_session, event, tag, user)
    await _set_feature(db_session, event, "species_confidence", 0.95)

    ids = await _fetch_task_ids(
        auth_client,
        project.id,
        sound_event_annotation_tag__keys="species",
        sound_event_annotation_tag__values=tag.value,
        confidence__gt=0.8,
    )
    assert task.id not in ids


@pytest.mark.asyncio
async def test_exclude_tag_hides_matching_task(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_recording_id: int,
    test_user,
):
    """Excluded tag removes tasks that have that tag on a sound event."""
    user = schemas.SimpleUser.model_validate(test_user)
    project = await api.annotation_projects.create(
        db_session,
        name=f"tag_excl_{uuid.uuid4().hex[:8]}",
        description="filter test",
    )
    await db_session.commit()

    tagged_task = await _create_task(db_session, project, test_recording_id, 70.0, 75.0)
    clean_task = await _create_task(db_session, project, test_recording_id, 76.0, 80.0)
    event = await _create_sound_event(db_session, tagged_task, user, 70.5, 71.0)
    tag = await _create_species_tag(db_session, user, "pip")
    await _add_tag(db_session, event, tag, user)

    ids = await _fetch_task_ids(
        auth_client,
        project.id,
        sound_event_annotation_tag__exclude_keys="species",
        sound_event_annotation_tag__exclude_values=tag.value,
    )
    assert tagged_task.id not in ids
    assert clean_task.id in ids


@pytest.mark.asyncio
async def test_exclude_any_of_multiple_tags(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_recording_id: int,
    test_user,
):
    """Exclude list hides tasks that have any excluded tag."""
    user = schemas.SimpleUser.model_validate(test_user)
    project = await api.annotation_projects.create(
        db_session,
        name=f"tag_excl_{uuid.uuid4().hex[:8]}",
        description="filter test",
    )
    await db_session.commit()

    pip_task = await _create_task(db_session, project, test_recording_id, 80.0, 85.0)
    nyct_task = await _create_task(db_session, project, test_recording_id, 86.0, 90.0)
    clean_task = await _create_task(db_session, project, test_recording_id, 91.0, 95.0)
    pip_tag = await _create_species_tag(db_session, user, "pip")
    nyct_tag = await _create_species_tag(db_session, user, "nyct")
    pip_event = await _create_sound_event(db_session, pip_task, user, 80.5, 81.0)
    nyct_event = await _create_sound_event(db_session, nyct_task, user, 86.5, 87.0)
    await _add_tag(db_session, pip_event, pip_tag, user)
    await _add_tag(db_session, nyct_event, nyct_tag, user)

    ids = await _fetch_task_ids(
        auth_client,
        project.id,
        sound_event_annotation_tag__exclude_keys="species,species",
        sound_event_annotation_tag__exclude_values=f"{pip_tag.value},{nyct_tag.value}",
    )
    assert pip_task.id not in ids
    assert nyct_task.id not in ids
    assert clean_task.id in ids


@pytest.mark.asyncio
async def test_include_and_exclude_tags_combined(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_recording_id: int,
    test_user,
):
    """Include pip and exclude crow: only pip without crow matches."""
    user = schemas.SimpleUser.model_validate(test_user)
    project = await api.annotation_projects.create(
        db_session,
        name=f"tag_excl_{uuid.uuid4().hex[:8]}",
        description="filter test",
    )
    await db_session.commit()

    pip_only = await _create_task(db_session, project, test_recording_id, 100.0, 105.0)
    pip_and_crow = await _create_task(db_session, project, test_recording_id, 106.0, 110.0)
    crow_only = await _create_task(db_session, project, test_recording_id, 111.0, 115.0)
    pip_tag = await _create_species_tag(db_session, user, "pip")
    crow_tag = await _create_species_tag(db_session, user, "crow")

    pip_only_event = await _create_sound_event(db_session, pip_only, user, 100.5, 101.0)
    await _add_tag(db_session, pip_only_event, pip_tag, user)

    both_event = await _create_sound_event(db_session, pip_and_crow, user, 106.5, 107.0)
    await _add_tag(db_session, both_event, pip_tag, user)
    both_event2 = await _create_sound_event(db_session, pip_and_crow, user, 107.5, 108.0)
    await _add_tag(db_session, both_event2, crow_tag, user)

    crow_event = await _create_sound_event(db_session, crow_only, user, 111.5, 112.0)
    await _add_tag(db_session, crow_event, crow_tag, user)

    ids = await _fetch_task_ids(
        auth_client,
        project.id,
        sound_event_annotation_tag__keys="species",
        sound_event_annotation_tag__values=pip_tag.value,
        sound_event_annotation_tag__exclude_keys="species",
        sound_event_annotation_tag__exclude_values=crow_tag.value,
    )
    assert pip_only.id in ids
    assert pip_and_crow.id not in ids
    assert crow_only.id not in ids


@pytest.mark.asyncio
async def test_exclude_tag_and_confidence_on_same_sound_event(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_recording_id: int,
    test_user,
):
    """Exclude removes task when tag and confidence are on the same sound event."""
    user = schemas.SimpleUser.model_validate(test_user)
    project = await api.annotation_projects.create(
        db_session,
        name=f"tag_excl_{uuid.uuid4().hex[:8]}",
        description="filter test",
    )
    await db_session.commit()

    task = await _create_task(db_session, project, test_recording_id, 120.0, 125.0)
    event = await _create_sound_event(db_session, task, user, 120.5, 121.0)
    tag = await _create_species_tag(db_session, user, "pip")
    await _add_tag(db_session, event, tag, user)
    await _set_confidence(db_session, event, 0.9)

    ids = await _fetch_task_ids(
        auth_client,
        project.id,
        sound_event_annotation_tag__exclude_keys="species",
        sound_event_annotation_tag__exclude_values=tag.value,
        confidence__gt=0.8,
    )
    assert task.id not in ids


@pytest.mark.asyncio
async def test_exclude_tag_and_confidence_on_different_events_keeps_task(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_recording_id: int,
    test_user,
):
    """Exclude+confidence does not remove task when tag and confidence differ by event."""
    user = schemas.SimpleUser.model_validate(test_user)
    project = await api.annotation_projects.create(
        db_session,
        name=f"tag_excl_{uuid.uuid4().hex[:8]}",
        description="filter test",
    )
    await db_session.commit()

    task = await _create_task(db_session, project, test_recording_id, 130.0, 135.0)
    tagged_event = await _create_sound_event(db_session, task, user, 130.5, 131.0)
    other_event = await _create_sound_event(db_session, task, user, 132.0, 133.0)
    tag = await _create_species_tag(db_session, user, "pip")
    await _add_tag(db_session, tagged_event, tag, user)
    await _set_confidence(db_session, other_event, 0.95)

    ids = await _fetch_task_ids(
        auth_client,
        project.id,
        sound_event_annotation_tag__exclude_keys="species",
        sound_event_annotation_tag__exclude_values=tag.value,
        confidence__gt=0.8,
    )
    assert task.id in ids


@pytest.mark.asyncio
async def test_include_match_and_requires_all_tags(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_recording_id: int,
    test_user,
):
    """include_match=and requires every listed include tag on the task."""
    user = schemas.SimpleUser.model_validate(test_user)
    project = await api.annotation_projects.create(
        db_session,
        name=f"tag_match_{uuid.uuid4().hex[:8]}",
        description="filter test",
    )
    await db_session.commit()

    both_task = await _create_task(db_session, project, test_recording_id, 140.0, 145.0)
    one_tag_task = await _create_task(db_session, project, test_recording_id, 146.0, 150.0)
    pip_tag = await _create_species_tag(db_session, user, "pip")
    nyct_tag = await _create_species_tag(db_session, user, "nyct")
    pip_event = await _create_sound_event(db_session, both_task, user, 140.5, 141.0)
    nyct_event = await _create_sound_event(db_session, both_task, user, 141.5, 142.0)
    await _add_tag(db_session, pip_event, pip_tag, user)
    await _add_tag(db_session, nyct_event, nyct_tag, user)
    only_pip_event = await _create_sound_event(db_session, one_tag_task, user, 146.5, 147.0)
    await _add_tag(db_session, only_pip_event, pip_tag, user)

    params = {
        "sound_event_annotation_tag__keys": "species,species",
        "sound_event_annotation_tag__values": f"{pip_tag.value},{nyct_tag.value}",
        "sound_event_annotation_tag__include_match": "and",
    }
    ids = await _fetch_task_ids(auth_client, project.id, **params)
    assert both_task.id in ids
    assert one_tag_task.id not in ids


@pytest.mark.asyncio
async def test_include_match_or_with_confidence_one_tag_sufficient(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_recording_id: int,
    test_user,
):
    """include_match=or with confidence matches if any tag is in range on its event."""
    user = schemas.SimpleUser.model_validate(test_user)
    project = await api.annotation_projects.create(
        db_session,
        name=f"tag_match_{uuid.uuid4().hex[:8]}",
        description="filter test",
    )
    await db_session.commit()

    task = await _create_task(db_session, project, test_recording_id, 150.0, 155.0)
    pip_event = await _create_sound_event(db_session, task, user, 150.5, 151.0)
    nyct_event = await _create_sound_event(db_session, task, user, 152.0, 153.0)
    pip_tag = await _create_species_tag(db_session, user, "pip")
    nyct_tag = await _create_species_tag(db_session, user, "nyct")
    await _add_tag(db_session, pip_event, pip_tag, user)
    await _add_tag(db_session, nyct_event, nyct_tag, user)
    await _set_confidence(db_session, pip_event, 0.9)
    await _set_confidence(db_session, nyct_event, 0.5)

    or_params = {
        "sound_event_annotation_tag__keys": "species,species",
        "sound_event_annotation_tag__values": f"{pip_tag.value},{nyct_tag.value}",
        "sound_event_annotation_tag__include_match": "or",
        "confidence__gt": 0.8,
    }
    ids_or = await _fetch_task_ids(auth_client, project.id, **or_params)
    assert task.id in ids_or

    and_params = {**or_params, "sound_event_annotation_tag__include_match": "and"}
    ids_and = await _fetch_task_ids(auth_client, project.id, **and_params)
    assert task.id not in ids_and


@pytest.mark.asyncio
async def test_distinct_tag_count_with_single_include_tag(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_recording_id: int,
    test_user,
):
    """Distinct tag amount with one included tag (not occurrence count)."""
    user = schemas.SimpleUser.model_validate(test_user)
    project = await api.annotation_projects.create(
        db_session,
        name=f"tag_count_{uuid.uuid4().hex[:8]}",
        description="filter test",
    )
    await db_session.commit()

    one_distinct_task = await _create_task(
        db_session, project, test_recording_id, 160.0, 165.0
    )
    two_distinct_task = await _create_task(
        db_session, project, test_recording_id, 166.0, 170.0
    )
    pip_tag = await _create_species_tag(db_session, user, "pip")
    nyct_tag = await _create_species_tag(db_session, user, "nyct")

    pip_event_a = await _create_sound_event(db_session, one_distinct_task, user, 160.5, 161.0)
    pip_event_b = await _create_sound_event(db_session, one_distinct_task, user, 161.5, 162.0)
    await _add_tag(db_session, pip_event_a, pip_tag, user)
    await _add_tag(db_session, pip_event_b, pip_tag, user)

    pip_event_c = await _create_sound_event(db_session, two_distinct_task, user, 166.5, 167.0)
    nyct_event = await _create_sound_event(db_session, two_distinct_task, user, 167.5, 168.0)
    await _add_tag(db_session, pip_event_c, pip_tag, user)
    await _add_tag(db_session, nyct_event, nyct_tag, user)

    one_distinct_params = {
        "sound_event_annotation_tag__keys": "species",
        "sound_event_annotation_tag__values": pip_tag.value,
        "sound_event_annotation_tag_count__eq": 1,
    }
    ids_one = await _fetch_task_ids(auth_client, project.id, **one_distinct_params)
    assert one_distinct_task.id in ids_one
    assert two_distinct_task.id not in ids_one

    two_distinct_params = {
        **one_distinct_params,
        "sound_event_annotation_tag_count__eq": 2,
    }
    ids_two = await _fetch_task_ids(auth_client, project.id, **two_distinct_params)
    assert two_distinct_task.id in ids_two
    assert one_distinct_task.id not in ids_two

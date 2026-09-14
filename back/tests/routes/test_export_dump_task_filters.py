"""Tests for dump export with annotation task filters."""

import csv
import io
import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from sonari import api, schemas
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
    start_time: float,
) -> schemas.SoundEventAnnotation:
    create_data = SoundEventAnnotationCreate(
        geometry={
            "type": "BoundingBox",
            "coordinates": [start_time, 100.0, start_time + 0.5, 500.0],
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


async def _set_detection_confidence(
    db_session: AsyncSession,
    annotation: schemas.SoundEventAnnotation,
    value: float,
) -> None:
    annotation = await api.sound_event_annotations.get(
        db_session, annotation.id, include_features=True
    )
    feature = schemas.Feature(name="detection_confidence", value=value)
    await api.sound_event_annotations.add_feature(db_session, annotation, feature)
    await db_session.commit()


@pytest.mark.asyncio
async def test_dump_export_respects_tag_and_confidence_task_filter(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_recording_id: int,
    test_user,
):
    """Dump CSV only includes sound events from tasks matching the task filter."""
    user = schemas.SimpleUser.model_validate(test_user)
    project = await api.annotation_projects.create(
        db_session,
        name=f"dump_filter_{uuid.uuid4().hex[:8]}",
        description="dump filter test",
    )
    await db_session.commit()

    included_task = await _create_task(db_session, project, test_recording_id, 70.0, 75.0)
    excluded_task = await _create_task(db_session, project, test_recording_id, 76.0, 80.0)

    tag = await _create_species_tag(db_session, user, "pip")
    only_in_excluded = await _create_species_tag(db_session, user, "nyct")

    included_event = await _create_sound_event(db_session, included_task, user, 70.5)
    tagged_event = await _create_sound_event(db_session, excluded_task, user, 76.5)
    confident_event = await _create_sound_event(db_session, excluded_task, user, 77.5)

    await api.sound_event_annotations.add_tag(db_session, included_event, tag, user=user)
    await api.sound_event_annotations.add_tag(db_session, tagged_event, tag, user=user)
    await api.sound_event_annotations.add_tag(
        db_session, confident_event, only_in_excluded, user=user
    )

    await _set_detection_confidence(db_session, included_event, 0.95)
    await _set_detection_confidence(db_session, confident_event, 0.95)

    response = await auth_client.get(
        "/api/v1/export/dump/",
        params={
            "annotation_project_ids": [project.id],
            "sound_event_annotation_tag__keys": "species",
            "sound_event_annotation_tag__values": tag.value,
            "confidence__gt": 0.8,
        },
    )
    assert response.status_code == 200

    reader = csv.reader(io.StringIO(response.text))
    rows = list(reader)
    assert len(rows) >= 2

    tag_column_index = rows[0].index("sound_event_tags")
    all_tags = [row[tag_column_index] for row in rows[1:] if len(row) > tag_column_index]

    assert any(tag.value in tags for tags in all_tags)
    assert not any(only_in_excluded.value in tags for tags in all_tags)

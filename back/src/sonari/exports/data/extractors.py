"""Data extraction utilities for exports."""

from typing import Any, Dict, List

from sqlalchemy import select
from sqlalchemy.orm import joinedload, selectinload

from sonari import models
from sonari.routes.dependencies import Session


async def extract_batch(
    session: Session, project_ids: List[int], offset: int, batch_size: int
) -> List[models.SoundEventAnnotation]:
    """Extract a batch of sound event annotations filtered by project IDs."""
    # Query sound event annotations that belong to the specified projects
    stmt = (
        select(models.SoundEventAnnotation)
        .join(models.AnnotationTask)
        .filter(models.AnnotationTask.annotation_project_id.in_(project_ids))
        .options(
            # Essential relationships with optimized eager loading
            selectinload(models.SoundEventAnnotation.features),
            joinedload(models.SoundEventAnnotation.recording).selectinload(models.Recording.recording_tags),
            joinedload(models.SoundEventAnnotation.recording)
            .selectinload(models.Recording.recording_datasets)
            .joinedload(models.DatasetRecording.dataset),
            selectinload(models.SoundEventAnnotation.tags),
            joinedload(models.SoundEventAnnotation.created_by),
            joinedload(models.SoundEventAnnotation.annotation_task)
            .selectinload(models.AnnotationTask.status_badges)
            .joinedload(models.AnnotationStatusBadge.user),
        )
        .offset(offset)
        .limit(batch_size)
    )

    result = await session.execute(stmt)
    batch_annotations = result.unique().scalars().all()

    return batch_annotations


async def load_status_badges_for_batch(session: Session, annotations: List[models.SoundEventAnnotation]) -> None:
    """Load status badges separately to avoid complex nested joins."""
    # Get all annotation task IDs from the batch
    task_ids = []
    for annotation in annotations:
        if annotation.annotation_task:
            task_ids.append(annotation.annotation_task.id)

    if not task_ids:
        return

    # Load status badges for all tasks in one query
    badges_stmt = (
        select(models.AnnotationStatusBadge)
        .options(joinedload(models.AnnotationStatusBadge.user))
        .filter(models.AnnotationStatusBadge.annotation_task_id.in_(task_ids))
    )

    await session.execute(badges_stmt)


async def extract_annotation_data(annotation: models.SoundEventAnnotation) -> Dict[str, Any]:
    """Extract data from a single sound event annotation."""
    recording = annotation.recording

    if recording.recording_datasets:
        # Get the first dataset (or you could get all and choose)
        dataset_recording = recording.recording_datasets[0]
        station = dataset_recording.dataset.name
    else:
        station = str(recording.path)

    # Extract filename
    filename = str(recording.path)

    # Extract sound event tags
    sound_event_tags = [tag.value for tag in annotation.tags]
    sound_event_tags_str = ", ".join(sound_event_tags)

    # Extract individual features into separate fields
    features = {
        "media_duration": None,
        "detection_confidence": None,
        "species_confidence": None,
    }

    for feature_rel in annotation.features:
        feature_name = feature_rel.name
        feature_value = feature_rel.value

        # Map feature names to our standardized column names
        if feature_name == "media_duration":
            features["media_duration"] = feature_value
        elif feature_name == "detection_confidence":
            features["detection_confidence"] = feature_value
        elif feature_name == "species_confidence":
            features["species_confidence"] = feature_value

    # Extract bounding box coordinates from geometry
    from .processors import extract_bounding_box_coordinates

    geometry = annotation.geometry
    bbox_coords = extract_bounding_box_coordinates(geometry)

    # Extract user who created the sound event
    created_by_user = annotation.created_by.username if annotation.created_by else None

    # Extract recording tags
    recording_tags = []
    for tag_rel in recording.recording_tags:
        recording_tags.append(tag_rel.tag.value)
    recording_tags_str = ", ".join(recording_tags)

    # Extract task status badges per user
    status_badges = {}
    if annotation.annotation_task:
        for badge in annotation.annotation_task.status_badges:
            username = badge.user.username if badge.user else "system"
            status_badges[username] = badge.state.value

    status_badges_str = ", ".join([f"{user}:{status}" for user, status in status_badges.items()])

    # Extract recording fields (date, time, longitude, latitude)
    recording_date = recording.date.strftime("%Y-%m-%d") if recording.date else None
    recording_time = recording.time.strftime("%H:%M:%S") if recording.time else None
    recording_longitude = recording.longitude
    recording_latitude = recording.latitude

    return {
        "filename": filename,
        "station": station,
        "date": recording_date,
        "time": recording_time,
        "longitude": recording_longitude,
        "latitude": recording_latitude,
        "sound_event_tags": sound_event_tags_str,
        "media_duration": features["media_duration"],
        "detection_confidence": features["detection_confidence"],
        "species_confidence": features["species_confidence"],
        "start_time": bbox_coords["start_time"],
        "lower_frequency": bbox_coords["lower_frequency"],
        "end_time": bbox_coords["end_time"],
        "higher_frequency": bbox_coords["higher_frequency"],
        "user": created_by_user,
        "recording_tags": recording_tags_str,
        "task_status_badges": status_badges_str,
        "geometry_type": annotation.geometry_type,
    }

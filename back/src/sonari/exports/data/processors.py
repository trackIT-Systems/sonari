"""Data processing utilities for exports."""

import datetime
import logging
from collections import defaultdict
from typing import Any, Dict, List, Tuple

from sqlalchemy import and_, select
from sqlalchemy.orm import selectinload

from ..utils.tag_utils import extract_tag_set, find_matching_tags
from sonari import models
from sonari.routes.dependencies import Session


def extract_bounding_box_coordinates(geometry) -> dict:
    """Extract individual bounding box coordinates from geometry object."""
    # Initialize coordinate values
    coords = {
        "start_time": None,
        "lower_frequency": None,
        "end_time": None,
        "higher_frequency": None,
    }

    try:
        if hasattr(geometry, "coordinates"):
            # Handle different geometry types
            if geometry.type == "BoundingBox":
                # Format: start_time, lower_frequency, end_time, higher_frequency
                bbox_coords = geometry.coordinates
                if len(bbox_coords) >= 4:
                    coords["start_time"] = bbox_coords[0]
                    coords["lower_frequency"] = bbox_coords[1]
                    coords["end_time"] = bbox_coords[2]
                    coords["higher_frequency"] = bbox_coords[3]
            elif geometry.type == "TimeStamp":
                # Single point in time - only start_time available
                coords["start_time"] = geometry.coordinates
                coords["end_time"] = geometry.coordinates
            elif geometry.type == "TimeInterval":
                # Time interval - start and end time only
                interval_coords = geometry.coordinates
                if len(interval_coords) >= 2:
                    coords["start_time"] = interval_coords[0]
                    coords["end_time"] = interval_coords[1]
            elif geometry.type == "Point":
                # Point with time and frequency
                point_coords = geometry.coordinates
                if len(point_coords) >= 2:
                    coords["start_time"] = point_coords[0]
                    coords["end_time"] = point_coords[0]  # Same start/end for point
                    coords["lower_frequency"] = point_coords[1]
                    coords["higher_frequency"] = point_coords[1]  # Same lower/higher for point
            else:
                # Generic coordinates - try to extract what we can
                if isinstance(geometry.coordinates, (list, tuple)) and len(geometry.coordinates) >= 4:
                    coords["start_time"] = geometry.coordinates[0]
                    coords["lower_frequency"] = geometry.coordinates[1]
                    coords["end_time"] = geometry.coordinates[2]
                    coords["higher_frequency"] = geometry.coordinates[3]
                elif isinstance(geometry.coordinates, (list, tuple)) and len(geometry.coordinates) >= 2:
                    coords["start_time"] = geometry.coordinates[0]
                    coords["end_time"] = geometry.coordinates[1]
    except Exception as e:
        logging.getLogger(__name__).warning(f"Could not extract coordinates from geometry: {e}")

    return coords


async def extract_events_with_datetime(
    session: Session,
    project_ids: List[int],
    tags: List[str],
    statuses: List[str] | None,
    start_date: datetime.date | None = None,
    end_date: datetime.date | None = None,
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """Extract sound event annotations with combined recording datetime.

    Parameters
    ----------
    session : Session
        Database session
    project_ids : List[int]
        Project IDs to filter by
    tags : List[str]
        Tags to filter by
    statuses : List[str] | None
        Status filters
    start_date : datetime.date | None
        Start date for filtering (inclusive)
    end_date : datetime.date | None
        End date for filtering (inclusive)

    Returns
    -------
        Tuple of (events_with_datetime, events_without_datetime)
    """
    from .query_builder import build_status_filters

    # Build filters for annotation tasks
    filters = [models.AnnotationTask.annotation_project_id.in_(project_ids)]
    filters.extend(build_status_filters(statuses))

    # Get annotation tasks with annotation_project relationship loaded
    query = (
        select(models.AnnotationTask)
        .where(and_(*filters))
        .options(selectinload(models.AnnotationTask.annotation_project))
    )
    result = await session.execute(query)
    all_tasks = result.scalars().all()
    tasks = (all_tasks, len(all_tasks))

    events_with_datetime = []
    events_without_datetime = []

    for task in tasks[0]:
        if not task.clip_annotation:
            continue

        clip_annotation = task.clip_annotation

        for sound_event_annotation in clip_annotation.sound_events:
            # Check if this event has any of the requested tags
            event_tags = extract_tag_set(sound_event_annotation.tags)
            matching_tags = find_matching_tags(event_tags, tags)

            if matching_tags and task.clip:
                recording = task.clip.recording

                # Access the project_id through the loaded relationship
                task_project_id = task.annotation_project.id

                # Combine recording date and time
                recording_datetime = None
                if recording.date:
                    # Check if recording date is within the specified range
                    if start_date and recording.date < start_date:
                        continue  # Skip events before start_date
                    if end_date and recording.date > end_date:
                        continue  # Skip events after end_date

                    if recording.time:
                        recording_datetime = datetime.datetime.combine(recording.date, recording.time)
                    else:
                        recording_datetime = datetime.datetime.combine(recording.date, datetime.time.min)

                event_data = {
                    "tags": list(event_tags),
                    "recording_filename": str(recording.path),
                    "project_id": task_project_id,
                    "sound_event_annotation": sound_event_annotation,
                }

                if recording_datetime:
                    event_data["datetime"] = recording_datetime
                    events_with_datetime.append(event_data)
                else:
                    # Event without date/time information (only include if no date filter)
                    if not start_date and not end_date:
                        events_without_datetime.append(event_data)

    return events_with_datetime, events_without_datetime


def group_events_by_species(
    events_with_datetime: List[Dict[str, Any]], selected_tags: List[str]
) -> Dict[str, List[Dict[str, Any]]]:
    """Group events by species tag."""
    events_by_species = defaultdict(list)

    for event in events_with_datetime:
        for tag in event["tags"]:
            if tag in selected_tags:
                events_by_species[tag].append(event)

    return dict(events_by_species)

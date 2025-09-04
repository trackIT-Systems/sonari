"""REST API routes for exports."""

import csv
import datetime
import logging
from collections import defaultdict
from datetime import timedelta
from io import BytesIO, StringIO
from typing import Annotated, Any, Dict, List, Tuple
from uuid import UUID

from fastapi import APIRouter, Query
from fastapi.responses import Response, StreamingResponse
from openpyxl import Workbook
from sqlalchemy import and_, or_, select
from sqlalchemy.orm import joinedload, selectinload

from sonari import api, models
from sonari.routes.dependencies import Session

__all__ = [
    "export_router",
]


class ExportConstants:
    """Constants used across export functions."""

    DEFAULT_BATCH_SIZE = 1000
    DEFAULT_DATE_FORMAT = "DD.MM.YYYY"
    DEFAULT_EVENT_COUNT = 2
    NIGHT_START_HOUR = 18  # 6PM
    NIGHT_END_HOUR = 6  # 6AM

    MULTIBASE_HEADERS = [
        "Art",
        "Datum",
        "Tag",
        "Monat",
        "Jahr",
        "Beobachter",
        "Bestimmer",
        "Fundort",
        "X",
        "Y",
        "EPSG",
        "Nachweistyp",
        "Bemerkung_1",
    ]

    DUMP_HEADERS = [
        "filename",
        "station",
        "date",
        "time",
        "longitude",
        "latitude",
        "sound_event_tags",
        "media_duration",
        "detection_confidence",
        "species_confidence",
        "start_time",
        "lower_frequency",
        "end_time",
        "higher_frequency",
        "user",
        "recording_tags",
        "task_status_badges",
        "geometry_type",
    ]


class DateFormatter:
    """Utility class for consistent date formatting across exports."""

    @staticmethod
    def format_date(date: datetime.date | None, format_type: str = "DD.MM.YYYY") -> str:
        """Format date according to specified format."""
        if date is None:
            return ""

        if format_type == "DD.MM.YYYY":
            return date.strftime("%d.%m.%Y")
        else:
            return str(date)

    @staticmethod
    def parse_date_string(date_str: str) -> datetime.date:
        """Parse date string in YYYY-MM-DD format."""
        return datetime.datetime.strptime(date_str, "%Y-%m-%d").date()

    @staticmethod
    def extract_date_components(date: datetime.date | None, format_type: str = "DD.MM.YYYY") -> dict:
        """Extract day, month, year components."""
        if date is None:
            return {"day": "", "month": "", "year": "", "date_str": ""}

        return {
            "day": date.day,
            "month": date.month,
            "year": date.year,
            "date_str": DateFormatter.format_date(date, format_type),
        }


async def _resolve_project_ids(
    session: Session, annotation_project_uuids: list[UUID]
) -> tuple[list[int], dict[int, models.AnnotationProject]]:
    """Resolve annotation project UUIDs to IDs and return both lists and mapping."""
    projects = await api.annotation_projects.get_many(
        session, limit=-1, filters=[models.AnnotationProject.uuid.in_(annotation_project_uuids)]
    )
    project_list = projects[0]
    if not project_list:
        raise ValueError("No valid annotation projects found")

    project_ids = [p.id for p in project_list]
    projects_by_id = {p.id: p for p in project_list}
    return project_ids, projects_by_id


def _build_status_filters(statuses: list[str] | None) -> list:
    """Build status filters for annotation tasks."""
    if not statuses:
        return []

    status_filters = []
    regular_statuses = [s for s in statuses if s != "no"]

    # Add filter for tasks with matching status badges
    if regular_statuses:
        status_filters.append(
            models.AnnotationTask.status_badges.any(models.AnnotationStatusBadge.state.in_(regular_statuses))
        )

    # Add filter for tasks with no status badges
    if "no" in statuses:
        status_filters.append(~models.AnnotationTask.status_badges.any())

    # Combine status filters with OR logic
    if len(status_filters) == 1:
        return [status_filters[0]]
    elif len(status_filters) > 1:
        return [or_(*status_filters)]

    return []


async def _get_filtered_annotation_tasks(
    session: Session, project_ids: list[int], statuses: list[str] | None = None, additional_filters: list | None = None
) -> tuple[list[models.AnnotationTask], int]:
    """Get annotation tasks with common filtering logic."""
    filters = [models.AnnotationTask.annotation_project_id.in_(project_ids)]

    # Add status filters
    filters.extend(_build_status_filters(statuses))

    # Add any additional filters
    if additional_filters:
        filters.extend(additional_filters)

    # Use a custom query to eagerly load dataset information
    stmt = (
        select(models.AnnotationTask)
        .where(and_(*filters))
        .options(
            joinedload(models.AnnotationTask.clip_annotation)
            .joinedload(models.ClipAnnotation.clip)
            .joinedload(models.Clip.recording)
            .selectinload(models.Recording.recording_datasets)
            .joinedload(models.DatasetRecording.dataset)
        )
    )

    result = await session.execute(stmt)
    tasks = result.unique().scalars().all()

    return (tasks, len(tasks))


def _create_csv_streaming_response(generator_func, export_type: str) -> StreamingResponse:
    """Create a streaming CSV response with standardized filename."""
    filename = f"{datetime.datetime.now().strftime('%d.%m.%Y_%H_%M')}_{export_type}.csv"
    return StreamingResponse(
        generator_func(),
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename={filename}",
        },
    )


def _find_matching_tags(event_tags: set[str], selected_tags: list[str]) -> list[str]:
    """Find which selected tags match the event tags."""
    return [tag for tag in selected_tags if tag in event_tags]


def _extract_tag_set(annotation_tags) -> set[str]:
    """Extract tag set from annotation tags."""
    return {f"{tag.key}:{tag.value}" for tag in annotation_tags}


export_router = APIRouter()


@export_router.get("/multibase/")
async def export_multibase(
    session: Session,
    annotation_project_uuids: Annotated[list[UUID], Query()],
    tags: Annotated[list[str], Query()],
    statuses: Annotated[list[str] | None, Query()] = None,
) -> Response:
    """Export annotation projects in MultiBase format."""
    # Get the projects and their IDs
    project_ids, _ = await _resolve_project_ids(session, annotation_project_uuids)

    # Get annotation tasks with filtering
    tasks = await _get_filtered_annotation_tasks(session, project_ids, statuses)

    # Create a new workbook and select the active sheet
    wb = Workbook()
    ws = wb.active
    if ws is None:
        return Response(status_code=422)
    ws.title = "Beobachtungen"

    # Append the header to the excel file
    ws.append(ExportConstants.MULTIBASE_HEADERS)

    for task in tasks[0]:
        if not task.clip_annotation:
            continue

        clip_annotation = task.clip_annotation
        clip_annotation_notes = "|"

        for n in clip_annotation.notes:
            clip_annotation_notes += f" {n.message} "
            clip_annotation_notes += "|"

        for sound_event_annotation in clip_annotation.sound_events:
            tag_set = _extract_tag_set(sound_event_annotation.tags)
            matching_tags = _find_matching_tags(tag_set, tags)

            for tag in matching_tags:
                if not task.clip:
                    continue

                species = tag.split(":")[-1]

                # Extract date components using DateFormatter
                date_components = DateFormatter.extract_date_components(task.clip.recording.date, "HH.MM.YYYY")

                latitude = task.clip.recording.latitude
                longitude = task.clip.recording.longitude

                recording = task.clip.recording
                if recording.recording_datasets:
                    # Get the first dataset (or you could get all and choose)
                    dataset_recording = recording.recording_datasets[0]
                    station = dataset_recording.dataset.name
                else:
                    station = str(recording.path)

                # Write the content to the worksheet
                ws.append([
                    species,
                    date_components["date_str"],
                    date_components["day"],
                    date_components["month"],
                    date_components["year"],
                    "",  # Beobachter
                    "",  # Bestimmer
                    station,
                    latitude,
                    longitude,
                    "4326",
                    "Akustik",
                    clip_annotation_notes,
                ])

    # Save the workbook to a BytesIO object
    excel_file = BytesIO()
    wb.save(excel_file)
    excel_file.seek(0)

    # Generate the filename
    filename = f"{datetime.datetime.now().strftime('%d.%m.%Y_%H_%M')}_multibase.xlsx"

    return Response(
        excel_file.getvalue(),
        status_code=200,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "content-disposition": f"attachment; filename={filename}",
            "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
    )


@export_router.get("/dump/")
async def export_dump(
    session: Session,
    annotation_project_uuids: Annotated[list[UUID], Query()],
) -> StreamingResponse:
    """Export sound event annotation data in CSV format with streaming."""
    logger = logging.getLogger(__name__)

    # Get the projects and their IDs
    project_ids, _ = await _resolve_project_ids(session, annotation_project_uuids)

    # Configuration
    batch_size = ExportConstants.DEFAULT_BATCH_SIZE

    async def generate_csv():
        """Generate CSV data progressively in batches."""
        try:
            # CSV headers
            headers = ExportConstants.DUMP_HEADERS

            # Create CSV header row
            output = StringIO()
            writer = csv.writer(output)
            writer.writerow(headers)
            yield output.getvalue()

            # Process in batches
            offset = 0

            while True:
                batch_annotations = await _extract_batch(session, project_ids, offset, batch_size)

                if not batch_annotations:
                    break

                # Load status badges for this batch
                await _load_status_badges_for_batch(session, batch_annotations)

                # Process each annotation in the batch
                for annotation in batch_annotations:
                    try:
                        data = await _extract_annotation_data(annotation)

                        # Write CSV row
                        output = StringIO()
                        writer = csv.writer(output)
                        writer.writerow([
                            data["filename"],
                            data["station"],
                            data["date"],
                            data["time"],
                            data["longitude"],
                            data["latitude"],
                            data["sound_event_tags"],
                            data["media_duration"],
                            data["detection_confidence"],
                            data["species_confidence"],
                            data["start_time"],
                            data["lower_frequency"],
                            data["end_time"],
                            data["higher_frequency"],
                            data["user"],
                            data["recording_tags"],
                            data["task_status_badges"],
                            data["geometry_type"],
                        ])
                        yield output.getvalue()

                    except Exception as e:
                        logger.error(f"Error processing annotation {annotation.uuid}: {e}")
                        raise e  # Stop processing on error as requested

                offset += batch_size

                # Break if we got fewer results than batch_size (end of data)
                if len(batch_annotations) < batch_size:
                    break

        except Exception as e:
            logger.error(f"Error during CSV generation: {e}")
            raise e

    return _create_csv_streaming_response(generate_csv, "dump")


async def _extract_batch(
    session: Session, project_ids: List[int], offset: int, batch_size: int
) -> List[models.SoundEventAnnotation]:
    """Extract a batch of sound event annotations filtered by project IDs."""
    # Query sound event annotations that belong to the specified projects
    stmt = (
        select(models.SoundEventAnnotation)
        .join(models.ClipAnnotation)
        .join(models.AnnotationTask)
        .filter(models.AnnotationTask.annotation_project_id.in_(project_ids))
        .options(
            # Essential relationships with optimized eager loading
            joinedload(models.SoundEventAnnotation.sound_event).selectinload(models.SoundEvent.features),
            joinedload(models.SoundEventAnnotation.sound_event).joinedload(models.SoundEvent.recording),
            joinedload(models.SoundEventAnnotation.sound_event)
            .joinedload(models.SoundEvent.recording)
            .selectinload(models.Recording.recording_tags),
            selectinload(models.SoundEventAnnotation.tags),
            joinedload(models.SoundEventAnnotation.created_by),
            joinedload(models.SoundEventAnnotation.clip_annotation).selectinload(models.ClipAnnotation.annotation_task),
        )
        .offset(offset)
        .limit(batch_size)
    )

    result = await session.execute(stmt)
    batch_annotations = result.unique().scalars().all()

    return batch_annotations


async def _load_status_badges_for_batch(session: Session, annotations: List[models.SoundEventAnnotation]) -> None:
    """Load status badges separately to avoid complex nested joins."""
    # Get all annotation task IDs from the batch
    task_ids = []
    for annotation in annotations:
        if annotation.clip_annotation and annotation.clip_annotation.annotation_task:
            annotation_tasks = annotation.clip_annotation.annotation_task
            if hasattr(annotation_tasks, "__iter__") and not isinstance(annotation_tasks, str):
                # It's a collection
                for task in annotation_tasks:
                    task_ids.append(task.id)
            else:
                # It's a single task
                task_ids.append(annotation_tasks.id)

    if not task_ids:
        return

    # Load status badges for all tasks in one query
    badges_stmt = (
        select(models.AnnotationStatusBadge)
        .options(joinedload(models.AnnotationStatusBadge.user))
        .filter(models.AnnotationStatusBadge.annotation_task_id.in_(task_ids))
    )

    await session.execute(badges_stmt)


async def _extract_annotation_data(annotation: models.SoundEventAnnotation) -> Dict[str, Any]:
    """Extract data from a single sound event annotation."""
    sound_event = annotation.sound_event
    recording = sound_event.recording
    if recording.recording_datasets:
        # Get the first dataset (or you could get all and choose)
        dataset_recording = recording.recording_datasets[0]
        station = dataset_recording.dataset.name
    else:
        station = str(recording.path)

    # Extract filename
    filename = str(recording.path)

    # Extract sound event tags
    sound_event_tags = [f"{tag.key}:{tag.value}" for tag in annotation.tags]
    sound_event_tags_str = ", ".join(sound_event_tags)

    # Extract individual features into separate fields
    features = {
        "media_duration": None,
        "detection_confidence": None,
        "species_confidence": None,
    }

    for feature_rel in sound_event.features:
        feature_name = feature_rel.feature_name.name.lower().replace(" ", "_")
        feature_value = feature_rel.value

        # Map feature names to our standardized column names
        if feature_name == "media_duration":
            features["media_duration"] = feature_value
        elif feature_name == "detection_confidence":
            features["detection_confidence"] = feature_value
        elif feature_name == "species_confidence":
            features["species_confidence"] = feature_value

    # Extract bounding box coordinates from geometry
    geometry = sound_event.geometry
    bbox_coords = _extract_bounding_box_coordinates(geometry)

    # Extract user who created the sound event
    created_by_user = annotation.created_by.username if annotation.created_by else None

    # Extract recording tags
    recording_tags = []
    for tag_rel in recording.recording_tags:
        recording_tags.append(f"{tag_rel.tag.key}:{tag_rel.tag.value}")
    recording_tags_str = ", ".join(recording_tags)

    # Extract task status badges per user
    status_badges = {}
    if annotation.clip_annotation and annotation.clip_annotation.annotation_task:
        # Handle both single task and list of tasks
        annotation_tasks = annotation.clip_annotation.annotation_task
        if hasattr(annotation_tasks, "__iter__") and not isinstance(annotation_tasks, str):
            # It's a collection
            tasks_to_process = annotation_tasks
        else:
            # It's a single task
            tasks_to_process = [annotation_tasks]

        for task in tasks_to_process:
            for badge in task.status_badges:
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
        "geometry_type": sound_event.geometry_type,
    }


def _extract_bounding_box_coordinates(geometry) -> dict:
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


@export_router.get("/passes/")
async def export_passes(
    session: Session,
    annotation_project_uuids: Annotated[list[UUID], Query()],
    tags: Annotated[list[str], Query()],
    statuses: Annotated[list[str] | None, Query()] = None,
    event_count: int = ExportConstants.DEFAULT_EVENT_COUNT,
    time_period_type: str = "predefined",
    predefined_period: Annotated[str | None, Query()] = None,
    custom_period_value: Annotated[int | None, Query()] = None,
    custom_period_unit: Annotated[str | None, Query()] = None,
    start_date: Annotated[str | None, Query()] = None,
    end_date: Annotated[str | None, Query()] = None,
) -> StreamingResponse:
    """Export passes analysis in CSV format."""
    logger = logging.getLogger(__name__)

    # Get the projects and their IDs
    project_ids, projects_by_id = await _resolve_project_ids(session, annotation_project_uuids)

    # Convert time period to seconds
    period_seconds = _convert_time_period_to_seconds(
        time_period_type, predefined_period, custom_period_value, custom_period_unit
    )

    async def generate_passes_csv():
        """Generate passes CSV data."""
        try:
            # CSV headers
            headers = [
                "time_period_start",
                "time_period_end",
                "species_tag",
                "event_count",
                "pass_threshold",
                "is_pass",
            ]

            # Create CSV header row
            output = StringIO()
            writer = csv.writer(output)
            writer.writerow(headers)
            yield output.getvalue()

            # Parse date range if provided
            parsed_start_date = None
            parsed_end_date = None
            if start_date:
                parsed_start_date = DateFormatter.parse_date_string(start_date)
            if end_date:
                parsed_end_date = DateFormatter.parse_date_string(end_date)

            # Extract events with and without datetime information
            events_with_datetime, events_without_datetime = await _extract_events_with_datetime(
                session, project_ids, tags, statuses, parsed_start_date, parsed_end_date
            )

            all_passes_data = []

            # Process events with datetime information
            if events_with_datetime:
                # Group events by species tag
                events_by_species = _group_events_by_species(events_with_datetime, tags)

                # Generate time buckets
                time_buckets = _generate_time_buckets(
                    events_with_datetime, period_seconds, time_period_type, predefined_period
                )

                # Calculate passes for each species
                passes_data = _calculate_passes_per_species(
                    events_by_species, time_buckets, event_count, projects_by_id
                )
                all_passes_data.extend(passes_data)

            # Process events without datetime information
            if events_without_datetime:
                passes_without_datetime = _calculate_passes_without_datetime(
                    events_without_datetime, tags, event_count, projects_by_id
                )
                all_passes_data.extend(passes_without_datetime)

            # If no events found at all, return empty CSV with headers only
            if not all_passes_data:
                return

            # Generate CSV rows for all passes data
            for pass_data in all_passes_data:
                output = StringIO()
                writer = csv.writer(output)
                writer.writerow([
                    pass_data["time_period_start"],
                    pass_data["time_period_end"],
                    pass_data["species_tag"],
                    pass_data["event_count"],
                    pass_data["pass_threshold"],
                    pass_data["is_pass"],
                ])
                yield output.getvalue()

        except Exception as e:
            logger.error(f"Error during passes CSV generation: {e}")
            raise e

    return _create_csv_streaming_response(generate_passes_csv, "passes")


def _convert_time_period_to_seconds(
    time_period_type: str,
    predefined_period: str | None,
    custom_period_value: int | None,
    custom_period_unit: str | None,
) -> int | None:
    """Convert time period to seconds. Returns None for 'overall' period."""
    if time_period_type == "predefined":
        predefined_map = {
            "second": 1,
            "minute": 60,
            "hour": 3600,
            "night": 12 * 3600,  # 12 hours (6PM-6AM)
            "day": 24 * 3600,
            "week": 7 * 24 * 3600,
            "overall": None,  # Special case
        }
        return predefined_map.get(predefined_period)
    else:
        # Convert custom periods
        if custom_period_value is None or custom_period_unit is None:
            return 60  # Default to 1 minute

        unit_map = {
            "seconds": 1,
            "minutes": 60,
            "hours": 3600,
            "days": 24 * 3600,
            "weeks": 7 * 24 * 3600,
            "months": 30 * 24 * 3600,  # Approximate
            "years": 365 * 24 * 3600,  # Approximate
        }
        return custom_period_value * unit_map.get(custom_period_unit, 1)


async def _extract_events_with_datetime(
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
    # Build filters for annotation tasks
    filters = [models.AnnotationTask.annotation_project_id.in_(project_ids)]
    filters.extend(_build_status_filters(statuses))

    # Get annotation tasks with annotation_project relationship loaded
    from sqlalchemy.orm import selectinload

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
            event_tags = _extract_tag_set(sound_event_annotation.tags)
            matching_tags = _find_matching_tags(event_tags, tags)

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


def _group_events_by_species(
    events_with_datetime: List[Dict[str, Any]], selected_tags: List[str]
) -> Dict[str, List[Dict[str, Any]]]:
    """Group events by species tag."""
    events_by_species = defaultdict(list)

    for event in events_with_datetime:
        for tag in event["tags"]:
            if tag in selected_tags:
                events_by_species[tag].append(event)

    return dict(events_by_species)


def _generate_time_buckets(
    events_with_datetime: List[Dict[str, Any]],
    period_seconds: int | None,
    time_period_type: str,
    predefined_period: str | None,
) -> List[Tuple[datetime.datetime, datetime.datetime]]:
    """Generate time buckets for the given period."""
    if not events_with_datetime:
        return []

    # Find overall time range
    all_datetimes = [event["datetime"] for event in events_with_datetime]
    start_datetime = min(all_datetimes)
    end_datetime = max(all_datetimes)

    # Handle "overall" period - single bucket for entire range
    if period_seconds is None:
        return [(start_datetime, end_datetime)]

    # Handle "night" period - generate night-only buckets
    if time_period_type == "predefined" and predefined_period == "night":
        return _generate_night_buckets(start_datetime, end_datetime)

    # Generate regular time buckets
    buckets = []
    current = start_datetime

    while current < end_datetime:
        bucket_end = current + timedelta(seconds=period_seconds)
        if bucket_end > end_datetime:
            bucket_end = end_datetime
        buckets.append((current, bucket_end))
        current = bucket_end

    return buckets


def _generate_night_buckets(
    start_datetime: datetime.datetime, end_datetime: datetime.datetime
) -> List[Tuple[datetime.datetime, datetime.datetime]]:
    """Generate night-only buckets (6PM-6AM)."""
    buckets = []
    current_date = start_datetime.date()
    end_date = end_datetime.date()

    while current_date <= end_date:
        # Night starts at 6PM of current day
        night_start = datetime.datetime.combine(current_date, datetime.time(ExportConstants.NIGHT_START_HOUR, 0))
        # Night ends at 6AM of next day
        night_end = datetime.datetime.combine(
            current_date + timedelta(days=1), datetime.time(ExportConstants.NIGHT_END_HOUR, 0)
        )

        # Only include if within our overall range
        if night_end >= start_datetime and night_start <= end_datetime:
            # Clip to actual data range
            actual_start = max(night_start, start_datetime)
            actual_end = min(night_end, end_datetime)
            if actual_start < actual_end:
                buckets.append((actual_start, actual_end))

        current_date += timedelta(days=1)

    return buckets


def _calculate_passes_per_species(
    events_by_species: Dict[str, List[Dict[str, Any]]],
    time_buckets: List[Tuple[datetime.datetime, datetime.datetime]],
    event_threshold: int,
    projects_by_id: Dict[int, Any],
) -> List[Dict[str, Any]]:
    """Calculate passes for each species in each time bucket."""
    passes_data = []

    for species_tag, species_events in events_by_species.items():
        for bucket_start, bucket_end in time_buckets:
            # Find events in this time bucket
            bucket_events = [event for event in species_events if bucket_start <= event["datetime"] < bucket_end]

            event_count = len(bucket_events)
            is_pass = event_count >= event_threshold

            passes_data.append({
                "time_period_start": bucket_start.strftime("%Y-%m-%d %H:%M:%S"),
                "time_period_end": bucket_end.strftime("%Y-%m-%d %H:%M:%S"),
                "species_tag": species_tag,
                "event_count": event_count,
                "pass_threshold": event_threshold,
                "is_pass": is_pass,
            })

    return passes_data


def _calculate_passes_without_datetime(
    events_without_datetime: List[Dict[str, Any]],
    selected_tags: List[str],
    event_threshold: int,
    projects_by_id: Dict[int, Any],
) -> List[Dict[str, Any]]:
    """Calculate passes for events without date/time information."""
    if not events_without_datetime:
        return []

    # Group events by species tag
    events_by_species = _group_events_by_species(events_without_datetime, selected_tags)

    passes_data = []

    for species_tag, species_events in events_by_species.items():
        event_count = len(species_events)
        is_pass = event_count >= event_threshold

        passes_data.append({
            "time_period_start": "No Date",
            "time_period_end": "No Time",
            "species_tag": species_tag,
            "event_count": event_count,
            "pass_threshold": event_threshold,
            "is_pass": is_pass,
        })

    return passes_data


@export_router.get("/stats/")
async def export_stats(
    session: Session,
    annotation_project_uuids: Annotated[list[UUID], Query()],
    tags: Annotated[list[str], Query()],
    statuses: Annotated[list[str] | None, Query()] = None,
) -> StreamingResponse:
    """Export recording statistics grouped by annotation project, status badge, and tag."""
    logger = logging.getLogger(__name__)

    # Get the projects and their IDs
    project_ids, projects_by_id = await _resolve_project_ids(session, annotation_project_uuids)

    async def generate_stats_csv():
        """Generate statistics CSV data."""
        try:
            # CSV headers
            headers = [
                "annotation_project",
                "status_badge",
                "tag",
                "recording_count",
                "total_duration_seconds",
                "total_duration_hours",
            ]

            # Create CSV header row
            output = StringIO()
            writer = csv.writer(output)
            writer.writerow(headers)
            yield output.getvalue()

            # Get recording statistics
            stats_data = await _get_recording_statistics(session, project_ids, tags, statuses, projects_by_id)

            # Generate CSV rows for all statistics
            for stat in stats_data:
                output = StringIO()
                writer = csv.writer(output)
                writer.writerow([
                    stat["annotation_project"],
                    stat["status_badge"],
                    stat["tag"],
                    stat["recording_count"],
                    stat["total_duration_seconds"],
                    stat["total_duration_hours"],
                ])
                yield output.getvalue()

        except Exception as e:
            logger.error(f"Error during stats CSV generation: {e}")
            raise e

    return _create_csv_streaming_response(generate_stats_csv, "stats")


async def _get_recording_statistics(
    session: Session,
    project_ids: list[int],
    tags: list[str],
    statuses: list[str] | None,
    projects_by_id: dict[int, models.AnnotationProject],
) -> list[dict[str, Any]]:
    """Get recording statistics grouped by project, status badge, and tag."""
    # Get annotation tasks with all necessary relationships
    tasks, _ = await _get_filtered_annotation_tasks(session, project_ids, statuses)

    # Dictionary to store statistics: (project_id, status_badge, tag) -> {count, duration}
    stats_dict = defaultdict(lambda: {"count": set(), "duration": 0.0})

    for task in tasks:
        if not task.clip_annotation or not task.clip:
            continue

        clip_annotation = task.clip_annotation
        recording = task.clip.recording
        project_name = projects_by_id[task.annotation_project_id].name

        # Get status badges for this task
        status_badges = []
        for badge in task.status_badges:
            username = badge.user.username if badge.user else "system"
            status_badges.append(f"{username}:{badge.state.value}")

        # If no status badges, use "no_status"
        if not status_badges:
            status_badges = ["no_status"]

        # Get tags from sound event annotations
        found_tags = set()
        for sound_event_annotation in clip_annotation.sound_events:
            event_tags = _extract_tag_set(sound_event_annotation.tags)
            matching_tags = _find_matching_tags(event_tags, tags)
            found_tags.update(matching_tags)

        # If no matching tags found, use "no_tag"
        if not found_tags:
            found_tags = {"no_tag"}

        # Create entries for each combination of status badge and tag
        for status_badge in status_badges:
            for tag in found_tags:
                key = (project_name, status_badge, tag)
                stats_dict[key]["count"].add(recording.id)  # Use set to avoid double counting
                # Only add duration once per recording per combination
                if recording.id not in stats_dict[key].get("recorded_ids", set()):
                    stats_dict[key]["duration"] += recording.duration
                    if "recorded_ids" not in stats_dict[key]:
                        stats_dict[key]["recorded_ids"] = set()
                    stats_dict[key]["recorded_ids"].add(recording.id)

    # Convert to list format
    result = []
    for (project_name, status_badge, tag), data in stats_dict.items():
        total_duration_seconds = data["duration"]
        total_duration_hours = round(total_duration_seconds / 3600, 2)

        result.append({
            "annotation_project": project_name,
            "status_badge": status_badge,
            "tag": tag,
            "recording_count": len(data["count"]),
            "total_duration_seconds": round(total_duration_seconds, 2),
            "total_duration_hours": total_duration_hours,
        })

    # Sort by project name, then status badge, then tag
    result.sort(key=lambda x: (x["annotation_project"], x["status_badge"], x["tag"]))

    return result

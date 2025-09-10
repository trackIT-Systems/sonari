"""Passes analysis export service."""

import csv
import logging
from collections import defaultdict
from io import StringIO
from typing import Any, Dict, List, Tuple
from uuid import UUID

from ..charts import generate_time_buckets, generate_time_series_chart
from ..charts.chart_utils import convert_time_period_to_seconds
from ..constants import BAT_GROUPS, ExportConstants
from ..data import extract_events_with_datetime
from ..data.processors import group_events_by_species
from .base import BaseExportService


class PassesService(BaseExportService):
    """Service for passes analysis exports."""

    async def export_passes(
        self,
        annotation_project_uuids: List[UUID],
        tags: List[str],
        statuses: List[str] | None = None,
        event_count: int = ExportConstants.DEFAULT_EVENT_COUNT,
        time_period_type: str = "predefined",
        predefined_period: str | None = None,
        custom_period_value: int | None = None,
        custom_period_unit: str | None = None,
        start_date: str | None = None,
        end_date: str | None = None,
        group_species: bool = False,
    ):
        """Export passes analysis in CSV format or JSON with chart."""
        logger = logging.getLogger(__name__)

        # Get the projects and their IDs
        project_ids, projects_by_id = await self.resolve_projects(annotation_project_uuids)

        # Convert time period to seconds
        period_seconds = convert_time_period_to_seconds(
            time_period_type, predefined_period, custom_period_value, custom_period_unit
        )

        # Parse date range if provided
        parsed_start_date, parsed_end_date = self.parse_date_range(start_date, end_date)

        all_passes_data = []
        chart_images = []
        project_names = []

        # Process each project separately
        for project_id in project_ids:
            project = projects_by_id[project_id]
            project_name = project.name
            project_names.append(project_name)

            # Extract events for this specific project
            events_with_datetime, events_without_datetime = await extract_events_with_datetime(
                self.session, [project_id], tags, statuses, parsed_start_date, parsed_end_date
            )

            project_passes_data = []

            # Process events with datetime information
            if events_with_datetime:
                # Group events by species tag
                events_by_species = group_events_by_species(events_with_datetime, tags)

                # Apply species grouping if requested
                if group_species:
                    events_by_species = self._group_species_by_category(events_by_species)

                # Generate time buckets
                time_buckets = generate_time_buckets(
                    events_with_datetime, period_seconds, time_period_type, predefined_period
                )

                # Calculate passes for each species
                passes_data = self._calculate_passes_per_species(
                    events_by_species, time_buckets, event_count, {project_id: project}, project_name
                )
                project_passes_data.extend(passes_data)

            # Process events without datetime information
            if events_without_datetime:
                passes_without_datetime = self._calculate_passes_without_datetime(
                    events_without_datetime, tags, event_count, {project_id: project}, project_name, group_species
                )
                project_passes_data.extend(passes_without_datetime)

            # Generate chart for this project
            chart_base64 = generate_time_series_chart(
                [d for d in project_passes_data if d["time_period_start"] != "No Date"],
                [d for d in project_passes_data if d["time_period_start"] == "No Date"],
                chart_type="passes",
                event_threshold=event_count,
                project_name=project_name,
            )
            chart_images.append(chart_base64)

            # Add project passes data to all data
            all_passes_data.extend(project_passes_data)

        # Generate filename
        filename = self.generate_filename("passes")

        # Return JSON response with chart
        try:
            # Generate CSV content as string
            csv_output = StringIO()
            writer = csv.writer(csv_output)

            # Write headers
            headers = [
                "project_name",
                "time_period_start",
                "time_period_end",
                "species_tag",
                "status",
                "event_count",
                "pass_threshold",
                "pass_count",
            ]
            writer.writerow(headers)

            # Write data rows
            for pass_data in all_passes_data:
                writer.writerow([
                    pass_data["project_name"],
                    pass_data["time_period_start"],
                    pass_data["time_period_end"],
                    pass_data["species_tag"],
                    pass_data["status"],
                    pass_data["event_count"],
                    pass_data["pass_threshold"],
                    pass_data["pass_count"],
                ])

            csv_content = csv_output.getvalue()
            csv_output.close()

            return {
                "csv_data": csv_content,
                "chart_images": chart_images,
                "project_names": project_names,
                "filename": filename,
                "passes_data": all_passes_data,
            }

        except Exception as e:
            logger.error(f"Error during passes JSON generation: {e}")
            raise e

    def _calculate_passes_per_species(
        self,
        events_by_species: Dict[str, List[Dict[str, Any]]],
        time_buckets: List[Tuple],
        event_threshold: int,
        projects_by_id: Dict[int, Any],
        project_name: str,
    ) -> List[Dict[str, Any]]:
        """Calculate bat passes for each species in each time bucket, grouped by status."""
        passes_data = []

        for species_tag, species_events in events_by_species.items():
            for bucket_start, bucket_end in time_buckets:
                # Find events in this time bucket
                bucket_events = [event for event in species_events if bucket_start <= event["datetime"] < bucket_end]

                # Group events by recording/clip filename and status
                events_by_recording_status = defaultdict(lambda: defaultdict(list))
                for event in bucket_events:
                    recording_filename = event["recording_filename"]
                    # Use the first status badge for grouping (events can have multiple status badges)
                    primary_status = event["status_badges"][0] if event["status_badges"] else "no_status"
                    events_by_recording_status[primary_status][recording_filename].append(event)

                # Calculate passes for each status
                for status, recordings in events_by_recording_status.items():
                    pass_count = 0
                    total_event_count = 0

                    for _, recording_events in recordings.items():
                        event_count_in_recording = len(recording_events)
                        total_event_count += event_count_in_recording

                        # This recording constitutes a bat pass if it has >= threshold events
                        if event_count_in_recording >= event_threshold:
                            pass_count += 1

                    passes_data.append({
                        "project_name": project_name,
                        "time_period_start": bucket_start.strftime("%Y-%m-%d %H:%M:%S"),
                        "time_period_end": bucket_end.strftime("%Y-%m-%d %H:%M:%S"),
                        "species_tag": species_tag,
                        "status": status,
                        "event_count": total_event_count,  # Total events in time period
                        "pass_threshold": event_threshold,
                        "pass_count": pass_count,  # Number of recordings that qualify as bat passes
                    })

        return passes_data

    def _calculate_passes_without_datetime(
        self,
        events_without_datetime: List[Dict[str, Any]],
        selected_tags: List[str],
        event_threshold: int,
        projects_by_id: Dict[int, Any],
        project_name: str,
        group_species: bool = False,
    ) -> List[Dict[str, Any]]:
        """Calculate bat passes for events without date/time information, grouped by status."""
        if not events_without_datetime:
            return []

        # Group events by species tag
        events_by_species = group_events_by_species(events_without_datetime, selected_tags)

        # Apply species grouping if requested
        if group_species:
            events_by_species = self._group_species_by_category(events_by_species)

        passes_data = []

        for species_tag, species_events in events_by_species.items():
            # Group events by recording/clip filename and status
            events_by_recording_status = defaultdict(lambda: defaultdict(list))
            for event in species_events:
                recording_filename = event["recording_filename"]
                # Use the first status badge for grouping (events can have multiple status badges)
                primary_status = event["status_badges"][0] if event["status_badges"] else "no_status"
                events_by_recording_status[primary_status][recording_filename].append(event)

            # Calculate passes for each status
            for status, recordings in events_by_recording_status.items():
                pass_count = 0
                total_event_count = sum(len(recording_events) for recording_events in recordings.values())

                for _, recording_events in recordings.items():
                    event_count_in_recording = len(recording_events)

                    # This recording constitutes a bat pass if it has >= threshold events
                    if event_count_in_recording >= event_threshold:
                        pass_count += 1

                passes_data.append({
                    "project_name": project_name,
                    "time_period_start": "No Date",
                    "time_period_end": "No Time",
                    "species_tag": species_tag,
                    "status": status,
                    "event_count": total_event_count,  # Total events
                    "pass_threshold": event_threshold,
                    "pass_count": pass_count,  # Number of recordings that qualify as bat passes
                })

        return passes_data

    def _group_species_by_category(
        self, events_by_species: Dict[str, List[Dict[str, Any]]]
    ) -> Dict[str, List[Dict[str, Any]]]:
        """Group species events by their category based on BAT_GROUPS mapping."""
        grouped_events = defaultdict(list)

        for species_tag, events in events_by_species.items():
            # Look up the species in BAT_GROUPS, default to original species name if not found
            category = BAT_GROUPS.get(species_tag, species_tag)
            grouped_events[category].extend(events)

        return dict(grouped_events)

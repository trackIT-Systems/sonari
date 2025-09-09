"""Time-based analysis export service."""

import csv
import logging
from io import StringIO
from typing import Any, Dict, List, Tuple
from uuid import UUID

from ..charts import generate_time_buckets, generate_time_series_chart
from ..charts.chart_utils import convert_time_period_to_seconds
from ..data import extract_events_with_datetime
from ..data.processors import group_events_by_species
from .base import BaseExportService


class TimeService(BaseExportService):
    """Service for time-based analysis exports."""

    async def export_time(
        self,
        annotation_project_uuids: List[UUID],
        tags: List[str],
        statuses: List[str] | None = None,
        time_period_type: str = "predefined",
        predefined_period: str | None = None,
        custom_period_value: int | None = None,
        custom_period_unit: str | None = None,
        start_date: str | None = None,
        end_date: str | None = None,
    ):
        """Export time-based event counts in CSV format or JSON with chart."""
        logger = logging.getLogger(__name__)

        # Get the projects and their IDs
        project_ids, projects_by_id = await self.resolve_projects(annotation_project_uuids)

        # Convert time period to seconds
        period_seconds = convert_time_period_to_seconds(
            time_period_type, predefined_period, custom_period_value, custom_period_unit
        )

        # Parse date range if provided
        parsed_start_date, parsed_end_date = self.parse_date_range(start_date, end_date)

        # Extract events with and without datetime information
        events_with_datetime, events_without_datetime = await extract_events_with_datetime(
            self.session, project_ids, tags, statuses, parsed_start_date, parsed_end_date
        )

        all_time_data = []

        # Process events with datetime information
        if events_with_datetime:
            # Group events by species tag
            events_by_species = group_events_by_species(events_with_datetime, tags)

            # Generate time buckets
            time_buckets = generate_time_buckets(
                events_with_datetime, period_seconds, time_period_type, predefined_period
            )

            # Calculate event counts for each species
            time_data = self._calculate_time_events_per_species(events_by_species, time_buckets, projects_by_id)
            all_time_data.extend(time_data)

        # Process events without datetime information
        if events_without_datetime:
            time_without_datetime = self._calculate_time_events_without_datetime(
                events_without_datetime, tags, projects_by_id
            )
            all_time_data.extend(time_without_datetime)

        # Generate filename
        filename = self.generate_filename("time")

        # Return JSON response with chart
        try:
            # Generate CSV content as string
            csv_output = StringIO()
            writer = csv.writer(csv_output)

            # Write headers
            headers = [
                "time_period_start",
                "time_period_end",
                "species_tag",
                "event_count",
            ]
            writer.writerow(headers)

            # Write data rows
            for time_entry in all_time_data:
                writer.writerow([
                    time_entry["time_period_start"],
                    time_entry["time_period_end"],
                    time_entry["species_tag"],
                    time_entry["event_count"],
                ])

            csv_content = csv_output.getvalue()
            csv_output.close()

            # Generate chart using unified chart generator
            chart_base64 = generate_time_series_chart(
                [d for d in all_time_data if d["time_period_start"] != "No Date"],
                [d for d in all_time_data if d["time_period_start"] == "No Date"],
                chart_type="events",
            )

            return {
                "csv_data": csv_content,
                "chart_image": chart_base64,
                "filename": filename,
                "time_data": all_time_data,
            }

        except Exception as e:
            logger.error(f"Error during time JSON generation: {e}")
            raise e

    def _calculate_time_events_per_species(
        self,
        events_by_species: Dict[str, List[Dict[str, Any]]],
        time_buckets: List[Tuple],
        projects_by_id: Dict[int, Any],
    ) -> List[Dict[str, Any]]:
        """Calculate event counts for each species in each time bucket."""
        time_data = []

        for species_tag, species_events in events_by_species.items():
            for bucket_start, bucket_end in time_buckets:
                # Find events in this time bucket
                bucket_events = [event for event in species_events if bucket_start <= event["datetime"] < bucket_end]

                event_count = len(bucket_events)

                time_data.append({
                    "time_period_start": bucket_start.strftime("%Y-%m-%d %H:%M:%S"),
                    "time_period_end": bucket_end.strftime("%Y-%m-%d %H:%M:%S"),
                    "species_tag": species_tag,
                    "event_count": event_count,
                })

        return time_data

    def _calculate_time_events_without_datetime(
        self,
        events_without_datetime: List[Dict[str, Any]],
        selected_tags: List[str],
        projects_by_id: Dict[int, Any],
    ) -> List[Dict[str, Any]]:
        """Calculate event counts for events without date/time information."""
        if not events_without_datetime:
            return []

        # Group events by species tag
        events_by_species = group_events_by_species(events_without_datetime, selected_tags)

        time_data = []

        for species_tag, species_events in events_by_species.items():
            event_count = len(species_events)

            time_data.append({
                "time_period_start": "No Date",
                "time_period_end": "No Time",
                "species_tag": species_tag,
                "event_count": event_count,
            })

        return time_data

"""Yearly activity analysis export service."""

import csv
from collections import defaultdict
from io import StringIO
from typing import Any, Dict, List

from ..charts.yearly_activity_chart import generate_yearly_activity_heatmap
from ..constants import BAT_GROUPS
from ..data import extract_events_with_datetime
from ..data.processors import group_events_by_species
from .base import BaseExportService


class YearlyActivityService(BaseExportService):
    """Service for yearly activity analysis exports."""

    async def export_yearly_activity(
        self,
        annotation_project_ids: List[int],
        tags: List[str],
        statuses: List[str] | None = None,
        start_date: str | None = None,
        end_date: str | None = None,
        group_species: bool = False,
    ):
        """Export yearly activity analysis in CSV format or JSON with chart."""
        # Get the projects and their IDs
        project_ids, projects_by_id = await self.resolve_projects(annotation_project_ids)

        # Parse date range if provided
        parsed_start_date, parsed_end_date = self.parse_date_range(start_date, end_date)

        all_yearly_activity_data = []
        chart_images = []
        project_names = []

        # Process each project separately
        for project_id in project_ids:
            project = projects_by_id[project_id]
            project_name = project.name
            project_names.append(project_name)

            # Extract events for this specific project
            events_with_datetime, _ = await extract_events_with_datetime(
                self.session, [project_id], tags, statuses, parsed_start_date, parsed_end_date
            )

            project_yearly_activity_data = []

            # Process events with datetime information only
            if events_with_datetime:
                # Group events by species tag
                events_by_species = group_events_by_species(events_with_datetime, tags)

                # Apply species grouping if requested
                if group_species:
                    events_by_species = self._group_species_by_category(events_by_species)

                # Calculate yearly activity for each species
                yearly_activity_data = self._calculate_yearly_activity_per_species(
                    events_by_species, {project_id: project}, project_name
                )
                project_yearly_activity_data.extend(yearly_activity_data)

            # Collect location data for sunrise/sunset calculations
            location_data = self._extract_location_data(events_with_datetime) if events_with_datetime else None

            # Generate chart for this project (with subplots for each tag)
            chart_base64 = generate_yearly_activity_heatmap(
                project_yearly_activity_data,
                project_name,
                list(events_by_species.keys()) if events_with_datetime else [],
                location_data,
            )
            chart_images.append(chart_base64)

            # Add project yearly activity data to all data
            all_yearly_activity_data.extend(project_yearly_activity_data)

        # Generate filename
        filename = self.generate_filename("yearly_activity")

        # Return JSON response with chart
        try:
            # Generate CSV content as string
            csv_output = StringIO()
            writer = csv.writer(csv_output)

            # Write headers
            headers = [
                "project_name",
                "species_tag",
                "status",
                "hour_of_day",
                "day_of_year",
                "event_count",
            ]
            writer.writerow(headers)

            # Write data rows
            for activity_data in all_yearly_activity_data:
                writer.writerow([
                    activity_data["project_name"],
                    activity_data["species_tag"],
                    activity_data["status"],
                    activity_data["hour_of_day"],
                    activity_data["day_of_year"],
                    activity_data["event_count"],
                ])

            csv_content = csv_output.getvalue()
            csv_output.close()

            return {
                "csv_data": csv_content,
                "chart_images": chart_images,
                "project_names": project_names,
                "filename": filename,
                "yearly_activity_data": all_yearly_activity_data,
            }

        except Exception as e:
            raise e

    def _calculate_yearly_activity_per_species(
        self,
        events_by_species: Dict[str, List[Dict[str, Any]]],
        projects_by_id: Dict[int, Any],
        project_name: str,
    ) -> List[Dict[str, Any]]:
        """Calculate event counts for each species by hour of day and day of year, combining all statuses."""
        yearly_activity_data = []

        for species_tag, species_events in events_by_species.items():
            # Group events by hour and day of year, combining all statuses
            activity_counts = defaultdict(int)

            for event in species_events:
                if "datetime" in event:
                    dt = event["datetime"]
                    hour_of_day = dt.hour
                    day_of_year = dt.timetuple().tm_yday

                    # Combine all statuses for this time bin
                    activity_counts[(hour_of_day, day_of_year)] += 1

            # Create data entries for each hour/day combination with events
            for (hour_of_day, day_of_year), event_count in activity_counts.items():
                yearly_activity_data.append({
                    "project_name": project_name,
                    "species_tag": species_tag,
                    "status": "combined",  # All statuses combined as requested
                    "hour_of_day": hour_of_day,
                    "day_of_year": day_of_year,
                    "event_count": event_count,
                })

        return yearly_activity_data

    def _extract_location_data(self, events_with_datetime: List[Dict[str, Any]]) -> Dict[str, Any] | None:
        """Extract location data for sunrise/sunset calculations."""
        if not events_with_datetime:
            return None

        # Try to find recordings with location data
        latitudes = []
        longitudes = []
        timezones = []
        dates = []

        for event in events_with_datetime:
            # Access recording directly from event data (now eagerly loaded)
            if "recording" in event:
                recording = event["recording"]

                if recording.latitude is not None and recording.longitude is not None:
                    latitudes.append(recording.latitude)
                    longitudes.append(recording.longitude)

                # Check if recording has timezone (this might not exist in your model)
                if hasattr(recording, "timezone") and recording.timezone:
                    timezones.append(recording.timezone)

                if "datetime" in event:
                    dates.append(event["datetime"].date())

        # Use average location if available, otherwise use timezone info
        if latitudes and longitudes:
            avg_lat = sum(latitudes) / len(latitudes)
            avg_lon = sum(longitudes) / len(longitudes)
            return {"latitude": avg_lat, "longitude": avg_lon, "dates": list(set(dates))}
        elif timezones:
            # Use most common timezone
            from collections import Counter

            most_common_tz = Counter(timezones).most_common(1)[0][0]
            return {"timezone": most_common_tz, "dates": list(set(dates))}
        else:
            # Fallback: Use a default location (e.g., Central Europe) for demonstration
            # You can change this to a location relevant to your data
            return {
                "latitude": 50.0,  # Central Europe latitude
                "longitude": 10.0,  # Central Europe longitude
                "dates": list(set(dates)),
                "fallback": True,
            }

        return None

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

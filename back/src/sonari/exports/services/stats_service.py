"""Statistics export service."""

import csv
import logging
from collections import defaultdict
from io import StringIO
from typing import Any, Dict, List
from uuid import UUID

from fastapi.responses import StreamingResponse

from ..data import get_filtered_annotation_tasks
from ..utils import create_csv_streaming_response, extract_tag_set, find_matching_tags
from .base import BaseExportService
from sonari import models


class StatsService(BaseExportService):
    """Service for statistics exports."""

    async def export_stats(
        self,
        annotation_project_uuids: List[UUID],
        tags: List[str],
        statuses: List[str] | None = None,
    ) -> StreamingResponse:
        """Export recording statistics grouped by annotation project, status badge, and tag."""
        logger = logging.getLogger(__name__)

        # Get the projects and their IDs
        project_ids, projects_by_id = await self.resolve_projects(annotation_project_uuids)

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
                stats_data = await self._get_recording_statistics(project_ids, tags, statuses, projects_by_id)

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

        return create_csv_streaming_response(generate_stats_csv, "stats")

    async def _get_recording_statistics(
        self,
        project_ids: List[int],
        tags: List[str],
        statuses: List[str] | None,
        projects_by_id: Dict[int, models.AnnotationProject],
    ) -> List[Dict[str, Any]]:
        """Get recording statistics grouped by project, status badge, and tag."""
        # Get annotation tasks with all necessary relationships
        tasks, _ = await get_filtered_annotation_tasks(self.session, project_ids, statuses)

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
                event_tags = extract_tag_set(sound_event_annotation.tags)
                matching_tags = find_matching_tags(event_tags, tags)
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

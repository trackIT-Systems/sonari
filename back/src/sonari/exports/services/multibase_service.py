"""MultiBase export service."""

from io import BytesIO
from typing import List
from uuid import UUID

from fastapi.responses import Response
from openpyxl import Workbook

from ..constants import ExportConstants
from ..data import get_filtered_annotation_tasks
from ..utils import DateFormatter, extract_tag_set, find_matching_tags
from .base import BaseExportService


class MultiBaseService(BaseExportService):
    """Service for MultiBase format exports."""

    async def export_multibase(
        self,
        annotation_project_uuids: List[UUID],
        tags: List[str],
        statuses: List[str] | None = None,
    ) -> Response:
        """Export annotation projects in MultiBase format."""
        # Get the projects and their IDs
        project_ids, _ = await self.resolve_projects(annotation_project_uuids)

        # Get annotation tasks with filtering
        tasks = await get_filtered_annotation_tasks(self.session, project_ids, statuses)

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
                tag_set = extract_tag_set(sound_event_annotation.tags)
                matching_tags = find_matching_tags(tag_set, tags)

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
        filename = f"{self.generate_filename('multibase')}.xlsx"

        return Response(
            excel_file.getvalue(),
            status_code=200,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "content-disposition": f"attachment; filename={filename}",
                "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            },
        )

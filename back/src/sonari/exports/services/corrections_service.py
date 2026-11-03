"""Prediction corrections export service."""

import csv
import logging
from io import StringIO
from pathlib import Path
from typing import List

from fastapi.responses import StreamingResponse

from ..utils import create_csv_streaming_response
from .base import BaseExportService
from sonari.services.prediction_corrections import CorrectionRow, get_prediction_corrections

HEADERS = [
    "annotation_project",
    "station",
    "recording",
    "recording_date",
    "recording_time",
    "annotation_task_id",
    "task_start_time",
    "task_end_time",
    "review_status",
    "reviewed_by",
    "reviewed_on",
    "detector",
    "model_version",
    "source_file",
    "outcome",
    "tag_key",
    "predicted_value",
    "predicted_label",
    "detection_confidence",
    "species_confidence",
    "final_values",
    "box_changed",
    "sound_event_annotation_id",
    "predicted_coordinates",
    "final_coordinates",
]


def _coords(coords: tuple[float, ...] | None) -> str:
    return " ".join(str(c) for c in coords) if coords else ""


def _row(row: CorrectionRow) -> list:
    return [
        row.annotation_project,
        row.station or "",
        row.recording_path,
        row.recording_date or "",
        row.recording_time or "",
        row.annotation_task_id,
        row.task_start_time,
        row.task_end_time,
        row.review_status,
        row.reviewed_by or "",
        row.reviewed_on.isoformat() if row.reviewed_on else "",
        row.detector or "",
        row.model_version or "",
        row.source_file,
        row.outcome,
        row.key,
        row.predicted_value or "",
        row.predicted_label or "",
        "" if row.detection_confidence is None else row.detection_confidence,
        "" if row.species_confidence is None else row.species_confidence,
        ";".join(row.final_values),
        "" if row.box_changed is None else row.box_changed,
        row.sound_event_annotation_id or "",
        _coords(row.predicted_coords),
        _coords(row.final_coords),
    ]


class CorrectionsService(BaseExportService):
    """Service for exporting reviewer corrections of detector predictions."""

    async def export_corrections(
        self,
        annotation_project_ids: List[int],
        audio_dir: Path,
    ) -> StreamingResponse:
        """Export one row per predicted tag and per tag reviewers added, in completed or verified tasks."""
        logger = logging.getLogger(__name__)
        project_ids, projects_by_id = await self.resolve_projects(annotation_project_ids)

        async def generate_corrections_csv():
            try:
                output = StringIO()
                csv.writer(output).writerow(HEADERS)
                yield output.getvalue()

                for project_id in project_ids:
                    corrections = await get_prediction_corrections(self.session, projects_by_id[project_id], audio_dir)
                    output = StringIO()
                    writer = csv.writer(output)
                    for row in corrections.rows:
                        writer.writerow(_row(row))
                    yield output.getvalue()
            except Exception as e:
                logger.error(f"Error during corrections CSV generation: {e}")
                raise e

        return create_csv_streaming_response(generate_corrections_csv, "corrections")

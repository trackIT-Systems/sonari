"""ProBat CSV export service."""

import csv
import logging
import os
from collections import defaultdict
from io import StringIO
from typing import List

from fastapi.responses import StreamingResponse

from ..constants import ExportConstants, resolve_probat_species
from ..data import get_filtered_annotation_tasks
from ..utils import create_csv_streaming_response
from ..utils.tag_utils import find_matching_tag_values_on_annotation
from ..utils.probat_format import (
    format_probat_count,
    format_probat_datetime,
    format_probat_number,
    format_task_notes,
    max_confidence_for_species,
)
from .base import BaseExportService


class ProBatService(BaseExportService):
    """Service for ProBat format CSV exports."""

    async def export_probat(
        self,
        annotation_project_ids: List[int],
        tags: List[str] | None = None,
        statuses: List[str] | None = None,
        start_date: str | None = None,
        end_date: str | None = None,
        group_species: bool = False,
    ) -> StreamingResponse:
        """Export annotation data in ProBat CSV format."""
        logger = logging.getLogger(__name__)
        project_ids, _ = await self.resolve_projects(annotation_project_ids)
        parsed_start_date, parsed_end_date = self.parse_date_range(start_date, end_date)

        async def generate_csv():
            try:
                output = StringIO()
                writer = csv.writer(output, delimiter=";")
                writer.writerow(ExportConstants.PROBAT_HEADERS)
                yield output.getvalue()

                tasks, _ = await get_filtered_annotation_tasks(self.session, project_ids, statuses)
                rows: list[dict] = []

                for task in tasks:
                    recording = task.recording
                    if recording.date is not None:
                        if parsed_start_date and recording.date < parsed_start_date:
                            continue
                        if parsed_end_date and recording.date > parsed_end_date:
                            continue

                    kommentar = format_task_notes(task.notes)
                    dateiname = os.path.basename(str(recording.path))
                    aufnahmezeit = format_probat_datetime(recording.date, recording.time)

                    aggregates: dict[tuple[int, str], dict] = defaultdict(
                        lambda: {"prob": None, "rufzahl": 0}
                    )

                    for sound_event_annotation in task.sound_event_annotations:
                        matching_tags = find_matching_tag_values_on_annotation(
                            sound_event_annotation.tags,
                            tags,
                        )
                        for tag_value in matching_tags:
                            species = resolve_probat_species(tag_value, group_species)
                            key = (recording.id, species)
                            aggregates[key]["rufzahl"] += 1
                            conf = max_confidence_for_species(sound_event_annotation, tag_value)
                            if conf is not None:
                                current = aggregates[key]["prob"]
                                if current is None or conf > current:
                                    aggregates[key]["prob"] = conf

                    for (_recording_id, species), data in aggregates.items():
                        prob_str = (
                            format_probat_number(data["prob"])
                            if data["prob"] is not None
                            else format_probat_number(0.0)
                        )
                        rows.append({
                            "species": species,
                            "prob": prob_str,
                            "aufnahmezeit": aufnahmezeit,
                            "dateiname": dateiname,
                            "kommentar": kommentar,
                            "rufzahl": format_probat_count(data["rufzahl"]),
                        })

                rows.sort(key=lambda r: (r["aufnahmezeit"], r["dateiname"], r["species"]))

                for row in rows:
                    output = StringIO()
                    writer = csv.writer(output, delimiter=";")
                    writer.writerow([
                        row["species"],
                        row["prob"],
                        row["aufnahmezeit"],
                        row["dateiname"],
                        row["kommentar"],
                        row["rufzahl"],
                    ])
                    yield output.getvalue()

            except Exception as e:
                logger.error(f"Error during ProBat CSV generation: {e}")
                raise

        return create_csv_streaming_response(generate_csv, "probat")

"""ProBat CSV export service."""

import csv
import logging
import os
from collections import defaultdict
from io import StringIO
from typing import List

from fastapi.responses import StreamingResponse

from ..constants import ExportConstants, resolve_probat_species
from ..data import extract_bounding_box_coordinates, get_filtered_annotation_tasks
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


def split_into_segments(annotations: list, posttrigger_ms: int | None) -> list[list]:
    """Virtually split a recording like bcAdmin's batcorder simulation.

    A new segment starts when the silence between the end of the calls so far and the
    next call exceeds the simulated posttrigger. ``None`` keeps a single segment.
    """
    if not annotations:
        return []
    if posttrigger_ms is None:
        return [list(annotations)]

    timed = []
    untimed = []
    for annotation in annotations:
        coords = extract_bounding_box_coordinates(annotation.geometry)
        if coords["start_time"] is None:
            untimed.append(annotation)
        else:
            end = coords["end_time"] if coords["end_time"] is not None else coords["start_time"]
            timed.append((coords["start_time"], end, annotation))
    timed.sort(key=lambda item: item[0])

    gap = posttrigger_ms / 1000
    segments: list[list] = []
    current_end = None
    for start, end, annotation in timed:
        if current_end is None or start - current_end > gap:
            segments.append([])
            current_end = end
        else:
            current_end = max(current_end, end)
        segments[-1].append(annotation)

    if untimed:
        if segments:
            segments[0].extend(untimed)
        else:
            segments.append(untimed)
    return segments


def segment_filename(dateiname: str, index: int) -> str:
    """First segment keeps the original name; later ones get ``_1``, ``_2``, ..."""
    if index == 0:
        return dateiname
    stem, ext = os.path.splitext(dateiname)
    return f"{stem}_{index}{ext}"


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
        posttrigger_ms: int | None = None,
    ) -> StreamingResponse:
        """Export annotation data in ProBat CSV format.

        With ``posttrigger_ms`` the recordings are virtually split (originals untouched)
        and the result is a separate file.
        """
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

                    for seg_index, segment in enumerate(
                        split_into_segments(list(task.sound_event_annotations), posttrigger_ms)
                    ):
                        aggregates: dict[str, dict] = defaultdict(
                            lambda: {"prob": None, "rufzahl": 0}
                        )

                        for sound_event_annotation in segment:
                            matching_tags = find_matching_tag_values_on_annotation(
                                sound_event_annotation.tags,
                                tags,
                            )
                            for tag_value in matching_tags:
                                species = resolve_probat_species(tag_value, group_species)
                                aggregates[species]["rufzahl"] += 1
                                conf = max_confidence_for_species(sound_event_annotation, tag_value)
                                if conf is not None:
                                    current = aggregates[species]["prob"]
                                    if current is None or conf > current:
                                        aggregates[species]["prob"] = conf

                        for species, data in aggregates.items():
                            prob_str = (
                                format_probat_number(data["prob"])
                                if data["prob"] is not None
                                else format_probat_number(0.0)
                            )
                            rows.append({
                                "species": species,
                                "prob": prob_str,
                                "aufnahmezeit": aufnahmezeit,
                                "dateiname": segment_filename(dateiname, seg_index),
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

        return create_csv_streaming_response(
            generate_csv,
            "probat" if posttrigger_ms is None else f"probat_posttrigger_{posttrigger_ms}ms",
        )

"""Dump export service."""

import csv
import logging
from io import StringIO
from typing import List
from uuid import UUID

from fastapi.responses import StreamingResponse

from ..constants import ExportConstants
from ..data import extract_annotation_data, extract_batch, load_status_badges_for_batch
from ..utils import create_csv_streaming_response
from .base import BaseExportService


class DumpService(BaseExportService):
    """Service for dump format exports."""

    async def export_dump(self, annotation_project_uuids: List[UUID]) -> StreamingResponse:
        """Export sound event annotation data in CSV format with streaming."""
        logger = logging.getLogger(__name__)

        # Get the projects and their IDs
        project_ids, _ = await self.resolve_projects(annotation_project_uuids)

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
                    batch_annotations = await extract_batch(self.session, project_ids, offset, batch_size)

                    if not batch_annotations:
                        break

                    # Load status badges for this batch
                    await load_status_badges_for_batch(self.session, batch_annotations)

                    # Process each annotation in the batch
                    for annotation in batch_annotations:
                        try:
                            data = await extract_annotation_data(annotation)

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

        return create_csv_streaming_response(generate_csv, "dump")

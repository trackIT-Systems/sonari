"""REST API routes for exports."""

import datetime
from io import BytesIO
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query
from fastapi.responses import Response
from openpyxl import Workbook

from sonari import api, models
from sonari.routes.dependencies import Session

__all__ = [
    "export_router",
]


export_router = APIRouter()


@export_router.get("/multibase/")
async def export_multibase(
    session: Session,
    annotation_project_uuids: Annotated[list[UUID], Query()],
    tags: Annotated[list[str], Query()],
    statuses: Annotated[list[str] | None, Query()] = None,
    include_notes: bool = True,
    date_format: str = "DD.MM.YYYY",
) -> Response:
    """Export annotation projects in MultiBase format."""
    # Get the projects and their IDs
    projects = await api.annotation_projects.get_many(
        session, limit=-1, filters=[models.AnnotationProject.uuid.in_(annotation_project_uuids)]
    )
    project_ids = [p.id for p in projects[0]]

    # Build filters for annotation tasks
    filters = [
        models.AnnotationTask.annotation_project_id.in_(project_ids),
    ]
    if statuses:
        filters.append(models.AnnotationTask.status_badges.any(models.AnnotationStatusBadge.state.in_(statuses)))

    # Get annotation tasks
    tasks = await api.annotation_tasks.get_many(
        session,
        limit=-1,
        filters=filters,
    )

    # Create a new workbook and select the active sheet
    wb = Workbook()
    ws = wb.active
    if ws is None:
        return Response(status_code=422)
    ws.title = "Beobachtungen"

    # Append the header to the excel file
    ws.append([
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
    ])

    for task in tasks[0]:
        if not task.clip_annotation:
            continue

        clip_annotation = task.clip_annotation
        clip_annotation_notes = "|"

        if include_notes:
            for n in clip_annotation.notes:
                clip_annotation_notes += f" {n.message} "
                clip_annotation_notes += "|"

        for sound_event_annotation in clip_annotation.sound_events:
            tag_set = {f"{tag.key}:{tag.value}" for tag in sound_event_annotation.tags}
            for tag in tags:
                if tag in tag_set:
                    if not task.clip:
                        continue

                    species = tag.split(":")[-1]

                    date = task.clip.recording.date
                    if date is None:
                        date = ""
                        day = ""
                        month = ""
                        year = ""
                        date_str = ""
                    else:
                        if date_format == "DD.MM.YYYY":
                            date_str = date.strftime("%d.%m.%Y")
                        else:
                            date_str = str(date)
                        day = date.day
                        month = date.month
                        year = date.year

                    station = task.clip.recording.path.stem.split("_")[0]
                    latitude = task.clip.recording.latitude
                    longitude = task.clip.recording.longitude

                    # Write the content to the worksheet
                    ws.append(
                        f"{species};{date_str};{day};{month};{year};;;{station};{latitude};{longitude};4326;Akustik;{clip_annotation_notes}".split(
                            ";"
                        )
                    )

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

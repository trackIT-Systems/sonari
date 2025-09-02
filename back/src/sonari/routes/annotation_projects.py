"""REST API routes for annotation projects."""

import datetime
import json
from io import BytesIO
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, UploadFile
from fastapi.responses import Response
from openpyxl import Workbook
from soundevent.io.aoef import to_aeof

from sonari import api, models, schemas
from sonari.api.io import aoef
from sonari.filters.annotation_projects import AnnotationProjectFilter
from sonari.routes.dependencies import Session, SonariSettings
from sonari.routes.types import Limit, Offset

__all__ = [
    "annotation_projects_router",
]


annotation_projects_router = APIRouter()


@annotation_projects_router.get(
    "/",
    response_model=schemas.Page[schemas.AnnotationProject],
)
async def get_annotation_projects(
    session: Session,
    filter: Annotated[
        AnnotationProjectFilter, Depends(AnnotationProjectFilter)  # type: ignore
    ],
    limit: Limit = 10,
    offset: Offset = 0,
):
    """Get a page of annotation projects."""
    projects, total = await api.annotation_projects.get_many(
        session,
        limit=limit,
        offset=offset,
        filters=[filter],
    )
    return schemas.Page(
        items=projects,
        total=total,
        limit=limit,
        offset=offset,
    )


@annotation_projects_router.post(
    "/",
    response_model=schemas.AnnotationProject,
)
async def create_annotation_project(
    session: Session,
    data: schemas.AnnotationProjectCreate,
):
    """Create an annotation project."""
    annotation_project = await api.annotation_projects.create(
        session,
        name=data.name,
        description=data.description,
        annotation_instructions=data.annotation_instructions,
    )
    await session.commit()
    return annotation_project


@annotation_projects_router.get(
    "/detail/",
    response_model=schemas.AnnotationProject,
)
async def get_annotation_project(
    session: Session,
    annotation_project_uuid: UUID,
):
    """Get an annotation project."""
    return await api.annotation_projects.get(session, annotation_project_uuid)


@annotation_projects_router.patch(
    "/detail/",
    response_model=schemas.AnnotationProject,
)
async def update_annotation_project(
    session: Session,
    annotation_project_uuid: UUID,
    data: schemas.AnnotationProjectUpdate,
):
    """Update an annotation project."""
    annotation_project = await api.annotation_projects.get(
        session,
        annotation_project_uuid,
    )
    annotation_project = await api.annotation_projects.update(
        session,
        annotation_project,
        data,
    )
    await session.commit()
    return annotation_project


@annotation_projects_router.delete(
    "/detail/",
    response_model=schemas.AnnotationProject,
)
async def delete_annotation_project(
    session: Session,
    annotation_project_uuid: UUID,
):
    """Delete an annotation project."""
    annotation_project = await api.annotation_projects.get(
        session,
        annotation_project_uuid,
    )
    project = await api.annotation_projects.delete(session, annotation_project)
    await session.commit()
    return project


@annotation_projects_router.post(
    "/detail/tags/",
    response_model=schemas.AnnotationProject,
)
async def add_tag_to_annotation_project(
    session: Session,
    annotation_project_uuid: UUID,
    key: str,
    value: str,
):
    """Add a tag to an annotation project."""
    annotation_project = await api.annotation_projects.get(
        session,
        annotation_project_uuid,
    )
    tag = await api.tags.get(session, (key, value))
    project = await api.annotation_projects.add_tag(
        session,
        annotation_project,
        tag,
    )
    await session.commit()
    return project


@annotation_projects_router.delete(
    "/detail/tags/",
    response_model=schemas.AnnotationProject,
)
async def remove_tag_from_annotation_project(
    session: Session,
    annotation_project_uuid: UUID,
    key: str,
    value: str,
):
    """Remove a tag from an annotation project."""
    annotation_project = await api.annotation_projects.get(
        session,
        annotation_project_uuid,
    )
    tag = await api.tags.get(session, (key, value))
    project = await api.annotation_projects.remove_tag(
        session,
        annotation_project,
        tag,
    )
    await session.commit()
    return project


async def export_annotation_project_soundevent(
    session: Session,
    annotation_project_uuids: list[UUID],
):
    """Export an annotation project."""
    all_objs = []
    for uuid in annotation_project_uuids:
        sonari_project = await api.annotation_projects.get(session, uuid)
        soundevent_project = await api.annotation_projects.to_soundevent(session, sonari_project)
        obj = to_aeof(soundevent_project)
        all_objs.append(obj.model_dump())
    filename = "soundevent_export.json"
    return Response(
        all_objs,
        media_type="application/json",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


async def export_annotation_project_multibase(
    session: Session,
    project_ids: list[int],
    tags: Annotated[list[str], Query()],
    statuses: Annotated[list[str] | None, Query()] = None,
) -> Response:
    """Export an annotation project."""
    filters = [
        models.AnnotationTask.annotation_project_id.in_(project_ids),
    ]
    if statuses:
        filters.append(models.AnnotationTask.status_badges.any(models.AnnotationStatusBadge.state.in_(statuses)))
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

        clip_annotation: schemas.ClipAnnotation = task.clip_annotation
        clip_annotation_notes: str = "|"
        for n in clip_annotation.notes:
            clip_annotation_notes += f" {n.message} "
            clip_annotation_notes += "|"

        for sound_event_annotation in clip_annotation.sound_events:
            tag_set: set[str] = {f"{tag.key}:{tag.value}" for tag in sound_event_annotation.tags}
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
                    else:
                        day = date.day
                        month = date.month
                        year = date.year

                    station = task.clip.recording.path.stem.split("_")[0]
                    latitude = task.clip.recording.latitude
                    longitude = task.clip.recording.longitude

                    # Write the content to the worksheet
                    ws.append(
                        f"{species};{date};{day};{month};{year};;;{station};{latitude};{longitude};4326;Akustik;{clip_annotation_notes}".split(
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


@annotation_projects_router.get(
    "/detail/export/",
)
async def export_annotation_project(
    session: Session,
    annotation_project_uuids: Annotated[list[UUID], Query()],
    tags: Annotated[list[str], Query()],
    format: str,
    statuses: Annotated[list[str] | None, Query()] = None,
) -> Response:
    projects = await api.annotation_projects.get_many(
        session, limit=-1, filters=[models.AnnotationProject.uuid.in_(annotation_project_uuids)]
    )
    project_ids = [p.id for p in projects[0]]
    if format == "MultiBase":
        return await export_annotation_project_multibase(session, project_ids, tags, statuses)
    else:
        return Response(status_code=501)


@annotation_projects_router.post(
    "/import/",
    response_model=schemas.AnnotationProject,
)
async def import_annotation_project(
    settings: SonariSettings,
    session: Session,
    annotation_project: UploadFile,
):
    """Import an annotation project."""
    obj = json.loads(annotation_project.file.read())

    db_dataset = await aoef.import_annotation_project(
        session,
        obj,
        audio_dir=settings.audio_dir,
        base_audio_dir=settings.audio_dir,
    )
    await session.commit()
    await session.refresh(db_dataset)
    return schemas.AnnotationProject.model_validate(db_dataset)

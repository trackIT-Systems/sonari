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

from whombat import api, models, schemas
from whombat.api.io import aoef
from whombat.api.users import detector_users
from whombat.filters.annotation_projects import AnnotationProjectFilter
from whombat.routes.dependencies import Session, WhombatSettings
from whombat.routes.types import Limit, Offset

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
    annotation_project_uuid: UUID,
):
    """Export an annotation project."""
    whombat_project = await api.annotation_projects.get(session, annotation_project_uuid)
    project = await api.annotation_projects.to_soundevent(session, whombat_project)
    obj = to_aeof(project)
    filename = f"{project.name}_{obj.created_on.isoformat()}.json"
    return Response(
        obj.model_dump_json(),
        media_type="application/json",
        status_code=200,
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


async def export_annotation_project_multibase(
    session: Session,
    annotation_project_uuid: UUID,
    tags: Annotated[list[str], Query()],
    statuses: Annotated[list[str], Query()],
) -> Response:
    """Export an annotation project."""
    project = await api.annotation_projects.get(session, annotation_project_uuid)
    tasks = await api.annotation_tasks.get_many(
        session,
        limit=-1,
        filters=[
            models.AnnotationTask.annotation_project_id == project.id,
            models.AnnotationTask.status_badges.any(models.AnnotationStatusBadge.state.in_(statuses)),
        ],
    )

    # Create a new workbook and select the active sheet
    wb = Workbook()
    ws = wb.active
    if ws is None:
        return Response(status_code=422)
    ws.title = "Beobachtungen"

    # Append the header to the excel file
    ws.append(
        [
            "Art",
            "Datum",
            "Tag",
            "Monat",
            "Jahr",
            "Beobachter",
            "Bestimmer",
            "Herkunft",
            "Quelle",
            "Sammlung",
            "Fundort",
            "Fundort_Zusatz",
            "MTB",
            "Quadrant",
            "X",
            "Y",
            "EPSG",
            "Toleranz",
            "Hoehe",
            "Biotop",
            "Region",
            "Nachweistyp",
            "Verhalten",
            "Reproduktion",
            "Quartiertyp",
            "Anzahl",
            "Einheit",
            "Anzahl_maennlich",
            "Anzahl_weiblich",
            "Anzahl_Details",
            "Bemerkung_1",
            "Bemerkung_2",
            "Ringnummer",
            "Merkmal",
            "Status",
            "Brutrevier",
            "Anzahl",
            "Einheit",
        ]
    )

    for task in tasks[0]:
        if not task.clip_annotation:
            continue

        clip_annotation: schemas.ClipAnnotation = task.clip_annotation
        clip_annotation_notes: list[str] = []
        for n in clip_annotation.notes:
            clip_annotation_notes.append(n.message)

        for sound_event_annotation in clip_annotation.sound_events:
            tag_set: set[str] = {f"{tag.key}:{tag.value}" for tag in sound_event_annotation.tags}
            for tag in tags:
                if tag in tag_set:
                    if not task.clip:
                        continue

                    species = tag.split(":")[-1]

                    date = task.clip.recording.date
                    if date is None:
                        continue

                    station = task.clip.recording.path.stem.split("_")[0]

                    sound_event_notes: list[str] = []
                    for n in sound_event_annotation.notes:
                        msg: str = n.message
                        if msg.startswith(f"{species},"):
                            msg = msg.replace(f"{species},", "")

                        sound_event_notes.append(msg)

                    status = []
                    for s in task.status_badges:
                        username: str = s.user.name if s.user and s.user.name else ""
                        state: str = s.state.name
                        if username in detector_users:
                            continue
                        if state == "rejected" and username == "":
                            continue
                        status = list(map(lambda x: f"{state} ({username})", task.status_badges))

                    # Write the content to the worksheet
                    ws.append(
                        f"{species};{date};{date.day};{date.month};{date.year};trackIT Systems/Bioplan Marburg;trackIT Systems/Bioplan Marburg;;;;{station};;;;{station}x;{station}y;4326;;;;;Akustik;;;;;;;;;{sound_event_notes};{clip_annotation_notes};;;{status};;1;Revier(e)".split(
                            ";"
                        )
                    )

    # Save the workbook to a BytesIO object
    excel_file = BytesIO()
    wb.save(excel_file)
    excel_file.seek(0)

    # Generate the filename
    filename = f"{project.name}_{datetime.datetime.now().strftime('%d.%m.%Y_%H_%M')}.xlsx"

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
    annotation_project_uuid: UUID,
    tags: Annotated[list[str], Query()],
    statuses: Annotated[list[str], Query()],
    format: str,
) -> Response:
    if format == "MultiBase":
        return await export_annotation_project_multibase(session, annotation_project_uuid, tags, statuses)
    elif format == "SoundEvent":
        return await export_annotation_project_soundevent(session, annotation_project_uuid)
    else:
        return Response(status_code=501)


@annotation_projects_router.post(
    "/import/",
    response_model=schemas.AnnotationProject,
)
async def import_annotation_project(
    settings: WhombatSettings,
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

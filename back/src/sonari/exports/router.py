"""REST API routes for exports."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query

from .constants import ExportConstants
from .services import DumpService, MultiBaseService, PassesService, StatsService, TimeService
from sonari.routes.dependencies import Session

export_router = APIRouter()


@export_router.get("/multibase/")
async def export_multibase(
    session: Session,
    annotation_project_uuids: Annotated[list[UUID], Query()],
    tags: Annotated[list[str], Query()],
    statuses: Annotated[list[str] | None, Query()] = None,
):
    """Export annotation projects in MultiBase format."""
    service = MultiBaseService(session)
    return await service.export_multibase(annotation_project_uuids, tags, statuses)


@export_router.get("/dump/")
async def export_dump(
    session: Session,
    annotation_project_uuids: Annotated[list[UUID], Query()],
):
    """Export sound event annotation data in CSV format with streaming."""
    service = DumpService(session)
    return await service.export_dump(annotation_project_uuids)


@export_router.get("/passes/")
async def export_passes(
    session: Session,
    annotation_project_uuids: Annotated[list[UUID], Query()],
    tags: Annotated[list[str], Query()],
    statuses: Annotated[list[str] | None, Query()] = None,
    event_count: int = ExportConstants.DEFAULT_EVENT_COUNT,
    time_period_type: str = "predefined",
    predefined_period: Annotated[str | None, Query()] = None,
    custom_period_value: Annotated[int | None, Query()] = None,
    custom_period_unit: Annotated[str | None, Query()] = None,
    start_date: Annotated[str | None, Query()] = None,
    end_date: Annotated[str | None, Query()] = None,
    group_species: bool = False,
):
    """Export passes analysis in CSV format or JSON with chart."""
    service = PassesService(session)
    return await service.export_passes(
        annotation_project_uuids,
        tags,
        statuses,
        event_count,
        time_period_type,
        predefined_period,
        custom_period_value,
        custom_period_unit,
        start_date,
        end_date,
        group_species,
    )


@export_router.get("/stats/")
async def export_stats(
    session: Session,
    annotation_project_uuids: Annotated[list[UUID], Query()],
    tags: Annotated[list[str], Query()],
    statuses: Annotated[list[str] | None, Query()] = None,
    group_species: bool = False,
):
    """Export recording statistics grouped by annotation project, status badge, and tag."""
    service = StatsService(session)
    return await service.export_stats(annotation_project_uuids, tags, statuses, group_species)


@export_router.get("/time/")
async def export_time(
    session: Session,
    annotation_project_uuids: Annotated[list[UUID], Query()],
    tags: Annotated[list[str], Query()],
    statuses: Annotated[list[str] | None, Query()] = None,
    time_period_type: str = "predefined",
    predefined_period: Annotated[str | None, Query()] = None,
    custom_period_value: Annotated[int | None, Query()] = None,
    custom_period_unit: Annotated[str | None, Query()] = None,
    start_date: Annotated[str | None, Query()] = None,
    end_date: Annotated[str | None, Query()] = None,
    group_species: bool = False,
):
    """Export time-based event counts in CSV format or JSON with chart."""
    service = TimeService(session)
    return await service.export_time(
        annotation_project_uuids,
        tags,
        statuses,
        time_period_type,
        predefined_period,
        custom_period_value,
        custom_period_unit,
        start_date,
        end_date,
        group_species,
    )

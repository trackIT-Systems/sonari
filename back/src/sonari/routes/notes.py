"""REST API routes for notes."""

from typing import Annotated

from fastapi import APIRouter, Depends

from sonari import api, schemas
from sonari.filters.notes import NoteFilter
from sonari.routes.dependencies import Session
from sonari.routes.types import Limit, Offset

__all__ = [
    "notes_router",
]

notes_router = APIRouter()


@notes_router.get(
    "/",
    response_model=schemas.Page[schemas.Note],
)
async def get_notes(
    session: Session,
    filter: Annotated[
        NoteFilter,  # type: ignore
        Depends(NoteFilter),
    ],
    limit: Limit = 100,
    offset: Offset = 0,
    sort_by: str | None = "-created_on",
):
    """Get all tags."""
    notes, total = await api.notes.get_many(
        session,
        limit=limit,
        offset=offset,
        filters=[filter],
        sort_by=sort_by,
    )
    return schemas.Page(
        items=notes,
        total=total,
        limit=limit,
        offset=offset,
    )


@notes_router.get(
    "/detail/",
    response_model=schemas.Note,
)
async def get_note(
    session: Session,
    note_id: int,
):
    """Update a note."""
    note = await api.notes.get(session, note_id)
    return note


@notes_router.patch(
    "/detail/",
    response_model=schemas.Note,
)
async def update_note(
    session: Session,
    note_id: int,
    data: schemas.NoteUpdate,
):
    """Update a note."""
    note = await api.notes.get(session, note_id)
    updated = await api.notes.update(
        session,
        note,
        data,
    )
    await session.commit()
    return updated


@notes_router.delete(
    "/detail/",
    response_model=schemas.Note,
)
async def delete_note(
    session: Session,
    note_id: int,
):
    """Update a note."""
    note = await api.notes.get(session, note_id)
    await api.notes.delete(session, note)
    await session.commit()
    return note

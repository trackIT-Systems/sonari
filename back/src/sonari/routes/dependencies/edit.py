"""Edit session id sent by the frontend with sound event edits."""

import uuid
from typing import Annotated

from fastapi import Depends, Header

from sonari.routes.dependencies.auth import CurrentUser
from sonari.services.sound_event_history import EditContext

__all__ = ["EDIT_ID_HEADER", "CurrentEdit"]

EDIT_ID_HEADER = "X-Sonari-Edit-Id"


def get_edit_context(
    user: CurrentUser,
    x_sonari_edit_id: Annotated[str | None, Header()] = None,
) -> EditContext:
    """Edits with the same id are merged in the history; without one, each request is its own edit."""
    try:
        edit_id = uuid.UUID(x_sonari_edit_id) if x_sonari_edit_id else uuid.uuid4()
    except ValueError:
        edit_id = uuid.uuid4()
    return EditContext(user_id=user.id, edit_id=edit_id)


CurrentEdit = Annotated[EditContext, Depends(get_edit_context)]

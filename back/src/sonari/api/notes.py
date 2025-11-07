"""API functions to interact with notes."""

from sqlalchemy.ext.asyncio import AsyncSession

from sonari import models, schemas
from sonari.api.common import BaseAPI

__all__ = [
    "NoteAPI",
    "notes",
]


class NoteAPI(
    BaseAPI[
        int,
        models.Note,
        schemas.Note,
        schemas.NoteCreate,
        schemas.NoteUpdate,
    ]
):
    _model = models.Note
    _schema = schemas.Note

    async def create(
        self,
        session: AsyncSession,
        message: str,
        is_issue: bool = False,
        created_by: schemas.SimpleUser | None = None,
        **kwargs,
    ) -> schemas.Note:
        """Create a note.

        Parameters
        ----------
        session
            The database session to use.
        message
            The note message.
        is_issue
            Whether the note is an issue. Defaults to False. Used to indicate
            that the note is an issue that needs to be resolved.
        created_by
            The user that created the note. Defaults to None.
        **kwargs
            Additional keyword arguments to use when creating the note,
            (e.g. `created_on`.)

        Returns
        -------
        note : schemas.Note
            The created note.
        """
        return await self.create_from_data(
            session,
            schemas.NoteCreate(
                message=message,
                is_issue=is_issue,
            ),
            created_by_id=created_by.id if created_by is not None else None,
            **kwargs,
        )


notes = NoteAPI()

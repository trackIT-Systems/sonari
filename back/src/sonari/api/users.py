"""Sonari Python API to interact with user objects in the database."""

from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from sonari import models, schemas
from sonari.api import common
from sonari.api.common import BaseAPI

__all__ = []


class UserAPI(
    BaseAPI[
        UUID,
        models.User,
        schemas.SimpleUser,
        schemas.UserCreate,
        schemas.UserUpdate,
    ]
):
    """API to interact with user objects in the database."""

    _model = models.User
    _schema = schemas.SimpleUser

    async def get_by_username(
        self,
        session: AsyncSession,
        username: str,
    ) -> schemas.SimpleUser:
        """Get a user by username.

        Parameters
        ----------
        session
            The database session to use.
        username
            The username to use.

        Returns
        -------
        user : schemas.SimpleUser

        Raises
        ------
        sonari.exceptions.NotFoundError
        """
        obj = await common.get_object(session, models.User, models.User.username == username)
        return schemas.SimpleUser.model_validate(obj)

    async def get_by_email(
        self,
        session: AsyncSession,
        email: str,
    ) -> schemas.SimpleUser:
        """Get a user by email.

        Parameters
        ----------
        session
            The database session to use.
        email
            The email to use.

        Returns
        -------
        user : schemas.SimpleUser

        Raises
        ------
        sonari.exceptions.NotFoundError
        """
        obj = await common.get_object(session, models.User, models.User.email == email)
        return schemas.SimpleUser.model_validate(obj)


users = UserAPI()

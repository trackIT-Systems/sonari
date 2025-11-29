"""API functions to interact with tags."""

from typing import Any, Sequence

from sqlalchemy import and_, tuple_
from sqlalchemy.ext.asyncio import AsyncSession

from sonari import exceptions, models, schemas
from sonari.api.common import BaseAPI
from sonari.schemas.users import SimpleUser

__all__ = [
    "TagAPI",
    "tags",
]


class TagAPI(
    BaseAPI[
        tuple[str, str],
        models.Tag,
        schemas.Tag,
        schemas.TagCreate,
        schemas.TagUpdate,
    ]
):
    _model = models.Tag
    _schema = schemas.Tag

    async def create(
        self,
        session: AsyncSession,
        key: str,
        value: str,
        created_by: SimpleUser,
    ) -> schemas.Tag:
        """Create a tag.

        Parameters
        ----------
        session
            The database session.
        key
            The tag key.
        value
            The tag value.

        Returns
        -------
        schemas.Tag
            The tag.
        """
        return await self.create_from_data(
            session,
            key=key,
            value=value,
            created_by_id=created_by.id,
        )

    async def get_or_create(
        self,
        session: AsyncSession,
        key: str,
        value: str,
        created_by: SimpleUser,
    ) -> schemas.Tag:
        """Get a tag by its key and value, or create it if it does not exist.

        Parameters
        ----------
        session
            The database session.
        key
            The tag key.
        value
            The tag value.

        Returns
        -------
        schemas.Tag
            The tag.
        """
        try:
            return await self.get(session, (key, value))
        except exceptions.NotFoundError:
            obj = await self.create(session, key, value, created_by)
            self._update_cache(obj)
            return obj

    def _get_pk_from_obj(self, obj: schemas.Tag) -> tuple[str, str]:
        return obj.key, obj.value

    def _get_pk_condition(self, pk: tuple[str, str]):
        return and_(self._model.key == pk[0], self._model.value == pk[1])

    def _key_fn(self, obj: dict):
        return (obj.get("key"), obj.get("value"))

    def _get_key_column(self):
        return tuple_(
            self._model.key,
            self._model.value,
        )


def find_tag(
    tags: Sequence[schemas.Tag],
    key: str,
    default: Any = None,
) -> schemas.Tag | None:
    """Find a tag from a list of tags by its key.

    Helper function for finding a tag by key. Returns the first tag
    with the given key, or a default value if no tag is found.

    Parameters
    ----------
    tags
        The tags to search.
    key
        The key to search for.
    default
        The default value to return if the tag is not found.

    Returns
    -------
    tag : schemas.Tag | None
        The tag, or the default value if the tag was not found.
    """
    return next((t for t in tags if t.key == key), default)


def find_tag_value(
    tags: Sequence[schemas.Tag],
    key: str,
    default: Any = None,
) -> str | None:
    """Find a the value of a tag from a list of tags by its key.

    Parameters
    ----------
    tags
        The tags to search.
    key
        The key to search for.
    default
        The default value to return if the tag is not found.

    Returns
    -------
    value : float | None
        The tag value, or the default value if the tag was not found.
    """
    tag = find_tag(tags, key)
    if tag is None:
        return default
    return tag.value


tags = TagAPI()

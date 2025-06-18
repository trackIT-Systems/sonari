"""Base API interface."""

from abc import ABC
from typing import Any, Generic, Hashable, Sequence, TypeVar

from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import InstrumentedAttribute
from sqlalchemy.sql._typing import _ColumnExpressionArgument
from sqlalchemy.sql.expression import ColumnElement

from sonari import models
from sonari.api.common.utils import (
    create_object,
    create_objects,
    create_objects_without_duplicates,
    delete_object,
    find_object,
    get_object,
    get_objects,
    update_object,
)
from sonari.filters.base import Filter
from sonari.shared_cache_global import get_shared_cache

SonariModel = TypeVar("SonariModel", bound=models.Base)
SonariSchema = TypeVar("SonariSchema", bound=BaseModel)
CreateSchema = TypeVar("CreateSchema", bound=BaseModel)
UpdateSchema = TypeVar("UpdateSchema", bound=BaseModel)
PrimaryKey = TypeVar("PrimaryKey", bound=Hashable)


class BaseAPI(
    ABC,
    Generic[
        PrimaryKey,
        SonariModel,
        SonariSchema,
        CreateSchema,
        UpdateSchema,
    ],
):
    _schema: type[SonariSchema]
    _model: type[SonariModel]

    def __init__(self):
        pass

    @property
    def _cache(self) -> Any:
        """Get the shared cache, always returns a valid cache object."""
        cache = get_shared_cache()
        return cache

    async def get(
        self,
        session: AsyncSession,
        pk: PrimaryKey,
    ) -> SonariSchema:
        """Get an object by primary key.

        Parameters
        ----------
        session
            The database session to use.
        pk
            The primary key.

        Returns
        -------
        obj
            The object with the given primary key.

        Raises
        ------
        NotFoundError
            If the object could not be found.
        """
        if self._is_in_cache(pk):
            return self._get_from_cache(pk)

        obj = await get_object(
            session,
            self._model,
            self._get_pk_condition(pk),
        )
        data = self._schema.model_validate(obj)
        self._update_cache(data)
        return data

    async def find(
        self,
        session: AsyncSession,
        filters: Sequence[Filter | _ColumnExpressionArgument],
    ) -> SonariSchema:
        obj = await find_object(
            session,
            self._model,
            filters,
        )
        data = self._schema.model_validate(obj)
        return data

    async def get_many(
        self,
        session: AsyncSession,
        *,
        limit: int | None = 1000,
        offset: int | None = 0,
        filters: Sequence[Filter | _ColumnExpressionArgument] | None = None,
        sort_by: _ColumnExpressionArgument | str | None = "-created_on",
        noloads: list[Any] | None = None,
    ) -> tuple[Sequence[SonariSchema], int]:
        """Get many objects.

        Parameters
        ----------
        session
            The SQLAlchemy AsyncSession of the database to use.
        limit
            The maximum number of objects to return, by default 1000
        offset
            The offset to use, by default 0
        filters
            A list of filters to apply, by default None
        sort_by
            The column to sort by, by default None

        Returns
        -------
        objs
            The objects.
        count : int
            The total number of objects. This is the number of objects that
            would have been returned if no limit or offset was applied.
        """
        objs, count = await get_objects(
            session,
            self._model,
            limit=limit,
            offset=offset,
            filters=filters,
            sort_by=sort_by,
            noloads=noloads,
        )
        return [self._schema.model_validate(obj) for obj in objs], count

    async def _create(
        self,
        session: AsyncSession,
        data: CreateSchema | None = None,
        **kwargs,
    ) -> SonariModel:
        """Create an object.

        Parameters
        ----------
        session
            The SQLAlchemy AsyncSession of the database to use.
        data
            The data to use for creation of the object.
        **kwargs
            Additional keyword arguments to pass to the creation function.

        Returns
        -------
        SonariSchema
            The created object.
        """
        return await create_object(session, self._model, data, **kwargs)

    async def create_from_data(
        self,
        session: AsyncSession,
        data: CreateSchema | None = None,
        **kwargs,
    ) -> SonariSchema:
        """Create an object.

        Parameters
        ----------
        session
            The SQLAlchemy AsyncSession of the database to use.
        data
            The data to use for creation of the object.
        **kwargs
            Additional keyword arguments to pass to the creation function.

        Returns
        -------
        SonariSchema
            The created object.
        """
        db_obj = await create_object(session, self._model, data, **kwargs)
        obj = self._schema.model_validate(db_obj)
        self._update_cache(obj)
        return obj

    async def create_many(
        self,
        session: AsyncSession,
        data: Sequence[dict],
    ) -> None | Sequence[SonariSchema]:
        """Create many objects.

        Parameters
        ----------
        session
            The SQLAlchemy AsyncSession of the database to use.
        data
            The data to use for creation of the objects.
        """
        return await create_objects(
            session,
            self._model,
            data,
        )

    async def create_many_without_duplicates(
        self,
        session: AsyncSession,
        data: Sequence[dict],
        return_all: bool = False,
    ) -> Sequence[SonariSchema]:
        """Create many objects.

        Parameters
        ----------
        session
            The SQLAlchemy AsyncSession of the database to use.
        data
            The data to use for creation of the objects.
        return_all
            Whether to return all objects, or only those created.

        Returns
        -------
        objs
            Will only return the created objects, not the existing ones.
        """
        key_column = self._get_key_column()
        objs = await create_objects_without_duplicates(
            session,
            self._model,
            data,
            self._key_fn,
            key_column,
            return_all=return_all,
        )
        return [self._schema.model_validate(obj) for obj in objs]

    async def delete(
        self,
        session: AsyncSession,
        obj: SonariSchema,
    ) -> SonariSchema:
        """Delete an object.

        Parameters
        ----------
        session
            The SQLAlchemy AsyncSession of the database to use.
        obj
            The object to delete.

        Returns
        -------
        obj
            The deleted object.
        """
        pk = self._get_pk_from_obj(obj)
        deleted = await delete_object(
            session,
            self._model,
            self._get_pk_condition(pk),
        )
        obj = self._schema.model_validate(deleted)
        self._clear_from_cache(obj)
        return obj

    async def update(
        self,
        session: AsyncSession,
        obj: SonariSchema,
        data: UpdateSchema,
    ) -> SonariSchema:
        """Update an object.

        Parameters
        ----------
        session
            The SQLAlchemy AsyncSession of the database to use.
        obj
            The object to update.
        data
            The data to use for update.

        Returns
        -------
        SonariSchema
            The updated object.
        """
        pk = self._get_pk_from_obj(obj)
        updated = await update_object(
            session,
            self._model,
            self._get_pk_condition(pk),
            data,
        )
        obj = self._schema.model_validate(updated)
        self._update_cache(obj)
        return obj

    def _is_in_cache(self, pk: PrimaryKey) -> bool:
        """Check if an object is in the cache.

        Parameters
        ----------
        pk
            The primary key.

        Returns
        -------
        bool
            Whether the object is in the cache.
        """
        cache = self._cache
        if cache is None:
            return False

        return pk in cache

    def _get_from_cache(self, pk: PrimaryKey) -> SonariSchema:
        """Get an object from the cache.

        Parameters
        ----------
        pk
            The primary key.

        Returns
        -------
        SonariSchema
            The object.
        """
        return self._cache[pk]

    def _update_cache(self, obj: SonariSchema) -> None:
        """Update the cache.

        Parameters
        ----------
        obj
            The object to update the cache with.
        """
        cache = self._cache
        if cache is None:
            return

        pk = self._get_pk_from_obj(obj)
        cache[pk] = obj

    def _clear_from_cache(self, obj: SonariSchema) -> None:
        """Clear an object from the cache.

        Parameters
        ----------
        obj
            The object to clear from the cache.
        """
        cache = self._cache
        if cache is None:
            return

        pk = self._get_pk_from_obj(obj)
        cache.pop(pk, None)

    def _get_pk_condition(self, pk: PrimaryKey) -> _ColumnExpressionArgument:
        column = getattr(self._model, "uuid", None)
        if not column:
            raise NotImplementedError(f"The model {self._model.__name__} does not have a column named uuid")
        return column == pk

    def _get_pk_from_obj(self, obj: SonariSchema) -> PrimaryKey:
        pk = getattr(obj, "uuid", None)
        if not pk:
            raise NotImplementedError(
                "The primary key could not be retrieved from the object. "
                "The implementation of this method is likely missing."
            )
        return pk

    def _key_fn(self, obj: dict) -> Any:
        """Get a key from an object.

        This key is used to determine whether an object already exists in the
        database when the primary key is not known. This key is used
        internally by the API when creating multiple objects at once,
        as trying to insert an object that already exists in the database
        will result in an error.

        Parameters
        ----------
        obj
            The object to get the key from.

        Returns
        -------
        Any
            The key.
        """
        raise NotImplementedError

    def _get_key_column(self) -> ColumnElement | InstrumentedAttribute:
        """Get a key column.

        Returns
        -------
        ColumnElement | InstrumentedAttribute
            The key column.
        """
        raise NotImplementedError

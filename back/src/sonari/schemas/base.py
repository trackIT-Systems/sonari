"""Base class to use for all schemas in sonari."""

import datetime
from typing import Any, Generic, Sequence, TypeVar

from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import inspect

__all__ = ["BaseSchema", "Page"]


class BaseSchema(BaseModel):
    """Base class for all schemas in sonari.

    All schemas should inherit from this class, either directly or
    indirectly.
    """

    created_on: datetime.datetime = Field(
        repr=False,
        default_factory=lambda: datetime.datetime.now(datetime.UTC),
    )

    model_config = ConfigDict(from_attributes=True)

    @model_validator(mode="before")
    @classmethod
    def _handle_lazy_loading(cls, data: Any) -> Any:
        """Handle lazy-loaded relationships to prevent MissingGreenlet errors.

        When a SQLAlchemy model with lazy-loaded relationships is passed to
        Pydantic for validation, accessing unloaded relationships will trigger
        lazy loading, which fails in async contexts. This validator checks if
        relationships are loaded before Pydantic tries to access them, and sets
        them to None if they're not loaded.
        """
        # Only process SQLAlchemy model instances
        if not hasattr(data, "__dict__") or not hasattr(data, "_sa_instance_state"):
            return data

        # Check which relationships are unloaded
        insp = inspect(data)
        unloaded = insp.unloaded

        # Create a dict from the SQLAlchemy model, but set unloaded relationships to None
        result = {}
        for key in insp.mapper.attrs.keys():
            if key in unloaded:
                result[key] = None
            else:
                result[key] = getattr(data, key)

        return result


M = TypeVar("M")


class Page(BaseModel, Generic[M]):
    """A page of results."""

    items: Sequence[M]
    total: int
    offset: int
    limit: int

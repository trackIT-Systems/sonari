"""Schemas for User objects."""

import uuid

from pydantic import EmailStr

from sonari.schemas.base import BaseSchema


class SimpleUser(BaseSchema):
    """Schema for User objects returned to the user."""

    id: uuid.UUID
    username: str
    email: EmailStr | None = None
    name: str | None = None
    is_active: bool | None = False
    is_superuser: bool | None = False
    is_verified: bool | None = False


class UserCreate(BaseSchema):
    """Schema for User objects created from Keycloak."""

    username: str
    email: EmailStr
    name: str | None = None
    is_active: bool = True
    is_superuser: bool = False
    is_verified: bool = True


class UserUpdate(BaseSchema):
    """Schema for User objects updated by the user."""

    username: str | None = None
    name: str | None = None
    email: EmailStr | None = None
    is_active: bool | None = None
    is_superuser: bool | None = None

"""Keycloak authentication dependencies."""

from typing import Annotated

from fastapi import Depends

from sonari import models
from sonari.system.keycloak import get_current_user

__all__ = [
    "CurrentUser",
]

# Type alias for current user dependency
CurrentUser = Annotated[models.User, Depends(get_current_user)]

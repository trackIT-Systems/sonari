"""OIDC authentication dependencies."""

from typing import Annotated

from fastapi import APIRouter, Depends

from sonari import models
from sonari.system.oidc import get_current_user

__all__ = [
    "CurrentUser",
    "create_authenticated_router",
]

# Type alias for current user dependency
CurrentUser = Annotated[models.User, Depends(get_current_user)]


def create_authenticated_router(**kwargs) -> APIRouter:
    """Create an APIRouter with authentication required for all routes.

    Parameters
    ----------
    **kwargs
        Additional arguments to pass to APIRouter constructor.

    Returns
    -------
    APIRouter
        A router with authentication dependency added.
    """
    # Ensure dependencies list exists
    dependencies = kwargs.get("dependencies", [])

    # Add authentication dependency if not already present
    auth_dependency = Depends(get_current_user)
    if auth_dependency not in dependencies:
        dependencies.append(auth_dependency)

    kwargs["dependencies"] = dependencies
    return APIRouter(**kwargs)

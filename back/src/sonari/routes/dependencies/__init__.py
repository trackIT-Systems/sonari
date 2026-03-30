"""Common FastAPI dependencies for sonari."""

from sonari.routes.dependencies.auth import CurrentOIDCUser, CurrentUser, create_authenticated_router
from sonari.routes.dependencies.session import Session
from sonari.routes.dependencies.settings import SonariSettings

__all__ = [
    "Session",
    "SonariSettings",
    "CurrentUser",
    "CurrentOIDCUser",
    "create_authenticated_router",
]

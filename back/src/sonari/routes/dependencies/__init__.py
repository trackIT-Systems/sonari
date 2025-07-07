"""Common FastAPI dependencies for sonari."""

from sonari.routes.dependencies.auth import CurrentUser
from sonari.routes.dependencies.session import Session
from sonari.routes.dependencies.settings import SonariSettings

__all__ = [
    "Session",
    "SonariSettings",
    "CurrentUser",
]

"""Common FastAPI dependencies for sonari."""

from sonari.routes.dependencies.auth import get_current_user_dependency
from sonari.routes.dependencies.session import Session
from sonari.routes.dependencies.settings import SonariSettings
from sonari.routes.dependencies.users import get_user_db, get_user_manager

__all__ = [
    "Session",
    "SonariSettings",
    "get_user_db",
    "get_user_manager",
    "get_current_user_dependency",
]

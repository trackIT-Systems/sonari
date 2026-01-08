"""Authentication router supporting OIDC."""

from fastapi import APIRouter
from pydantic import BaseModel

from sonari import schemas
from sonari.routes.dependencies.auth import CurrentUser
from sonari.routes.dependencies.settings import SonariSettings

__all__ = [
    "get_auth_router",
]


class AuthConfig(BaseModel):
    """Authentication configuration response."""

    server_url: str
    application: str
    client_id: str


def get_auth_router(settings: SonariSettings) -> APIRouter:
    """Get authentication router supporting OIDC."""
    auth_router = APIRouter()

    @auth_router.get("/config", response_model=AuthConfig)
    async def get_auth_config() -> AuthConfig:
        """Get configuration for frontend OIDC integration."""
        return AuthConfig(
            server_url=settings.oidc_server_url,
            application=settings.oidc_application,
            client_id=settings.oidc_client_id,
        )

    @auth_router.get("/me", response_model=schemas.SimpleUser)
    async def get_current_user_info(
        current_user: CurrentUser,
    ) -> schemas.SimpleUser:
        """Get current user information."""
        return current_user

    return auth_router

"""Authentication router supporting Keycloak OIDC."""

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
    realm: str
    client_id: str


def get_auth_router(settings: SonariSettings) -> APIRouter:
    """Get authentication router supporting Keycloak OIDC."""
    auth_router = APIRouter()

    @auth_router.get("/config", response_model=AuthConfig)
    async def get_auth_config() -> AuthConfig:
        """Get Keycloak configuration for frontend OIDC integration."""
        return AuthConfig(
            server_url=settings.keycloak_server_url,
            realm=settings.keycloak_realm,
            client_id=settings.keycloak_client_id,
        )

    @auth_router.get("/me", response_model=schemas.SimpleUser)
    async def get_current_user_info(
        current_user: CurrentUser,
    ) -> schemas.SimpleUser:
        """Get current user information."""
        return current_user

    return auth_router

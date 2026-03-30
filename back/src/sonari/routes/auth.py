"""Authentication router supporting OIDC."""

from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select

from sonari import models, schemas
from sonari.routes.dependencies.auth import CurrentOIDCUser
from sonari.routes.dependencies.session import Session
from sonari.routes.dependencies.settings import SonariSettings
from sonari.schemas.app_token import (
    AppTokenCreate,
    AppTokenCreated,
    AppTokenPublic,
    app_token_permission_flags,
)
from sonari.system.app_token_auth import insert_app_token

__all__ = [
    "get_auth_router",
]


class AuthConfig(BaseModel):
    """Authentication configuration response."""

    server_url: str
    application: str
    client_id: str
    account_url: str | None = None
    """IdP end-user portal (e.g. password change). None when disabled via settings."""


def get_auth_router(settings: SonariSettings) -> APIRouter:
    """Get authentication router supporting OIDC."""
    auth_router = APIRouter()

    @auth_router.get("/config", response_model=AuthConfig)
    async def get_auth_config() -> AuthConfig:
        """Get configuration for frontend OIDC integration."""
        base = settings.oidc_server_url.rstrip("/")
        if settings.oidc_account_url is not None:
            account_url = settings.oidc_account_url or None
        else:
            account_url = f"{base}/if/user/#/settings"
        return AuthConfig(
            server_url=settings.oidc_server_url,
            application=settings.oidc_application,
            client_id=settings.oidc_client_id,
            account_url=account_url,
        )

    @auth_router.get("/me", response_model=schemas.SimpleUser)
    async def get_current_user_info(
        current_user: CurrentOIDCUser,
    ) -> schemas.SimpleUser:
        """Get current user information."""
        return current_user

    @auth_router.get("/app-tokens", response_model=list[AppTokenPublic])
    async def list_app_tokens(
        session: Session,
        current_user: CurrentOIDCUser,
    ) -> list[AppTokenPublic]:
        stmt = (
            select(models.AppToken)
            .where(models.AppToken.user_id == current_user.id)
            .order_by(models.AppToken.created_on.desc())
        )
        result = await session.execute(stmt)
        rows = result.scalars().all()
        return [AppTokenPublic.model_validate(r) for r in rows]

    @auth_router.post("/app-tokens", response_model=AppTokenCreated)
    async def create_app_token(
        session: Session,
        current_user: CurrentOIDCUser,
        body: AppTokenCreate,
    ) -> AppTokenCreated:
        now = datetime.now(timezone.utc)
        if body.expires_at is not None and body.expires_at <= now:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="expires_at must be in the future",
            )

        can_read, can_write = app_token_permission_flags(body.permissions)
        plaintext, row = await insert_app_token(
            session,
            current_user.id,
            body.title,
            can_read,
            can_write,
            body.expires_at,
        )
        return AppTokenCreated(
            id=row.id,
            title=row.title,
            created_on=row.created_on,
            expires_at=row.expires_at,
            revoked_at=row.revoked_at,
            can_read=row.can_read,
            can_write=row.can_write,
            token=plaintext,
        )

    @auth_router.delete("/app-tokens/{token_id}", status_code=status.HTTP_204_NO_CONTENT)
    async def revoke_app_token(
        session: Session,
        current_user: CurrentOIDCUser,
        token_id: UUID,
    ) -> None:
        stmt = select(models.AppToken).where(
            models.AppToken.id == token_id,
            models.AppToken.user_id == current_user.id,
        )
        result = await session.execute(stmt)
        row = result.scalar_one_or_none()
        if row is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Token not found")
        if row.revoked_at is None:
            row.revoked_at = datetime.now(timezone.utc)
            await session.commit()

    @auth_router.post("/app-tokens/{token_id}/purge", status_code=status.HTTP_204_NO_CONTENT)
    async def purge_app_token(
        session: Session,
        current_user: CurrentOIDCUser,
        token_id: UUID,
    ) -> None:
        """Permanently remove a revoked token row (must revoke first)."""
        stmt = select(models.AppToken).where(
            models.AppToken.id == token_id,
            models.AppToken.user_id == current_user.id,
        )
        result = await session.execute(stmt)
        row = result.scalar_one_or_none()
        if row is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Token not found")
        if row.revoked_at is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Revoke the token before removing it",
            )
        await session.delete(row)
        await session.commit()

    return auth_router

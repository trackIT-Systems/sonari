"""OIDC authentication module for Sonari."""

import logging
from typing import AsyncGenerator, Optional
from uuid import uuid4

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from sonari import models
from sonari.system.database import create_async_db_engine, get_async_session, get_database_url
from sonari.system.settings import get_settings

logger = logging.getLogger(__name__)

# Security scheme for Bearer token
security = HTTPBearer()


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """Get database session for OIDC operations."""
    settings = get_settings()
    url = get_database_url(settings)
    engine = create_async_db_engine(url)
    async with get_async_session(engine) as session:
        yield session


class OIDCUser(BaseModel):
    """OIDC user information from JWT token."""

    sub: str  # OIDC user ID
    preferred_username: str
    email: Optional[str] = None
    given_name: Optional[str] = None
    family_name: Optional[str] = None
    name: Optional[str] = None
    groups: list[str] = None


SecDep = Depends(security)


async def verify_oidc_token(
    credentials: HTTPAuthorizationCredentials = SecDep,
) -> OIDCUser:
    """Verify OIDC JWT token and return user information."""
    try:
        settings = get_settings()
        # Normalize the server URL to ensure no double slashes
        server_url = settings.oidc_server_url.rstrip("/")
        jwks_url = f"{server_url}/application/o/{settings.oidc_application}/jwks/"

        # Create JWKS client and verify token
        jwks_client = PyJWKClient(jwks_url)
        signing_key = jwks_client.get_signing_key_from_jwt(credentials.credentials)

        # First decode without verification to see the actual issuer (for debugging)
        unverified_payload = jwt.decode(credentials.credentials, options={"verify_signature": False})
        actual_issuer = unverified_payload.get("iss")

        payload = jwt.decode(
            credentials.credentials,
            signing_key.key,
            algorithms=["RS256"],
            audience=["account", settings.oidc_client_id],
            issuer=actual_issuer,  # Use the actual issuer from the token
            options={"verify_exp": True},
        )

        # Additional validation: check if token is intended for our client
        azp = payload.get("azp")
        if azp and azp != settings.oidc_client_id:
            logger.error(f"Token not intended for this client. Expected: {settings.oidc_client_id}, Got: {azp}")
            raise jwt.exceptions.InvalidAudienceError("Token not intended for this client")

        return OIDCUser(**payload)

    except jwt.exceptions.InvalidTokenError as e:
        logger.error(f"Token verification error: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication failed",
            headers={"WWW-Authenticate": "Bearer"},
        ) from e
    except Exception as e:
        logger.error(f"Unexpected error during token verification: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication failed",
            headers={"WWW-Authenticate": "Bearer"},
        ) from e


async def get_or_create_user(
    oidc_user: OIDCUser,
    session: AsyncSession,
) -> models.User:
    """Get or create a Sonari user from OIDC user information.

    Uses the OIDC username as the primary identifier for user lookup.
    """
    from sqlalchemy import select

    # Find user by username (primary identifier)
    stmt = select(models.User).where(models.User.username == oidc_user.preferred_username)
    result = await session.execute(stmt)
    user = result.scalar_one_or_none()

    if user:
        # Update existing user information if needed
        updated = False
        if oidc_user.email and user.email != oidc_user.email:
            user.email = oidc_user.email
            updated = True
        if oidc_user.name and user.name != oidc_user.name:
            user.name = oidc_user.name
            updated = True

        if updated:
            await session.commit()
            await session.refresh(user)

        return user

    # Create new user
    full_name = oidc_user.name or f"{oidc_user.given_name or ''} {oidc_user.family_name or ''}".strip()

    new_user = models.User(
        id=uuid4(),
        username=oidc_user.preferred_username,
        email=oidc_user.email or f"{oidc_user.preferred_username}@oidc.local",
        name=full_name or oidc_user.preferred_username,
        hashed_password="",  # Not used with OIDC
        is_active=True,
        is_superuser=_is_superuser(oidc_user),
        is_verified=True,  # OIDC users are considered verified
    )

    session.add(new_user)
    await session.commit()
    await session.refresh(new_user)

    return new_user


def _check_tenant_authorization(oidc_user: OIDCUser, domain: str) -> None:
    """Check if user is authorized for the tenant domain.

    Raises HTTPException 403 if user is not in tenant_{domain} or ts_admin group.
    """
    if not oidc_user.groups:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
        )

    required_group = f"tenant_{domain}"
    admin_group = "ts_admin"

    if required_group not in oidc_user.groups and admin_group not in oidc_user.groups:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"User is not authorized for tenant '{domain}'",
        )


def _is_superuser(oidc_user: OIDCUser) -> bool:
    """Check if OIDC user should be a superuser based on groups."""
    # Check groups for ts_admin
    if oidc_user.groups and "ts_admin" in oidc_user.groups:
        return True

    return False


# Dependencies at module level
SessionDep = Depends(get_session)
OIDCUserDep = Depends(verify_oidc_token)


async def get_current_user(
    session: AsyncSession = SessionDep,
    oidc_user: OIDCUser = OIDCUserDep,
) -> models.User:
    """Get current authenticated user from OIDC token."""
    settings = get_settings()

    # Check tenant authorization
    _check_tenant_authorization(oidc_user, settings.domain)

    return await get_or_create_user(oidc_user, session)

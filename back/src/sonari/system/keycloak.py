"""Keycloak authentication module for Sonari."""

import logging
from typing import AsyncGenerator, Dict, List, Optional
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
    """Get database session for Keycloak operations."""
    settings = get_settings()
    url = get_database_url(settings)
    engine = create_async_db_engine(url)
    async with get_async_session(engine) as session:
        yield session


class KeycloakUser(BaseModel):
    """Keycloak user information from JWT token."""

    sub: str  # Keycloak user ID
    preferred_username: str
    email: Optional[str] = None
    given_name: Optional[str] = None
    family_name: Optional[str] = None
    name: Optional[str] = None
    realm_access: Optional[Dict[str, List[str]]] = None
    resource_access: Optional[Dict[str, Dict[str, List[str]]]] = None


SecDep = Depends(security)


async def verify_keycloak_token(
    credentials: HTTPAuthorizationCredentials = SecDep,
) -> KeycloakUser:
    """Verify Keycloak JWT token and return user information."""
    try:
        settings = get_settings()
        jwks_url = f"{settings.keycloak_server_url}realms/{settings.keycloak_realm}/protocol/openid-connect/certs"

        # Create JWKS client and verify token
        jwks_client = PyJWKClient(jwks_url)
        signing_key = jwks_client.get_signing_key_from_jwt(credentials.credentials)

        payload = jwt.decode(
            credentials.credentials,
            signing_key.key,
            algorithms=["RS256"],
            audience=["account", settings.keycloak_client_id],
            issuer=f"{settings.keycloak_server_url}realms/{settings.keycloak_realm}",
            options={"verify_exp": True},
        )

        # Additional validation: check if token is intended for our client
        azp = payload.get("azp")
        if azp and azp != settings.keycloak_client_id:
            logger.error(f"Token not intended for this client. Expected: {settings.keycloak_client_id}, Got: {azp}")
            raise jwt.exceptions.InvalidAudienceError("Token not intended for this client")

        return KeycloakUser(**payload)

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
    keycloak_user: KeycloakUser,
    session: AsyncSession,
) -> models.User:
    """Get or create a Sonari user from Keycloak user information.

    Uses the Keycloak username as the primary identifier for user lookup.
    """
    from sqlalchemy import select

    # Find user by username (primary identifier)
    stmt = select(models.User).where(models.User.username == keycloak_user.preferred_username)
    result = await session.execute(stmt)
    user = result.scalar_one_or_none()

    if user:
        # Update existing user information if needed
        updated = False
        if keycloak_user.email and user.email != keycloak_user.email:
            user.email = keycloak_user.email
            updated = True
        if keycloak_user.name and user.name != keycloak_user.name:
            user.name = keycloak_user.name
            updated = True

        if updated:
            await session.commit()
            await session.refresh(user)

        return user

    # Create new user
    full_name = keycloak_user.name or f"{keycloak_user.given_name or ''} {keycloak_user.family_name or ''}".strip()

    new_user = models.User(
        id=uuid4(),
        username=keycloak_user.preferred_username,
        email=keycloak_user.email or f"{keycloak_user.preferred_username}@keycloak.local",
        name=full_name or keycloak_user.preferred_username,
        hashed_password="",  # Not used with Keycloak
        is_active=True,
        is_superuser=_is_superuser(keycloak_user),
        is_verified=True,  # Keycloak users are considered verified
    )

    session.add(new_user)
    await session.commit()
    await session.refresh(new_user)

    return new_user


def _is_superuser(keycloak_user: KeycloakUser) -> bool:
    """Check if Keycloak user should be a superuser based on roles."""
    # Check realm roles
    if keycloak_user.realm_access and "ts_admin" in keycloak_user.realm_access.get("roles", []):
        return True

    # Check client roles
    if keycloak_user.resource_access:
        for _, access in keycloak_user.resource_access.items():
            if "ts_admin" in access.get("roles", []):
                return True

    return False


# Dependencies at module level
SessionDep = Depends(get_session)
KeycloakUserDep = Depends(verify_keycloak_token)


async def get_current_user(
    session: AsyncSession = SessionDep,
    keycloak_user: KeycloakUser = KeycloakUserDep,
) -> models.User:
    """Get current authenticated user from Keycloak token."""
    return await get_or_create_user(keycloak_user, session)

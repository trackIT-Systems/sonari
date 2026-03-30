"""OIDC authentication module for Sonari."""

import logging
from typing import AsyncGenerator, Optional
from uuid import uuid4

import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from sonari import models
from sonari.system.app_token_auth import authenticate_app_token, looks_like_sonari_app_token
from sonari.system.database import get_async_session, get_database_url, get_or_create_async_engine
from sonari.system.settings import Settings, get_settings

logger = logging.getLogger(__name__)

# Security scheme for Bearer token
security = HTTPBearer()

# Cached JWKS client instance (reused across all requests within each worker process)
# Note: With multiple uvicorn workers, each worker process will have its own cached instance.
# This is fine because PyJWKClient has built-in caching (default 300 seconds) for JWKS keys.
_jwks_client: Optional[PyJWKClient] = None


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """Get database session for OIDC operations."""
    settings = get_settings()
    url = get_database_url(settings)
    engine = get_or_create_async_engine(url)
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
    groups: Optional[list[str]] = None


SecDep = Depends(security)


def _expected_oidc_issuer(settings: Settings) -> str:
    """Authentik-style issuer URL (must match the access token ``iss`` claim exactly)."""
    server_url = settings.oidc_server_url.rstrip("/")
    return f"{server_url}/application/o/{settings.oidc_application}/"


def _superuser_from_oidc_groups(oidc_user: OIDCUser) -> bool:
    return bool(oidc_user.groups and "ts_admin" in oidc_user.groups)


def _require_active_user(user: models.User) -> None:
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive",
        )


async def _maybe_sync_superuser_from_oidc(
    session: AsyncSession,
    user: models.User,
    oidc_user: OIDCUser,
) -> None:
    want = _superuser_from_oidc_groups(oidc_user)
    if user.is_superuser != want:
        user.is_superuser = want
        await session.commit()
        await session.refresh(user)


def _get_jwks_client() -> PyJWKClient:
    """Get or create the cached JWKS client instance.

    The JWKS client is cached at module level to avoid creating a new instance
    and fetching JWKS keys on every request, which significantly improves performance.

    With multiple uvicorn workers, each worker process will have its own cached instance.
    PyJWKClient has built-in caching (default 300 seconds) for JWKS keys, so reusing
    the instance leverages that cache effectively.

    Returns
    -------
    PyJWKClient
        The cached JWKS client instance for this worker process.

    """
    global _jwks_client

    if _jwks_client is None:
        settings = get_settings()
        server_url = settings.oidc_server_url.rstrip("/")
        jwks_url = f"{server_url}/application/o/{settings.oidc_application}/jwks/"

        # Create JWKS client with caching enabled (default: 300 seconds)
        # This will cache the JWKS keys locally, reducing auth server requests
        _jwks_client = PyJWKClient(jwks_url)
        logger.info(f"Initialized JWKS client for {jwks_url}")

    return _jwks_client


async def verify_oidc_token_credentials(credentials: HTTPAuthorizationCredentials) -> OIDCUser:
    """Verify OIDC JWT from Bearer credentials and return user information."""
    try:
        settings = get_settings()

        # Use cached JWKS client instead of creating a new one on every request
        # This significantly improves performance by reusing the client and its
        # built-in JWKS key cache across all requests within this worker process.
        jwks_client = _get_jwks_client()
        signing_key = jwks_client.get_signing_key_from_jwt(credentials.credentials)
        expected_iss = _expected_oidc_issuer(settings)

        payload = jwt.decode(
            credentials.credentials,
            signing_key.key,
            algorithms=["RS256"],
            audience=["account", settings.oidc_client_id],
            issuer=expected_iss,
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


async def verify_oidc_token(
    credentials: HTTPAuthorizationCredentials = SecDep,
) -> OIDCUser:
    """Verify OIDC JWT token and return user information."""
    return await verify_oidc_token_credentials(credentials)


async def get_or_create_user(
    oidc_user: OIDCUser,
    session: AsyncSession,
) -> models.User:
    """Get or create a Sonari user from OIDC user information.

    Uses the OIDC username as the primary identifier for user lookup.
    Falls back to email lookup if username is not found, to handle cases
    where a user exists with the same email but different username.
    """
    from sqlalchemy import select
    from sqlalchemy.exc import IntegrityError

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
        want_super = _superuser_from_oidc_groups(oidc_user)
        if user.is_superuser != want_super:
            user.is_superuser = want_super
            updated = True

        if updated:
            await session.commit()
            await session.refresh(user)

        return user

    # If not found by username and email is provided, check by email
    # This handles cases where a user exists with the same email but different username
    if oidc_user.email:
        stmt = select(models.User).where(models.User.email == oidc_user.email)
        result = await session.execute(stmt)
        user = result.scalar_one_or_none()

        if user:
            # User exists with same email but different username - update username
            logger.info(
                f"User found by email {oidc_user.email} with username {user.username}, "
                f"updating to {oidc_user.preferred_username}"
            )
            user.username = oidc_user.preferred_username
            updated = False
            if oidc_user.name and user.name != oidc_user.name:
                user.name = oidc_user.name
                updated = True
            want_super = _superuser_from_oidc_groups(oidc_user)
            if user.is_superuser != want_super:
                user.is_superuser = want_super
                updated = True

            await session.commit()
            await session.refresh(user)
            return user

    # Create new user
    full_name = oidc_user.name or f"{oidc_user.given_name or ''} {oidc_user.family_name or ''}".strip()
    user_email = oidc_user.email or f"{oidc_user.preferred_username}@oidc.local"

    new_user = models.User(
        id=uuid4(),
        username=oidc_user.preferred_username,
        email=user_email,
        name=full_name or oidc_user.preferred_username,
        hashed_password="",  # Not used with OIDC
        is_active=True,
        is_superuser=_superuser_from_oidc_groups(oidc_user),
        is_verified=True,  # OIDC users are considered verified
    )

    session.add(new_user)

    try:
        await session.commit()
        await session.refresh(new_user)
        return new_user
    except IntegrityError as e:
        # Handle race condition: another request created the user between our check and creation
        await session.rollback()

        # Check if it's a unique constraint violation
        error_str = str(e.orig) if hasattr(e, "orig") else str(e)
        if "unique constraint" in error_str.lower() or "duplicate key" in error_str.lower():
            logger.warning(
                f"Race condition detected: user creation failed due to unique constraint. "
                f"Retrying lookup for username={oidc_user.preferred_username}, email={user_email}"
            )

            # Retry lookup by username first
            stmt = select(models.User).where(models.User.username == oidc_user.preferred_username)
            result = await session.execute(stmt)
            user = result.scalar_one_or_none()

            if user:
                await _maybe_sync_superuser_from_oidc(session, user, oidc_user)
                return user

            # Retry lookup by email if provided
            if oidc_user.email:
                stmt = select(models.User).where(models.User.email == oidc_user.email)
                result = await session.execute(stmt)
                user = result.scalar_one_or_none()

                if user:
                    await _maybe_sync_superuser_from_oidc(session, user, oidc_user)
                    return user

        # Re-raise if we couldn't handle it
        raise


def _check_tenant_authorization(oidc_user: OIDCUser, domain: str) -> None:
    """Check if user is authorized for the tenant domain.

    Raises HTTPException 403 if user is not in tenant_{domain} ts_admin or ts_staff group.
    """
    if not oidc_user.groups:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
        )

    required_group = f"tenant_{domain}"
    admin_group = "ts_admin"
    staff_group = "ts_staff"

    if (
        required_group not in oidc_user.groups
        and admin_group not in oidc_user.groups
        and staff_group not in oidc_user.groups
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"User is not authorized for tenant '{domain}'",
        )


# Dependencies at module level
SessionDep = Depends(get_session)
OIDCUserDep = Depends(verify_oidc_token)


def _app_token_http_method_is_read(method: str) -> bool:
    return method in ("GET", "HEAD")


async def get_current_user(
    request: Request,
    session: AsyncSession = SessionDep,
    credentials: HTTPAuthorizationCredentials = SecDep,
) -> models.User:
    """Get current user from Sonari app token or OIDC JWT (Bearer)."""
    token = credentials.credentials
    if looks_like_sonari_app_token(token):
        # Tenant/group checks apply only to OIDC Bearer tokens, not Sonari app tokens.
        user, app_token_row = await authenticate_app_token(session, token)
        if _app_token_http_method_is_read(request.method):
            if not app_token_row.can_read:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="App token does not allow read access",
                )
        elif not app_token_row.can_write:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="App token does not allow write access",
            )
    else:
        oidc_user = await verify_oidc_token_credentials(credentials)
        settings = get_settings()
        _check_tenant_authorization(oidc_user, settings.domain)
        user = await get_or_create_user(oidc_user, session)
    _require_active_user(user)
    return user


async def get_current_user_oidc(
    request: Request,
    session: AsyncSession = SessionDep,
    credentials: HTTPAuthorizationCredentials = SecDep,
) -> models.User:
    """Require an OIDC access token (not a Sonari app token)."""
    if looks_like_sonari_app_token(credentials.credentials):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="OIDC session required for this endpoint",
        )
    oidc_user = await verify_oidc_token_credentials(credentials)
    settings = get_settings()
    _check_tenant_authorization(oidc_user, settings.domain)
    user = await get_or_create_user(oidc_user, session)
    _require_active_user(user)
    return user

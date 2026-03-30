"""Sonari opaque app token parsing and verification."""

from __future__ import annotations

import secrets
from datetime import datetime, timezone
from uuid import UUID, uuid4

import bcrypt
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from sonari import models

SONARI_APP_TOKEN_PREFIX = "snr."


def looks_like_sonari_app_token(raw: str) -> bool:
    """Heuristic: OIDC JWTs start with eyJ; our tokens start with snr."""
    return raw.startswith(SONARI_APP_TOKEN_PREFIX)


def parse_sonari_app_token(raw: str) -> tuple[UUID, str] | None:
    """Parse ``snr.<uuid>.<secret>`` into token id and secret."""
    if not looks_like_sonari_app_token(raw):
        return None
    body = raw[len(SONARI_APP_TOKEN_PREFIX) :]
    parts = body.split(".", 1)
    if len(parts) != 2:
        return None
    token_id_str, secret = parts
    try:
        token_id = UUID(token_id_str)
    except ValueError:
        return None
    if not secret:
        return None
    return token_id, secret


def generate_app_token_secret() -> str:
    """Random high-entropy secret (bcrypt-safe length)."""
    return secrets.token_urlsafe(32)


def format_app_token(token_id: UUID, secret: str) -> str:
    return f"{SONARI_APP_TOKEN_PREFIX}{token_id}.{secret}"


def hash_app_token_secret(secret: str) -> str:
    return bcrypt.hashpw(secret.encode("utf-8"), bcrypt.gensalt()).decode("ascii")


def verify_app_token_secret(secret: str, secret_hash: str) -> bool:
    try:
        return bcrypt.checkpw(secret.encode("utf-8"), secret_hash.encode("ascii"))
    except ValueError:
        return False


async def authenticate_app_token(session: AsyncSession, raw_token: str) -> tuple[models.User, models.AppToken]:
    """Validate Bearer app token and return the owning user and token row, or raise 401."""
    parsed = parse_sonari_app_token(raw_token)
    if parsed is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid app token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token_id, secret = parsed

    stmt = select(models.AppToken).where(models.AppToken.id == token_id).options(selectinload(models.AppToken.user))
    result = await session.execute(stmt)
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication failed",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if row.revoked_at is not None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token revoked",
            headers={"WWW-Authenticate": "Bearer"},
        )
    now = datetime.now(timezone.utc)
    if row.expires_at is not None and row.expires_at <= now:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not verify_app_token_secret(secret, row.secret_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication failed",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return row.user, row


async def insert_app_token(
    session: AsyncSession,
    user_id: UUID,
    title: str,
    can_read: bool,
    can_write: bool,
    expires_at: datetime | None,
) -> tuple[str, models.AppToken]:
    """Persist a new app token and return the one-time plaintext and the row."""
    token_id = uuid4()
    secret = generate_app_token_secret()
    plaintext = format_app_token(token_id, secret)
    row = models.AppToken(
        id=token_id,
        user_id=user_id,
        title=title,
        secret_hash=hash_app_token_secret(secret),
        expires_at=expires_at,
        can_read=can_read,
        can_write=can_write,
    )
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return plaintext, row

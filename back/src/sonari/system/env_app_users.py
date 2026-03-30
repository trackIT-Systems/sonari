"""Provision integration users and app tokens from ``SONARI_APP_TOKEN_*`` environment variables.

Each variable ``SONARI_APP_TOKEN_<SUFFIX>`` must hold a full Sonari app token string
``snr.<uuid>.<secret>`` (generate offline, e.g. Ansible). Grafana or other clients send
that value as ``Authorization: Bearer …``. Tokens are read-only (GET/HEAD only).

Unset variables on a later deploy cause matching env-managed tokens to be revoked.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError

from sonari import models
from sonari.system.app_token_auth import hash_app_token_secret, parse_sonari_app_token
from sonari.system.database import create_async_db_engine, get_async_session, get_database_url
from sonari.system.settings import Settings

__all__ = [
    "ENV_USER_PREFIX",
    "TITLE_PREFIX",
    "sync_env_app_users",
]

logger = logging.getLogger(__name__)

# Full env key: SONARI_APP_TOKEN_<SUFFIX> (suffix is case-preserved for title)
ENV_USER_PREFIX = "SONARI_APP_TOKEN_"
TITLE_PREFIX = "SonariEnvToken:"


def _integration_title(suffix: str) -> str:
    return f"{TITLE_PREFIX}{suffix}"


def _username_for_suffix(suffix: str) -> str:
    return f"app-{suffix.lower()}"


def _email_for_suffix(suffix: str) -> str:
    return f"app-{suffix.lower()}@integration.sonari"


def _iter_env_app_user_entries() -> list[tuple[str, str]]:
    out: list[tuple[str, str]] = []
    for key, raw in os.environ.items():
        if not key.startswith(ENV_USER_PREFIX):
            continue
        suffix = key[len(ENV_USER_PREFIX) :]
        if not suffix:
            logger.warning("Ignoring env key %s: empty suffix after prefix", key)
            continue
        out.append((suffix, raw))
    return out


async def _get_or_create_integration_user(session, username: str, email: str) -> models.User:
    """Load or create integration user; safe when multiple uvicorn workers run sync concurrently."""
    result = await session.execute(select(models.User).where(models.User.username == username))
    user = result.scalar_one_or_none()
    if user is not None:
        return user

    new_user = models.User(
        username=username,
        email=email,
        hashed_password="",
        name=None,
        is_active=True,
        is_superuser=False,
        is_verified=True,
    )
    async with session.begin_nested():
        session.add(new_user)
        try:
            await session.flush()
        except IntegrityError:
            pass
        else:
            return new_user

    result = await session.execute(select(models.User).where(models.User.username == username))
    return result.scalar_one()


async def _sync_one_token(
    session,
    suffix: str,
    raw_value: str,
) -> None:
    stripped = raw_value.strip()
    if not stripped:
        logger.warning("Skipping SONARI_APP_TOKEN_%s: empty value", suffix)
        return

    parsed = parse_sonari_app_token(stripped)
    if parsed is None:
        logger.warning(
            "Skipping SONARI_APP_TOKEN_%s: value is not a valid snr.<uuid>.<secret> token",
            suffix,
        )
        return

    token_id, secret = parsed
    username = _username_for_suffix(suffix)
    email = _email_for_suffix(suffix)
    title = _integration_title(suffix)

    user = await _get_or_create_integration_user(session, username, email)

    existing_by_id = await session.get(models.AppToken, token_id)
    if existing_by_id is None:
        async with session.begin_nested():
            session.add(
                models.AppToken(
                    id=token_id,
                    user_id=user.id,
                    title=title,
                    secret_hash=hash_app_token_secret(secret),
                    expires_at=None,
                    revoked_at=None,
                    can_read=True,
                    can_write=False,
                )
            )
            try:
                await session.flush()
            except IntegrityError:
                pass
        existing_by_id = await session.get(models.AppToken, token_id)

    if existing_by_id is None:
        logger.warning(
            "Skipping SONARI_APP_TOKEN_%s: could not create or load app token id %s",
            suffix,
            token_id,
        )
        return

    if existing_by_id.user_id != user.id:
        logger.warning(
            "Skipping SONARI_APP_TOKEN_%s: app token id %s already belongs to another user",
            suffix,
            token_id,
        )
        return

    existing_by_id.title = title
    existing_by_id.secret_hash = hash_app_token_secret(secret)
    existing_by_id.can_read = True
    existing_by_id.can_write = False
    existing_by_id.revoked_at = None

    now = datetime.now(timezone.utc)
    await session.execute(
        update(models.AppToken)
        .where(
            models.AppToken.user_id == user.id,
            models.AppToken.title == title,
            models.AppToken.id != token_id,
            models.AppToken.revoked_at.is_(None),
        )
        .values(revoked_at=now)
    )


async def _revoke_orphaned_env_tokens(session, active_suffixes: set[str]) -> None:
    now = datetime.now(timezone.utc)
    result = await session.execute(select(models.AppToken).where(models.AppToken.title.startswith(TITLE_PREFIX)))
    rows = result.scalars().all()
    for row in rows:
        suffix = row.title[len(TITLE_PREFIX) :]
        if suffix in active_suffixes:
            continue
        if row.revoked_at is None:
            row.revoked_at = now
            logger.info("Revoked env-managed app token (suffix no longer in environment): %s", suffix)


async def sync_env_app_users(settings: Settings) -> None:
    """Upsert users and app tokens from ``SONARI_APP_TOKEN_*``; revoke missing integrations."""
    entries = _iter_env_app_user_entries()
    active_suffixes = {s for s, _ in entries}

    db_url = get_database_url(settings)
    engine = create_async_db_engine(db_url)
    try:
        async with get_async_session(engine) as session:
            for suffix, raw in entries:
                await _sync_one_token(session, suffix, raw)
            await _revoke_orphaned_env_tokens(session, active_suffixes)
            await session.commit()
    finally:
        await engine.dispose()

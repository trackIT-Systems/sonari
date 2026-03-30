"""Create a service user and app token for automation (e.g. Grafana)."""

from __future__ import annotations

import argparse
import asyncio
import sys
from datetime import datetime, timezone

from sqlalchemy import or_, select

from sonari import models
from sonari.schemas.app_token import AppTokenPermissions, app_token_permission_flags
from sonari.system.app_token_auth import insert_app_token
from sonari.system.database import create_async_db_engine, get_async_session, get_database_url
from sonari.system.settings import Settings, get_settings

__all__ = [
    "main",
    "parse_args",
    "run_create_app_token",
]


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description=("Ensure a service user exists and provision an app token once; write the secret to stdout."),
        epilog=(
            "If an active token with the same --token-title already exists, the command exits without "
            "changing the database or stdout (the secret cannot be read back). "
            "If you deleted the env file but the token still exists, remove it from the database. "
        ),
    )
    p.add_argument("--username", required=True, help="Sonari username (created if missing)")
    p.add_argument("--token-title", default="Grafana", help="App token title (default: Grafana)")
    p.add_argument(
        "--permissions",
        choices=[e.value for e in AppTokenPermissions],
        default=AppTokenPermissions.read.value,
        help="Token permissions (default: read)",
    )
    p.add_argument(
        "--env-key",
        default="SONARI_APP_TOKEN",
        help="Variable name (default: SONARI_APP_TOKEN)",
    )
    args = p.parse_args(argv)
    return args


async def run_create_app_token(settings: Settings, args: argparse.Namespace) -> int:
    db_url = get_database_url(settings)
    engine = create_async_db_engine(db_url)

    try:
        async with get_async_session(engine) as session:
            result = await session.execute(select(models.User).where(models.User.username == args.username))
            user = result.scalar_one_or_none()

            if user is None:
                user = models.User(
                    username=args.username,
                    email=f"{args.username}@{args.username}.com",
                    hashed_password="",
                    is_active=True,
                    is_superuser=False,
                    is_verified=True,
                )
                session.add(user)
                await session.commit()
                await session.refresh(user)

            now = datetime.now(timezone.utc)
            active_stmt = (
                select(models.AppToken)
                .where(
                    models.AppToken.user_id == user.id,
                    models.AppToken.title == args.token_title,
                    models.AppToken.revoked_at.is_(None),
                    or_(
                        models.AppToken.expires_at.is_(None),
                        models.AppToken.expires_at > now,
                    ),
                )
                .limit(1)
            )
            existing = (await session.execute(active_stmt)).scalar_one_or_none()
            if existing is not None:
                print(
                    f"Active app token titled {args.token_title!r} already exists; "
                    "leaving DB unchanged (no file write or stdout token).",
                    file=sys.stderr,
                )
                return 0

            perms = AppTokenPermissions(args.permissions)
            can_read, can_write = app_token_permission_flags(perms)
            plaintext, _row = await insert_app_token(
                session,
                user.id,
                args.token_title,
                can_read,
                can_write,
                None,
            )

        line = f"{args.env_key}={plaintext}\n"
        sys.stdout.write(line)
        sys.stdout.flush()
        return 0
    finally:
        await engine.dispose()


def main() -> int:
    args = parse_args()
    settings = get_settings()
    return asyncio.run(run_create_app_token(settings, args))


if __name__ == "__main__":
    raise SystemExit(main())

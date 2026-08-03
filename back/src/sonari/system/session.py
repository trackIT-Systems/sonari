"""Shared async database session dependency (used by routes and OIDC auth)."""

from typing import Annotated, AsyncGenerator

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from sonari.system.database import (
    get_async_session,
    get_database_url,
    get_or_create_async_engine,
)
from sonari.system.settings import Settings, get_settings

__all__ = [
    "async_session",
]


async def async_session(
    settings: Settings = Depends(get_settings),
) -> AsyncGenerator[AsyncSession, None]:
    """Get an async session for the database."""
    url = get_database_url(settings)
    engine = get_or_create_async_engine(url)
    async with get_async_session(engine) as session:
        yield session


AsyncSessionDep = Annotated[AsyncSession, Depends(async_session)]

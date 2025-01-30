"""Common database session dependencies."""

from typing import Annotated, AsyncGenerator

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from sonari.routes.dependencies.settings import SonariSettings
from sonari.system.database import (
    create_async_db_engine,
    get_async_session,
    get_database_url,
)

__all__ = ["Session"]


async def async_session(
    settings: SonariSettings,
) -> AsyncGenerator[AsyncSession, None]:
    """Get an async session for the database."""
    url = get_database_url(settings)
    engine = create_async_db_engine(url)
    async with get_async_session(engine) as session:
        yield session


Session = Annotated[AsyncSession, Depends(async_session)]

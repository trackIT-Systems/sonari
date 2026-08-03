"""Common database session dependencies."""

from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from sonari.system.session import async_session

__all__ = ["Session"]

Session = Annotated[AsyncSession, Depends(async_session)]

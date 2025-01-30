"""Settings dependencies."""

from typing import Annotated

from fastapi import Depends

from sonari.system.settings import Settings, get_settings

__all__ = [
    "SonariSettings",
]


SonariSettings = Annotated[Settings, Depends(get_settings)]

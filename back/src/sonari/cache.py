"""Small in-process TTL cache for expensive read endpoints."""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from time import monotonic
from typing import TypeVar

T = TypeVar("T")

_cache: dict[str, tuple[float, object]] = {}
_lock = asyncio.Lock()
DEFAULT_TTL_SECONDS = 300.0


def invalidate_cache(key: str) -> None:
    """Drop a cached value."""
    _cache.pop(key, None)


async def get_or_set(
    key: str,
    factory: Callable[[], Awaitable[T]],
    *,
    ttl_seconds: float = DEFAULT_TTL_SECONDS,
) -> T:
    """Return a cached value or compute and store it."""
    now = monotonic()
    cached = _cache.get(key)
    if cached is not None:
        cached_at, value = cached
        if now - cached_at < ttl_seconds:
            return value  # type: ignore[return-value]

    async with _lock:
        cached = _cache.get(key)
        if cached is not None:
            cached_at, value = cached
            if monotonic() - cached_at < ttl_seconds:
                return value  # type: ignore[return-value]

        value = await factory()
        _cache[key] = (monotonic(), value)
        return value

"""Per-worker TTL cache shared by the requests of one process."""

import pickle
import time
from typing import Any


class SharedTTLCache:
    """Simple TTL cache in process memory.

    Values are stored pickled, so every read returns a fresh copy and callers
    cannot mutate the cached object.
    """

    def __init__(self, maxsize: int = 1000, ttl: int = 300):
        self._cache: dict[Any, bytes] = {}
        self._timestamps: dict[Any, float] = {}  # Track insertion times
        self.maxsize = maxsize
        self.ttl = ttl

    def _is_expired(self, key: Any) -> bool:
        """Check if a key has expired."""
        if key not in self._timestamps:
            return True
        return time.time() - self._timestamps[key] > self.ttl

    def _cleanup_expired(self) -> None:
        """Remove all expired entries."""
        current_time = time.time()
        expired_keys = [key for key, timestamp in list(self._timestamps.items()) if current_time - timestamp > self.ttl]
        for key in expired_keys:
            self._cache.pop(key, None)
            self._timestamps.pop(key, None)

    def _evict_if_needed(self) -> None:
        """Evict oldest entries if cache is full."""
        if len(self._cache) >= self.maxsize:
            # Remove oldest entries (simple FIFO)
            oldest_keys = sorted(self._timestamps.items(), key=lambda x: x[1])[: len(self._cache) - self.maxsize + 1]

            for key, _ in oldest_keys:
                self._cache.pop(key, None)
                self._timestamps.pop(key, None)

    def __contains__(self, key: Any) -> bool:
        """Check if key exists and is not expired."""
        if key not in self._cache:
            return False
        if self._is_expired(key):
            self._cache.pop(key, None)
            self._timestamps.pop(key, None)
            return False
        return True

    def __getitem__(self, key: Any) -> Any:
        """Get item from cache."""
        if key not in self:
            raise KeyError(key)
        return pickle.loads(self._cache[key])

    def __setitem__(self, key: Any, value: Any) -> None:
        """Set item in cache."""
        self._cleanup_expired()
        self._evict_if_needed()
        self._cache[key] = pickle.dumps(value)
        self._timestamps[key] = time.time()

    def __len__(self) -> int:
        """Return current cache size (after cleanup)."""
        self._cleanup_expired()
        return len(self._cache)

    def get(self, key: Any, default: Any = None) -> Any:
        """Get item with default value."""
        try:
            return self[key]
        except KeyError:
            return default

    def pop(self, key: Any, default: Any = None) -> Any:
        """Remove and return item."""
        try:
            value = self[key]
            del self._cache[key]
            del self._timestamps[key]
            return value
        except KeyError:
            return default

    def clear(self) -> None:
        """Clear all items from cache."""
        self._cache.clear()
        self._timestamps.clear()

    @property
    def currsize(self) -> int:
        """Current cache size."""
        self._cleanup_expired()
        return len(self._cache)

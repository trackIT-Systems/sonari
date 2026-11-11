"""Disk cache of rendered spectrogram images, shared by all worker processes.

Rendering a spectrogram costs ~150 ms of CPU and recordings do not change, so the same
image (same recording, time range and parameters) is rendered once and then read from
disk. Files are written atomically, so concurrent workers never read a partial image.
Reading an entry touches it; once the cache outgrows its size limit the least recently
used entries are removed.
"""

import hashlib
import json
import logging
import os
import tempfile
import threading
import time
from pathlib import Path
from typing import Any

__all__ = ["SpectrogramCache", "cache_key"]

logger = logging.getLogger(__name__)

#: Fraction of the limit written between scans for entries to evict.
_PRUNE_EVERY = 0.05
#: Eviction brings the cache down to this fraction of the limit.
_PRUNE_TO = 0.9


def cache_key(**parts: Any) -> str:
    """Stable key of everything that determines an image."""
    payload = json.dumps(parts, sort_keys=True, default=str, separators=(",", ":"))
    return hashlib.sha256(payload.encode()).hexdigest()


class SpectrogramCache:
    """Image bytes and their format by key, in files under ``directory``."""

    def __init__(self, directory: Path, max_bytes: int):
        self.directory = directory
        self.max_bytes = max_bytes
        self._written = 0
        self._lock = threading.Lock()

    @property
    def enabled(self) -> bool:
        return self.max_bytes > 0

    def _path(self, key: str) -> Path:
        return self.directory / key[:2] / key

    def get(self, key: str) -> tuple[bytes, str] | None:
        """The cached image and its format ("jpeg" or "webp"), or None."""
        if not self.enabled:
            return None
        path = self._path(key)
        try:
            content = path.read_bytes()
            os.utime(path)  # most recently used
        except OSError:
            return None
        fmt, _, data = content.partition(b"\n")
        if not data:
            return None
        return data, fmt.decode()

    def put(self, key: str, data: bytes, fmt: str) -> None:
        """Store an image; failures (full disk, permissions) only cost the cache."""
        if not self.enabled or len(data) > self.max_bytes:
            return
        path = self._path(key)
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            with tempfile.NamedTemporaryFile(dir=path.parent, delete=False, suffix=".tmp") as tmp:
                tmp.write(fmt.encode() + b"\n" + data)
            os.replace(tmp.name, path)
        except OSError:
            logger.warning("Could not cache spectrogram %s", key, exc_info=True)
            return

        with self._lock:
            self._written += len(data)
            due = self._written > _PRUNE_EVERY * self.max_bytes
            if due:
                self._written = 0
        if due:
            self.prune()

    def prune(self) -> None:
        """Remove the least recently used entries beyond the size limit."""
        entries = []
        total = 0
        for path in self.directory.glob("*/*"):
            try:
                stat = path.stat()
            except OSError:
                continue
            if path.suffix == ".tmp":
                # Left behind by a worker that died while writing
                if stat.st_mtime < time.time() - 3600:
                    path.unlink(missing_ok=True)
                continue
            entries.append((stat.st_mtime, stat.st_size, path))
            total += stat.st_size
        if total <= self.max_bytes:
            return
        entries.sort()
        target = _PRUNE_TO * self.max_bytes
        for _, size, path in entries:
            if total <= target:
                break
            try:
                path.unlink()
            except OSError:
                continue
            total -= size

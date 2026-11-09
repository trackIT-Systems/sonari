"""Tests for the disk cache of rendered spectrograms and how the route uses it."""

import os
import time

import pytest
from httpx import AsyncClient

import sonari.routes.spectrograms as spectrograms_route
from sonari.core.spectrogram_cache import SpectrogramCache, cache_key


def test_cache_round_trip_and_format(tmp_path):
    cache = SpectrogramCache(tmp_path, 1024 * 1024)
    key = cache_key(recording=1, start_time=0.0)
    assert cache.get(key) is None
    cache.put(key, b"\\x00image\\nbytes", "jpeg")
    assert cache.get(key) == (b"\\x00image\\nbytes", "jpeg")


def test_cache_key_depends_on_every_part():
    assert cache_key(a=1, b=2) == cache_key(b=2, a=1)
    assert cache_key(a=1, b=2) != cache_key(a=1, b=3)


def test_disabled_cache_stores_nothing(tmp_path):
    cache = SpectrogramCache(tmp_path, 0)
    cache.put("k" * 64, b"data", "webp")
    assert cache.get("k" * 64) is None
    assert list(tmp_path.iterdir()) == []


def test_prune_removes_least_recently_used(tmp_path):
    cache = SpectrogramCache(tmp_path, 10**9)  # no pruning while filling
    keys = [cache_key(n=n) for n in range(3)]
    for n, key in enumerate(keys):
        cache.put(key, b"x" * 4000, "webp")
        # Distinct use times, oldest first; key 0 is then read again
        past = time.time() - 100 + n
        os.utime(cache._path(key), (past, past))
    assert cache.get(keys[0]) is not None

    cache.max_bytes = 10_000
    cache.prune()
    assert cache.get(keys[0]) is not None
    assert cache.get(keys[1]) is None
    assert cache.get(keys[2]) is not None


def _params(recording_id: int, **overrides) -> dict:
    return {
        "recording_id": recording_id,
        "start_time": 0.0,
        "end_time": 0.5,
        "window_size_samples": 256,
        "overlap_percent": 75.0,
        "max_columns": 200,
        "lossy": True,
        **overrides,
    }


@pytest.fixture
def renders(monkeypatch):
    """Count real renders."""
    calls = []
    render = spectrograms_route._render_spectrogram

    def counting(*args, **kwargs):
        calls.append(args)
        return render(*args, **kwargs)

    monkeypatch.setattr(spectrograms_route, "_render_spectrogram", counting)
    return calls


@pytest.mark.asyncio
async def test_repeated_request_is_served_from_cache(auth_client: AsyncClient, test_recording_id: int, renders):
    params = _params(test_recording_id, gamma=1.3)  # a key no other test renders
    first = await auth_client.get("/api/v1/spectrograms/", params=params)
    second = await auth_client.get("/api/v1/spectrograms/", params=params)
    assert first.status_code == second.status_code == 200
    assert second.content == first.content
    assert second.headers["content-type"] == first.headers["content-type"]
    assert len(renders) == 1

    # Parameters that only the frontend uses share the image; others do not.
    await auth_client.get("/api/v1/spectrograms/", params={**params, "time_zoom_automatic": False})
    assert len(renders) == 1
    await auth_client.get("/api/v1/spectrograms/", params={**params, "gamma": 1.4})
    assert len(renders) == 2


@pytest.mark.asyncio
async def test_request_of_a_gone_client_is_not_rendered(
    auth_client: AsyncClient, test_recording_id: int, renders, monkeypatch
):
    async def disconnected(self):
        return True

    monkeypatch.setattr("starlette.requests.Request.is_disconnected", disconnected)
    response = await auth_client.get("/api/v1/spectrograms/", params=_params(test_recording_id, gamma=1.7))
    assert response.status_code == spectrograms_route.CLIENT_CLOSED_REQUEST
    assert renders == []

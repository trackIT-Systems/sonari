"""Tests for spectrogram endpoints."""

import asyncio
import time
from io import BytesIO

import pytest
from httpx import AsyncClient
from PIL import Image


@pytest.mark.asyncio
async def test_get_spectrogram_not_found(auth_client: AsyncClient):
    """Test getting spectrogram for non-existent recording."""
    response = await auth_client.get(
        "/api/v1/spectrograms/",
        params={
            "recording_id": 999999,
            "start_time": 0.0,
            "end_time": 1.0,
            # Audio parameters (defaults)
            "resample": False,
            "samplerate": 44100,
            "filter_order": 5,
            # Spectrogram parameters (defaults)
            "window_size_samples": 1024,
            "overlap_percent": 75.0,
            "window": "hann",
            "scale": "dB",
            "clamp": False,
            "min_dB": -100.0,
            "max_dB": 0.0,
            "normalize": True,
            "channel": 0,
            "pcen": True,
            "cmap": "gray",
            "gamma": 1.0,
            "freqLines": None,
        },
    )
    # Should return 404 for non-existent recording
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_get_spectrogram(auth_client: AsyncClient, test_recording_id: int):
    """Test getting spectrogram for a valid recording."""
    response = await auth_client.get(
        "/api/v1/spectrograms/",
        params={
            "recording_id": test_recording_id,
            "start_time": 0.0,
            "end_time": 1.0,
            # Audio parameters (defaults)
            "resample": False,
            "samplerate": 200000,
            "filter_order": 5,
            # Spectrogram parameters (defaults)
            "window_size_samples": 256,
            "overlap_percent": 75.0,
            "window": "blackmanharris",
            "scale": "dB",
            "clamp": True,
            "min_dB": -140.0,
            "max_dB": 0.0,
            "normalize": False,
            "channel": 0,
            "pcen": False,
            "cmap": "plasma",
            "gamma": 1.0,
        },
    )
    assert response.status_code == 200
    # Check that response is an image
    assert response.headers["content-type"] in ["image/webp", "image/jpeg"]
    # Check that there's content
    assert len(response.content) > 0
    # Check cache control headers
    assert "no-store" in response.headers.get("cache-control", "")

    # Write image to file in current directory
    content_type = response.headers["content-type"]
    extension = "webp" if "webp" in content_type else "jpg"
    output_file = f"test_spectrogram.{extension}"
    with open(output_file, "wb") as f:
        f.write(response.content)


@pytest.mark.asyncio
async def test_get_spectrogram_max_columns(auth_client: AsyncClient, test_recording_id: int):
    """max_columns widens the hop so the image has at most that many columns."""
    response = await auth_client.get(
        "/api/v1/spectrograms/",
        params={
            "recording_id": test_recording_id,
            "start_time": 0.0,
            "end_time": 1.0,
            "window_size_samples": 256,
            "overlap_percent": 99.0,
            "max_columns": 100,
        },
    )
    assert response.status_code == 200

    with Image.open(BytesIO(response.content)) as image:
        # Padding at the boundaries may add a frame on either side.
        assert 90 <= image.width <= 102


@pytest.mark.asyncio
async def test_get_spectrogram_preview_image(auth_client: AsyncClient, test_recording_id: int):
    """max_rows downscales the image height and lossy returns a JPEG."""
    response = await auth_client.get(
        "/api/v1/spectrograms/",
        params={
            "recording_id": test_recording_id,
            "start_time": 0.0,
            "end_time": 1.0,
            "window_size_samples": 1024,
            "overlap_percent": 99.0,
            "max_columns": 100,
            "max_rows": 64,
            "lossy": True,
        },
    )
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/jpeg"

    with Image.open(BytesIO(response.content)) as image:
        assert image.height == 64


@pytest.mark.asyncio
async def test_spectrogram_does_not_block_other_requests(
    auth_client: AsyncClient, test_recording_id: int, monkeypatch
):
    """The computation runs in a worker thread, so the event loop keeps serving."""
    import sonari.routes.spectrograms as spectrograms_route

    def slow_render(*args):
        time.sleep(1.0)
        return b"image", 5, "webp"

    monkeypatch.setattr(spectrograms_route, "_render_spectrogram", slow_render)

    slow = asyncio.create_task(
        auth_client.get(
            "/api/v1/spectrograms/",
            params={"recording_id": test_recording_id, "start_time": 0.0, "end_time": 1.0},
        )
    )
    await asyncio.sleep(0.2)  # let the slow request reach the computation

    started = time.perf_counter()
    response = await auth_client.get("/api/v1/tags/", params={"limit": 1})
    elapsed = time.perf_counter() - started

    assert response.status_code == 200
    assert not slow.done()
    assert elapsed < 0.5
    assert (await slow).status_code == 200

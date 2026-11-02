"""Tests for waveform endpoints."""

import asyncio
import time
from io import BytesIO

import pytest
from httpx import AsyncClient
from PIL import Image


@pytest.mark.asyncio
async def test_get_waveform_not_found(auth_client: AsyncClient):
    """Test getting waveform for non-existent recording."""
    response = await auth_client.get(
        "/api/v1/waveforms/",
        params={
            "recording_id": 999999,
            "cmap": "plasma",
            "gamma": 1.0,
            "start_time": 0.0,
            "end_time": 1.0,
        },
    )
    # Should return 404 for non-existent recording (422 possible if validation fails first)
    assert response.status_code in [404, 422]


@pytest.mark.asyncio
async def test_get_waveform(auth_client: AsyncClient, test_recording_id: int):
    """Test getting waveform for a valid recording."""
    response = await auth_client.get(
        "/api/v1/waveforms/",
        params={
            "recording_id": test_recording_id,
            "cmap": "plasma",
            "gamma": 1.0,
            "start_time": 0.0,
            "end_time": 1.0,
        },
    )
    assert response.status_code == 200
    # Check that response is an image
    assert response.headers["content-type"] in ["image/webp"]
    # Check that there's content
    assert len(response.content) > 0
    # Check cache control headers
    assert "no-store" in response.headers.get("cache-control", "")

    # Write image to file in current directory
    output_file = "test_waveform.png"
    with open(output_file, "wb") as f:
        f.write(response.content)


@pytest.mark.asyncio
async def test_get_waveform_max_columns(auth_client: AsyncClient, test_recording_id: int):
    """max_columns limits the waveform image to that many columns."""
    response = await auth_client.get(
        "/api/v1/waveforms/",
        params={
            "recording_id": test_recording_id,
            "cmap": "gray",
            "gamma": 1.0,
            "start_time": 0.0,
            "end_time": 1.0,
            "window_size_samples": 256,
            "overlap_percent": 99.0,
            "max_columns": 50,
        },
    )
    assert response.status_code == 200

    with Image.open(BytesIO(response.content)) as image:
        assert image.width == 50


@pytest.mark.asyncio
async def test_waveform_does_not_block_other_requests(
    auth_client: AsyncClient, test_recording_id: int, monkeypatch
):
    """The computation runs in a worker thread, so the event loop keeps serving."""
    import numpy as np

    from sonari import api

    def slow_waveform(*args, **kwargs):
        time.sleep(1.0)
        return np.zeros((64, 10), dtype=np.float32)

    monkeypatch.setattr(api, "compute_waveform", slow_waveform)

    slow = asyncio.create_task(
        auth_client.get(
            "/api/v1/waveforms/",
            params={
                "recording_id": test_recording_id,
                "cmap": "gray",
                "gamma": 1.0,
                "start_time": 0.0,
                "end_time": 1.0,
            },
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

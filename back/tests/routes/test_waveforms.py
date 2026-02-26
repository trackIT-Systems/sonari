"""Tests for waveform endpoints."""

import pytest
from httpx import AsyncClient


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

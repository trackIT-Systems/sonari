"""Tests for audio streaming and download endpoints."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_stream_audio_not_found(auth_client: AsyncClient):
    """Test streaming audio for non-existent recording."""
    response = await auth_client.get(
        "/api/v1/audio/stream/",
        params={"recording_id": 999999},
        headers={"Range": "bytes=0-"},
    )
    # Should return 404 for non-existent recording
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_stream_audio(auth_client: AsyncClient, test_recording_id: int):
    """Test streaming audio for a valid recording."""
    response = await auth_client.get(
        "/api/v1/audio/stream/",
        params={"recording_id": test_recording_id},
        headers={"Range": "bytes=0-"},
    )
    assert response.status_code in [200, 206]
    # Check that response is audio
    assert response.headers["content-type"] == "audio/wav"
    # Check that there's content
    assert len(response.content) > 0
    # Check range headers
    assert "Content-Range" in response.headers
    assert "Accept-Ranges" in response.headers
    assert response.headers["Accept-Ranges"] == "bytes"


@pytest.mark.asyncio
async def test_stream_audio_with_time_range(auth_client: AsyncClient, test_recording_id: int):
    """Test streaming audio with time range parameters."""
    response = await auth_client.get(
        "/api/v1/audio/stream/",
        params={
            "recording_id": test_recording_id,
            "start_time": 0.0,
            "end_time": 0.5,
        },
        headers={"Range": "bytes=0-"},
    )
    assert response.status_code in [200, 206]
    assert response.headers["content-type"] == "audio/wav"
    assert len(response.content) > 0


@pytest.mark.asyncio
async def test_stream_audio_with_speed(auth_client: AsyncClient, test_recording_id: int):
    """Test streaming audio with speed multiplier."""
    response = await auth_client.get(
        "/api/v1/audio/stream/",
        params={
            "recording_id": test_recording_id,
            "speed": 0.5,
        },
        headers={"Range": "bytes=0-"},
    )
    assert response.status_code in [200, 206]
    assert response.headers["content-type"] == "audio/wav"
    assert len(response.content) > 0


@pytest.mark.asyncio
async def test_download_audio_not_found(auth_client: AsyncClient):
    """Test downloading audio for non-existent recording."""
    response = await auth_client.get(
        "/api/v1/audio/download/",
        params={"recording_id": 999999},
    )
    # Should return 404 for non-existent recording
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_download_audio(auth_client: AsyncClient, test_recording_id: int):
    """Test downloading audio for a valid recording."""
    response = await auth_client.get(
        "/api/v1/audio/download/",
        params={"recording_id": test_recording_id},
    )
    assert response.status_code == 200
    # Check that response is audio (should be original format)
    assert "audio/" in response.headers["content-type"]
    # Check that there's content
    assert len(response.content) > 0
    # Check Content-Disposition header for download
    assert "Content-Disposition" in response.headers
    assert "attachment" in response.headers["Content-Disposition"]

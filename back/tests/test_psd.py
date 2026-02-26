"""Tests for PSD (Power Spectral Density) endpoints."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_get_psd_not_found(auth_client: AsyncClient):
    """Test getting PSD for non-existent recording."""
    response = await auth_client.get(
        "/api/v1/psd/",
        params={
            "recording_id": 999999,
            "start_time": 0.0,
            "end_time": 1.0,
            # Audio parameters
            "resample": False,
            "samplerate": 44100,
            "filter_order": 5,
            # Spectrogram parameters
            "window_size_samples": 1024,
            "overlap_percent": 75.0,
            "window": "hann",
            "scale": "dB",
            "clamp": False,
            "min_dB": -100.0,
            "max_dB": 0.0,
            "normalize": True,
            "channel": 0,
            "pcen": False,
            # PSD-specific parameters
            "width": 455,
            "height": 225,
        },
    )
    # Should return 404 or 500 for non-existent recording
    assert response.status_code in [404, 500]


@pytest.mark.asyncio
async def test_get_psd(auth_client: AsyncClient, test_recording_id: int):
    """Test getting PSD plot for a valid recording."""
    response = await auth_client.get(
        "/api/v1/psd/",
        params={
            "recording_id": test_recording_id,
            "start_time": 0.0,
            "end_time": 1.0,
            # Audio parameters
            "resample": False,
            "samplerate": 44100,
            "filter_order": 5,
            # Spectrogram parameters (used for underlying computation)
            "window_size_samples": 512,
            "overlap_percent": 75.0,
            "window": "hann",
            "scale": "dB",
            "clamp": False,
            "min_dB": -100.0,
            "max_dB": 0.0,
            "normalize": True,
            "channel": 0,
            "pcen": False,
            # PSD-specific parameters
            "width": 455,
            "height": 225,
        },
    )
    assert response.status_code == 200
    # Check that response is an image
    assert response.headers["content-type"] in ["image/webp", "image/png", "image/jpeg"]
    # Check that there's content
    assert len(response.content) > 0
    # Check cache control headers
    assert "no-store" in response.headers.get("cache-control", "")
    # Check PSD-specific headers for axis ranges
    assert "X-PSD-Min" in response.headers
    assert "X-PSD-Max" in response.headers
    assert "X-Freq-Min" in response.headers
    assert "X-Freq-Max" in response.headers


@pytest.mark.asyncio
async def test_get_psd_with_frequency_range(auth_client: AsyncClient, test_recording_id: int):
    """Test getting PSD with custom frequency range."""
    response = await auth_client.get(
        "/api/v1/psd/",
        params={
            "recording_id": test_recording_id,
            "start_time": 0.0,
            "end_time": 1.0,
            # Audio parameters
            "resample": False,
            "samplerate": 44100,
            "filter_order": 5,
            # Spectrogram parameters
            "window_size_samples": 512,
            "overlap_percent": 75.0,
            "window": "hann",
            "scale": "dB",
            "clamp": False,
            "min_dB": -100.0,
            "max_dB": 0.0,
            "normalize": True,
            "channel": 0,
            "pcen": False,
            # PSD-specific parameters with frequency range
            "width": 455,
            "height": 225,
            "freq_min": 1000.0,
            "freq_max": 10000.0,
        },
    )
    assert response.status_code == 200
    # Verify frequency range headers match request
    assert float(response.headers["X-Freq-Min"]) == 1000.0
    assert float(response.headers["X-Freq-Max"]) == 10000.0

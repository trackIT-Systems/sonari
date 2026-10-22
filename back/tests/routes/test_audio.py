"""Tests for audio streaming and download endpoints."""

import pytest
from httpx import ASGITransport, AsyncClient

from sonari.system import create_app
from sonari.system.settings import get_settings


@pytest.mark.asyncio
async def test_download_audio_requires_auth(test_settings, setup_test_db):
    """Download endpoint must reject unauthenticated requests."""
    test_app = create_app(test_settings)
    test_app.dependency_overrides[get_settings] = lambda: test_settings

    transport = ASGITransport(app=test_app)
    async with AsyncClient(transport=transport, base_url="http://localhost:5000") as client:
        response = await client.get(
            "/api/v1/audio/download/",
            params={"recording_id": 1},
        )

    assert response.status_code in (401, 403)


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


def _walk_stream(path, speed=1.0):
    """Fetch a whole stream like a browser: 'bytes=N-' until the end."""
    from sonari.api.audio import load_clip_bytes

    chunks, pos, requests, size = [], 0, 0, None
    while size is None or pos < size:
        data, start, end, size = load_clip_bytes(path=path, start=pos, end=None, speed=speed)
        assert start == pos
        assert end == start + len(data) - 1, "Content-Range end must be inclusive"
        chunks.append(data)
        pos = end + 1
        requests += 1
        assert requests < 10_000
    return b"".join(chunks), size, requests


@pytest.mark.asyncio
async def test_stream_chunks_rebuild_the_exact_file(tmp_path):
    """Walking the ranges must give exactly the WAV of a single full read.

    Regression: Content-Range end was exclusive (a byte got skipped per chunk,
    shifting the samples) and chunks held only 8192 frames.
    """
    import numpy as np
    import soundfile as sf

    from sonari.api.audio import HEADER_SIZE, load_clip_bytes

    path = tmp_path / "tone.wav"
    rate = 384_000
    signal = (np.sin(np.linspace(0, 2000 * np.pi, rate * 2)) * 0.5).astype("float32")
    sf.write(path, signal, rate, subtype="PCM_16")

    full, size = None, None
    data, _, _, size = load_clip_bytes(path=path, start=0, end=None, frames=rate * 10)
    full = data
    assert len(full) == size

    walked, walked_size, requests = _walk_stream(path)
    assert walked_size == size
    assert walked == full
    assert requests <= 4, f"{requests} requests for a 1.5 MB file"

    # Odd start bytes (inside the header, inside a sample) are served exactly.
    for start in (1, 2, HEADER_SIZE - 1, HEADER_SIZE + 1, 1001):
        part, s, e, _ = load_clip_bytes(path=path, start=start, end=start + 99)
        assert (s, e, part) == (start, start + 99, full[start : start + 100])

    # Safari's first request: exactly bytes 0-1.
    part, s, e, _ = load_clip_bytes(path=path, start=0, end=1)
    assert (part, s, e) == (full[:2], 0, 1)


@pytest.mark.asyncio
async def test_stream_audio_answers_ranges_with_206_and_inclusive_end(auth_client: AsyncClient, test_recording_id: int):
    response = await auth_client.get(
        "/api/v1/audio/stream/",
        params={"recording_id": test_recording_id},
        headers={"Range": "bytes=0-", "User-Agent": "Mozilla/5.0 Chrome/120.0"},
    )
    assert response.status_code == 206
    start, _, rest = response.headers["Content-Range"].removeprefix("bytes ").partition("-")
    end, _, total = rest.partition("/")
    assert int(end) - int(start) + 1 == len(response.content) == int(response.headers["Content-Length"])

    no_range = await auth_client.get("/api/v1/audio/stream/", params={"recording_id": test_recording_id})
    assert no_range.status_code == 206


@pytest.mark.asyncio
async def test_stream_single_channel_matches_the_selected_channel(tmp_path):
    """channel=N streams that channel as mono; None streams every channel."""
    import numpy as np
    import soundfile as sf

    from sonari.api.audio import HEADER_SIZE, load_clip_bytes

    path = tmp_path / "stereo.wav"
    rate = 8000
    left = np.full(rate, 0.25, dtype="float32")
    right = np.full(rate, -0.5, dtype="float32")
    sf.write(path, np.stack([left, right], axis=1), rate, subtype="PCM_16")

    def samples(channel):
        data, _, _, size = load_clip_bytes(path=path, start=0, end=None, channel=channel, frames=rate)
        assert len(data) == size
        header, pcm = data[:HEADER_SIZE], np.frombuffer(data[HEADER_SIZE:], dtype="<i2")
        return int.from_bytes(header[22:24], "little"), pcm  # channel count in the WAV header

    channels, pcm = samples(None)
    assert channels == 2 and len(pcm) == 2 * rate
    channels, pcm = samples(1)
    assert channels == 1 and len(pcm) == rate and np.all(pcm < 0)
    channels, pcm = samples(0)
    assert channels == 1 and np.all(pcm > 0)
    # A channel the file does not have falls back to 0, like the spectrogram.
    channels, pcm = samples(5)
    assert channels == 1 and np.all(pcm > 0)

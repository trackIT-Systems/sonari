"""REST API routes for spectrograms."""

import base64
import os
from functools import lru_cache
from pathlib import Path
from typing import Annotated

import anyio
from fastapi import Depends, Query, Request, Response
from fastapi.responses import JSONResponse
from PIL.Image import Resampling

from sonari import api, schemas
from sonari.core import images
from sonari.core.spectrogram_cache import SpectrogramCache, cache_key
from sonari.routes.dependencies import Session, SonariSettings
from sonari.routes.dependencies.auth import create_authenticated_router
from sonari.system.data import get_app_data_dir

__all__ = ["spectrograms_router"]

spectrograms_router = create_authenticated_router()

#: Spectrograms rendered at once per worker process. Rendering is CPU bound and holds the
#: GIL much of the time: more at once only makes every request slower, while a short
#: queue lets them finish in order and drops requests whose client has gone.
RENDERS_PER_WORKER = int(os.environ.get("SONARI_SPECTROGRAM_RENDERS", "2"))
#: Browsers may reuse an image this long: its URL holds every parameter and the audio
#: does not change.
BROWSER_CACHE_SECONDS = 24 * 3600

#: Parameters the frontend sends that do not change the image.
_NOT_IN_IMAGE = {"time_zoom_automatic", "time_zoom_duration_seconds"}

#: Status for a request dropped because its client disconnected (as nginx logs it).
CLIENT_CLOSED_REQUEST = 499

_render_limiter: anyio.CapacityLimiter | None = None


def _limiter() -> anyio.CapacityLimiter:
    # Created on first use: a limiter belongs to the running event loop.
    global _render_limiter
    if _render_limiter is None:
        _render_limiter = anyio.CapacityLimiter(max(1, RENDERS_PER_WORKER))
    return _render_limiter


@lru_cache(maxsize=1)
def _cache() -> SpectrogramCache:
    """Disk cache of rendered images, shared by the workers.

    ``SONARI_SPECTROGRAM_CACHE_MB`` sets its size (default 1024, 0 disables it) and
    ``SONARI_SPECTROGRAM_CACHE_DIR`` its place (default: the app data directory).
    """
    directory = os.environ.get("SONARI_SPECTROGRAM_CACHE_DIR")
    size_mb = int(os.environ.get("SONARI_SPECTROGRAM_CACHE_MB", "1024"))
    return SpectrogramCache(
        Path(directory) if directory else get_app_data_dir() / "cache" / "spectrograms",
        size_mb * 1024 * 1024,
    )


def _render_spectrogram(
    recording: schemas.Recording,
    start_time: float,
    end_time: float,
    audio_parameters: schemas.AudioParameters,
    spectrogram_parameters: schemas.SpectrogramParameters,
    audio_dir: Path,
) -> tuple[bytes, int, str]:
    """Compute a spectrogram and encode it as image bytes."""
    data = api.compute_spectrogram(
        recording,
        start_time,
        end_time,
        audio_parameters,
        spectrogram_parameters,
        audio_dir=audio_dir,
    )

    image = images.array_to_image(
        data,
        cmap=spectrogram_parameters.cmap,
        gamma=spectrogram_parameters.gamma,
    )

    if spectrogram_parameters.overlap_percent == 1:
        image = image.resize((1000, image.height))

    max_rows = spectrogram_parameters.max_rows
    if max_rows is not None and image.height > max_rows:
        image = image.resize((image.width, max_rows), Resampling.BOX)

    buffer, buffer_size, fmt = images.image_to_buffer(
        image,
        fmt="jpeg" if spectrogram_parameters.lossy else "webp",
    )
    return buffer.read(), buffer_size, fmt


@spectrograms_router.get(
    "/",
    response_model=None,
)
async def get_spectrogram(
    request: Request,
    session: Session,
    settings: SonariSettings,
    recording_id: int,
    start_time: float,
    end_time: float,
    audio_parameters: Annotated[schemas.AudioParameters, Depends(schemas.AudioParameters)],
    spectrogram_parameters: Annotated[
        schemas.SpectrogramParameters,
        Depends(schemas.SpectrogramParameters),
    ],
    grafana_json: Annotated[
        bool,
        Query(
            description="If true, return JSON with base64 image for Grafana Infinity (backend JSON parser).",
        ),
    ] = False,
) -> Response | JSONResponse:
    """Get a spectrogram for a recording.

    Parameters
    ----------
    session : Session
        SQLAlchemy session.
    settings : SonariSettings
        Application settings.
    recording_id : int
        Recording ID.
    start_time : float
        Start time in seconds.
    end_time : float
        End time in seconds.
    audio_parameters : AudioParameters
        Resampling and audio processing parameters.
    spectrogram_parameters : SpectrogramParameters
        STFT / colormap parameters.
    grafana_json : bool
        If true, return JSON with base64 ``data`` and ``media_type`` for Grafana Infinity.

    Returns
    -------
    Response or JSONResponse
        Spectrogram image bytes, or JSON with ``media_type`` and base64 ``data`` when
        ``grafana_json`` is true (for Grafana Infinity server-side queries).

    """
    recording = await api.recordings.get(session, recording_id)
    # Close session BEFORE expensive computation
    await session.close()

    cache = _cache()
    key = cache_key(
        recording=recording.id,
        hash=recording.hash,
        start_time=start_time,
        end_time=end_time,
        audio=audio_parameters.model_dump(),
        spectrogram=spectrogram_parameters.model_dump(exclude=_NOT_IN_IMAGE),
    )
    cached = await anyio.to_thread.run_sync(cache.get, key) if cache.enabled else None

    if cached is None:
        async with _limiter():
            # While queued, the client may have moved on, or another request rendered it.
            if await request.is_disconnected():
                return Response(status_code=CLIENT_CLOSED_REQUEST)
            cached = await anyio.to_thread.run_sync(cache.get, key) if cache.enabled else None
            if cached is None:
                # CPU bound and synchronous: a worker thread keeps the event loop free.
                raw, _, fmt = await anyio.to_thread.run_sync(
                    _render_spectrogram,
                    recording,
                    start_time,
                    end_time,
                    audio_parameters,
                    spectrogram_parameters,
                    settings.audio_dir,
                )
                if cache.enabled:
                    await anyio.to_thread.run_sync(cache.put, key, raw, fmt)
                cached = raw, fmt
    raw, fmt = cached
    buffer_size = len(raw)
    media_type = f"image/{fmt}"

    if grafana_json:
        return JSONResponse(
            {
                "media_type": media_type,
                "data": base64.b64encode(raw).decode("ascii"),
            },
            headers={
                "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
                "Pragma": "no-cache",
                "Expires": "0",
            },
        )

    return Response(
        content=raw,
        media_type=media_type,
        headers={
            "content-length": str(buffer_size),
            # Private: requests are authenticated.
            "Cache-Control": f"private, max-age={BROWSER_CACHE_SECONDS}",
        },
    )

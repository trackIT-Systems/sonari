"""REST API routes for spectrograms."""

import base64
from typing import Annotated

from fastapi import Depends, Query, Response
from fastapi.responses import JSONResponse

from sonari import api, schemas
from sonari.core import images
from sonari.routes.dependencies import Session, SonariSettings
from sonari.routes.dependencies.auth import create_authenticated_router

__all__ = ["spectrograms_router"]

spectrograms_router = create_authenticated_router()


@spectrograms_router.get(
    "/",
    response_model=None,
)
async def get_spectrogram(
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

    data = api.compute_spectrogram(
        recording,
        start_time,
        end_time,
        audio_parameters,
        spectrogram_parameters,
        audio_dir=settings.audio_dir,
    )

    image = images.array_to_image(
        data,
        cmap=spectrogram_parameters.cmap,
        gamma=spectrogram_parameters.gamma,
    )

    if spectrogram_parameters.overlap_percent == 1:
        image = image.resize((1000, image.height))

    buffer, buffer_size, fmt = images.image_to_buffer(image)
    raw = buffer.read()
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
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
            "Expires": "0",
        },
    )

"""REST API routes for spectrograms."""

from typing import Annotated

from fastapi import APIRouter, Depends, Response

from sonari import api, schemas
from sonari.core import images
from sonari.routes.dependencies import Session, SonariSettings

__all__ = ["waveform_router"]

waveform_router = APIRouter()


@waveform_router.get(
    "/",
)
async def get_waveform(
    session: Session,
    settings: SonariSettings,
    recording_id: int,
    cmap: str,
    gamma: float,
    start_time: float,
    end_time: float,
    audio_parameters: Annotated[schemas.AudioParameters, Depends(schemas.AudioParameters)],
    spectrogram_parameters: Annotated[
        schemas.SpectrogramParameters,
        Depends(schemas.SpectrogramParameters),
    ],
) -> Response:
    """Get a waveform image for a recording segment.

    Parameters
    ----------
    session : Session
        SQLAlchemy session.
    recording_id : int
        Recording ID.
    start_time : float
        Start time in seconds.
    end_time : float
        End time in seconds.
    audio_parameters : AudioParameters
        Audio loading parameters.

    Returns
    -------
    Response
        Waveform image.
    """
    recording = await api.recordings.get(session, recording_id)

    # Close session BEFORE expensive computation
    await session.close()

    # Compute waveform array
    data = api.compute_waveform(
        recording,
        start_time,
        end_time,
        audio_parameters=audio_parameters,
        spectrogram_parameters=spectrogram_parameters,
        audio_dir=settings.audio_dir,
    )

    # Convert array to image with colormap and gamma
    image = images.array_to_image(
        data,
        cmap=cmap,
        gamma=gamma,
    )

    # Convert image to buffer
    buffer, buffer_size, fmt = images.image_to_buffer(image)

    return Response(
        content=buffer.read(),
        media_type=f"image/{fmt}",
        headers={
            "content-length": str(buffer_size),
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
            "Expires": "0",
        },
    )

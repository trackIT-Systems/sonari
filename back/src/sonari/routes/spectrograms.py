"""REST API routes for spectrograms."""

from typing import Annotated

from fastapi import Depends, Request, Response

from sonari import api, schemas
from sonari.core import images
from sonari.routes.dependencies import Session, SonariSettings
from sonari.routes.dependencies.auth import create_authenticated_router

__all__ = ["spectrograms_router"]

spectrograms_router = create_authenticated_router()


@spectrograms_router.get(
    "/",
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
) -> Response:
    """Get a spectrogram for a recording.

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
    parameters : SpectrogramParameters
        Spectrogram parameters.

    Returns
    -------
    Response
        Spectrogram image.

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

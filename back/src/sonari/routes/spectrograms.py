"""REST API routes for spectrograms."""

from typing import Annotated

from fastapi import APIRouter, Depends, Response

from sonari import api, schemas
from sonari.core import images
from sonari.routes.dependencies import Session, SonariSettings

import time

__all__ = ["spectrograms_router"]

spectrograms_router = APIRouter()


@spectrograms_router.get(
    "/",
)
async def get_spectrogram(
    session: Session,
    settings: SonariSettings,
    recording_id: int,
    start_time: float,
    end_time: float,
    low_res: bool,
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
    start = time.time()
    recording = await api.recordings.get(session, recording_id)
    end = time.time()
    print(f"Time taken to get recording: {end - start} seconds")
    # Close session BEFORE expensive computation
    await session.close()
    start = time.time()
    data = api.compute_spectrogram(
        recording,
        start_time,
        end_time,
        audio_parameters,
        spectrogram_parameters,
        audio_dir=settings.audio_dir,
        low_res=low_res,
    )
    end = time.time()
    print(f"Time taken to compute spectrogram: {end - start} seconds")
    start = time.time()
    # Normalize.
    if spectrogram_parameters.normalize:
        data = data / data.max() if data.max() > 0 else data
    
    image = images.array_to_image(
        data,
        cmap=spectrogram_parameters.cmap,
        gamma=spectrogram_parameters.gamma,
    )
    end = time.time()
    print(f"Time taken to convert array to image: {end - start} seconds")
    start = time.time()
    if spectrogram_parameters.overlap_percent == 1:
        image = image.resize((1000, image.height))
    end = time.time()
    print(f"Time taken to resize image: {end - start} seconds")
    start = time.time()
    buffer, buffer_size, fmt = images.image_to_buffer(image)
    end = time.time()
    print(f"Time taken to convert image to buffer: {end - start} seconds")
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

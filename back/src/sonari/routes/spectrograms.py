"""REST API routes for spectrograms."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Request, Response

from sonari import api, schemas
from sonari.core import images
from sonari.routes.dependencies import Session, SonariSettings

__all__ = ["spectrograms_router"]

spectrograms_router = APIRouter()


@spectrograms_router.get(
    "/",
)
async def get_spectrogram(
    session: Session,
    settings: SonariSettings,
    recording_uuid: UUID,
    start_time: float,
    end_time: float,
    low_res: bool,
    audio_parameters: Annotated[schemas.AudioParameters, Depends(schemas.AudioParameters)],
    spectrogram_parameters: Annotated[
        schemas.SpectrogramParameters,
        Depends(schemas.SpectrogramParameters),
    ],
    request: Request,
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
    recording = await api.recordings.get(session, recording_uuid)

    data = api.compute_spectrogram(
        recording,
        start_time,
        end_time,
        audio_parameters,
        spectrogram_parameters,
        audio_dir=settings.audio_dir,
        low_res=low_res,
    )

    # Normalize.
    if spectrogram_parameters.normalize:
        data_min = data.min()
        data_max = data.max()
        data = data - data_min
        data_range = data_max - data_min
        if data_range > 0:
            data = data / data_range

    image = images.array_to_image(
        data,
        cmap=spectrogram_parameters.cmap,
        gamma=spectrogram_parameters.gamma,
    )

    if low_res:
        image.thumbnail((10000, 50))

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

"""REST API routes for spectrograms."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Request, Response

from whombat import api, schemas
from whombat.core import images
from whombat.routes.dependencies import Session, WhombatSettings

__all__ = ["spectrograms_router"]

spectrograms_router = APIRouter()

import datetime


@spectrograms_router.get(
    "/",
)
async def get_spectrogram(
    session: Session,
    settings: WhombatSettings,
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
    st = datetime.datetime.now().time()
    print(f"############### start {datetime.datetime.now().time()}, {start_time}, {end_time}, {low_res}")
    recording = await api.recordings.get(session, recording_uuid)

    print(f"############### db request {datetime.datetime.now().time()}, {start_time}, {end_time}, {low_res}")

    data = api.compute_spectrogram(
        recording,
        start_time,
        end_time,
        audio_parameters,
        spectrogram_parameters,
        audio_dir=settings.audio_dir,
        low_res=low_res,
    )

    print(f"############### spectrogram {datetime.datetime.now().time()}, {start_time}, {end_time}, {low_res}")

    # Normalize.
    if spectrogram_parameters.normalize:
        data_min = data.min()
        data_max = data.max()
        data = data - data_min
        data_range = data_max - data_min
        if data_range > 0:
            data = data / data_range

    print(f"############### normalization {datetime.datetime.now().time()}, {start_time}, {end_time}, {low_res}")

    image = images.array_to_image(
        data,
        cmap=spectrogram_parameters.cmap,
        gamma=spectrogram_parameters.gamma,
    )

    print(f"############### arr_to_img {datetime.datetime.now().time()}, {start_time}, {end_time}, {low_res}")

    if low_res:
        image.thumbnail((10000, 50))

    print(f"############### thumbnail {datetime.datetime.now().time()}, {start_time}, {end_time}, {low_res}")

    buffer, fmt = images.image_to_buffer(image)

    print(f"############### img to buf {datetime.datetime.now().time()}, {start_time}, {end_time}, {low_res}")

    r = Response(
        content=buffer.read(),
        media_type=f"image/{fmt}",
        headers={
            "Cache-Control": "public, max-age=31536000",
            "ETag": f"{recording.uuid}-{start_time}-{end_time}-{str(audio_parameters)}-{str(spectrogram_parameters)}"
            
        },
    )

    print(f"############### done with everything {datetime.datetime.now().time()}, {start_time}, {end_time}, {low_res}")
    return r

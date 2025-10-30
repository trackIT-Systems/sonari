"""REST API routes for spectrograms."""

from typing import Annotated

from fastapi import APIRouter, Depends, Response

from sonari import api, schemas
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
    audio_parameters: Annotated[schemas.AudioParameters, Depends(schemas.AudioParameters)],
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

    # Compute waveform image
    buffer_bytes = api.compute_waveform(
        recording,
        audio_parameters=audio_parameters,
        audio_dir=settings.audio_dir,
        cmap=cmap,
        gamma=gamma,
        return_image=True,
    )

    return Response(
        content=buffer_bytes,
        media_type="image/png",
        headers={
            "content-length": str(len(buffer_bytes)),
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
            "Expires": "0",
        },
    )

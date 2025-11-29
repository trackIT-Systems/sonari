"""REST API routes for Power Spectral Density."""

from typing import Annotated

from fastapi import APIRouter, Depends, Response

from sonari import api, schemas
from sonari.core.psd import psd_image_to_buffer, psd_to_plot_image
from sonari.routes.dependencies import Session, SonariSettings

__all__ = ["psd_router"]

psd_router = APIRouter()


@psd_router.get(
    "/",
)
async def get_psd(
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
    width: int = 455,
    height: int = 225,
    freq_min: float | None = None,
    freq_max: float | None = None,
) -> Response:
    """Get a Power Spectral Density plot for a recording segment.

    The PSD shows the average power distribution across frequencies
    for the specified time range.

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
    spectrogram_parameters : SpectrogramParameters
        Parameters for the underlying STFT computation.
    width : int
        Width of the output image in pixels.
    height : int
        Height of the output image in pixels.
    freq_min : float | None
        Minimum frequency to display (Hz). Defaults to 0.
    freq_max : float | None
        Maximum frequency to display (Hz). Defaults to Nyquist.

    Returns
    -------
    Response
        PSD plot image.
    """
    recording = await api.recordings.get(session, recording_id)
    # Close session BEFORE expensive computation
    await session.close()

    # Compute PSD
    psd, frequencies, samplerate = api.compute_psd(
        recording,
        start_time,
        end_time,
        audio_parameters,
        spectrogram_parameters,
        audio_dir=settings.audio_dir,
    )

    # Determine actual frequency range
    actual_freq_min = freq_min if freq_min is not None else 0
    actual_freq_max = freq_max if freq_max is not None else samplerate / 2

    # Create plot image (returns image and dB range for axis labels)
    image, psd_min, psd_max = psd_to_plot_image(
        psd,
        width=width,
        height=height,
        freq_min=actual_freq_min,
        freq_max=actual_freq_max,
        samplerate=samplerate,
    )

    # Convert to buffer
    buffer, buffer_size, fmt = psd_image_to_buffer(image)

    return Response(
        content=buffer.read(),
        media_type=f"image/{fmt}",
        headers={
            "content-length": str(buffer_size),
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
            "Expires": "0",
            # Axis range info for frontend to render labels
            "X-PSD-Min": str(psd_min),
            "X-PSD-Max": str(psd_max),
            "X-Freq-Min": str(actual_freq_min),
            "X-Freq-Max": str(actual_freq_max),
        },
    )

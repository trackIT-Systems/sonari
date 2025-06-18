"""REST API routes for audio."""

import os
from io import BytesIO
from typing import Annotated
from uuid import UUID

import soundfile as sf
from fastapi import APIRouter, Depends, Header, Response
from fastapi.responses import StreamingResponse

from sonari import api, schemas
from sonari.routes.dependencies import Session, SonariSettings

__all__ = ["audio_router"]

audio_router = APIRouter()

CHUNK_SIZE = 1024 * 124


@audio_router.get("/stream/")
async def stream_recording_audio(
    session: Session,
    settings: SonariSettings,
    recording_uuid: UUID,
    start_time: float | None = None,
    end_time: float | None = None,
    speed: float = 1,
    range: str = Header(None),
) -> Response:
    """Stream the audio of a recording.

    Parameters
    ----------
    session
        Database session.
    settings
        Sonari settings.
    recording_uuid
        The ID of the recording.

    Returns
    -------
    Response
        The audio file.
    """
    audio_dir = settings.audio_dir
    recording = await api.recordings.get(
        session,
        recording_uuid,
    )

    start, end = range.replace("bytes=", "").split("-")
    start = int(start)
    end = None if len(end) == 0 else int(end)

    data, start, end, filesize = api.load_clip_bytes(
        path=audio_dir / recording.path,
        start=start,
        end=end,
        time_expansion=recording.time_expansion,
        speed=speed,
        start_time=start_time,
        end_time=end_time,
    )

    headers = {
        "Content-Range": f"bytes {start}-{end}/{filesize}",
        "Content-Length": f"{len(data)}",
        "Accept-Ranges": "bytes",
    }
    status_code = 206  # if end < filesize else 200
    return Response(
        content=data,
        status_code=status_code,
        media_type="audio/wav",
        headers=headers,
    )


@audio_router.get("/download/")
async def download_recording_audio(
    session: Session,
    settings: SonariSettings,
    recording_uuid: UUID,
    audio_parameters: Annotated[
        schemas.AudioParameters,  # type: ignore
        Depends(schemas.AudioParameters),
    ],
    start_time: float | None = None,
    end_time: float | None = None,
) -> StreamingResponse:
    """Get audio for a recording.

    Parameters
    ----------
    session
        Database session.
    settings
        Sonari settings.
    recording_uuid
        The UUID of the recording.
    start_time
        The start time of the audio to return, by default None. If None, the
        audio will start at the beginning of the recording.
    end_time
        The end time of the audio to return, by default None. If None, the
        audio will end at the end of the recording.
    audio_parameters
        Audio parameters to use when processing the audio. Includes
        resampling and filtering parameters.

    Returns
    -------
    Response
        The audio file.
    """
    recording = await api.recordings.get(session, recording_uuid)

    audio_file = sf.SoundFile(os.path.join(settings.audio_dir, recording.path))
    format: str = audio_file.format
    samplerate = audio_file.samplerate
    audio = audio_file.read()

    # Write the audio to a buffer.
    buffer = BytesIO()
    sf.write(buffer, audio, samplerate, format=format.lower())
    buffer.seek(0)

    filename = os.path.basename(recording.path)

    # Return the audio.
    return StreamingResponse(
        content=buffer,
        media_type=f"audio/{format.lower()}",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )

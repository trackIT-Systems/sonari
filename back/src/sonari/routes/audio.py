"""REST API routes for audio."""

import os
from typing import Annotated

from fastapi import APIRouter, Header, HTTPException, Query, Response
from fastapi.responses import FileResponse

from sonari import api
from sonari.routes.dependencies import CurrentUser, Session, SonariSettings

__all__ = ["audio_router"]

audio_router = APIRouter()


@audio_router.get("/stream/")
async def stream_recording_audio(
    session: Session,
    settings: SonariSettings,
    recording_id: int,
    start_time: float | None = None,
    end_time: float | None = None,
    speed: Annotated[float, Query(gt=0)] = 1,
    channel: Annotated[int | None, Query(ge=0)] = None,
    range: str = Header(None),
) -> Response:
    """Stream the audio of a recording.

    Parameters
    ----------
    session
        Database session.
    settings
        Sonari settings.
    recording_id
        The ID of the recording.
    start_time
        The start time of the audio to return, by default None.
    end_time
        The end time of the audio to return, by default None.
    speed
        The playback speed multiplier, by default 1.
    channel
        Stream only this channel (mono), to match the spectrogram. By
        default every channel is streamed (stereo for two channels).
    range
        HTTP Range header for partial content requests.

    Returns
    -------
    Response
        The audio file with appropriate status code for browser compatibility.
    """
    if start_time is not None and start_time < 0:
        raise HTTPException(status_code=400, detail="start_time must be non-negative")
    if end_time is not None and end_time < 0:
        raise HTTPException(status_code=400, detail="end_time must be non-negative")
    if start_time is not None and end_time is not None and start_time > end_time:
        raise HTTPException(status_code=400, detail="start_time must be less than end_time")

    audio_dir = settings.audio_dir
    recording = await api.recordings.get(
        session,
        recording_id,
    )

    # "bytes=<start>-[<end>]", end inclusive. Without a Range header, serve
    # from the first byte (the response is still a partial chunk).
    start, end = 0, None
    if range:
        first, _, last = range.replace("bytes=", "").partition("-")
        start = int(first) if first else 0
        end = int(last) if last else None

    data, start, end, filesize = api.load_clip_bytes(
        path=audio_dir / recording.path,
        start=start,
        end=end,
        time_expansion=recording.time_expansion,
        speed=speed,
        start_time=start_time,
        end_time=end_time,
        channel=channel,
    )

    # Content-Range end is inclusive. Every chunk is "206 Partial Content",
    # the last one too: a 200 would tell the browser that this chunk is the
    # whole file, and playback would stop early.
    headers = {
        "Content-Range": f"bytes {start}-{end}/{filesize}",
        "Content-Length": f"{len(data)}",
        "Accept-Ranges": "bytes",
    }

    return Response(
        content=data,
        status_code=206,
        media_type="audio/wav",
        headers=headers,
    )


@audio_router.get("/download/")
async def download_recording_audio(
    session: Session,
    settings: SonariSettings,
    recording_id: int,
    _user: CurrentUser,
) -> FileResponse:
    """Download the original audio file for a recording.

    This endpoint serves the audio file directly without any processing,
    suitable for download buttons.

    Parameters
    ----------
    session
        Database session.
    settings
        Sonari settings.
    recording_id
        The ID of the recording.

    Returns
    -------
    FileResponse
        The original audio file as a download.
    """
    recording = await api.recordings.get(session, recording_id)
    file_path = settings.audio_dir / recording.path
    filename = os.path.basename(recording.path)

    # Determine media type from file extension
    file_ext = os.path.splitext(filename)[1].lower()
    media_type = file_ext.replace(".", "")

    return FileResponse(
        path=file_path,
        media_type=f"audio/{media_type}",
        filename=filename,
        content_disposition_type="attachment",
    )

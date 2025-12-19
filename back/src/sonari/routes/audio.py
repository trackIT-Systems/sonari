"""REST API routes for audio."""

import os

from fastapi import APIRouter, Header, Response
from fastapi.responses import FileResponse

from sonari import api
from sonari.routes.dependencies import Session, SonariSettings

__all__ = ["audio_router"]

audio_router = APIRouter()


@audio_router.get("/stream/")
async def stream_recording_audio(
    session: Session,
    settings: SonariSettings,
    recording_id: int,
    start_time: float | None = None,
    end_time: float | None = None,
    speed: float = 1,
    range: str = Header(None),
    user_agent: str = Header(None),
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
    range
        HTTP Range header for partial content requests.
    user_agent
        HTTP User-Agent header for browser detection.

    Returns
    -------
    Response
        The audio file with appropriate status code for browser compatibility.
    """
    audio_dir = settings.audio_dir
    recording = await api.recordings.get(
        session,
        recording_id,
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

    # Determine status code based on browser compatibility
    is_chrome_based = user_agent and ("chrome" in user_agent.lower() or "chromium" in user_agent.lower())
    is_last_chunk = end >= filesize - 1

    if is_chrome_based:
        # Chrome/Chromium: 206 for partial chunks, 200 for the last chunk
        status_code = 200 if is_last_chunk else 206
    else:
        # Firefox/Safari: Always use 200 for better compatibility
        status_code = 206

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
    recording_id: int,
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
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )

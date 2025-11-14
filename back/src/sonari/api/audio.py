"""API functions to load audio."""

import hashlib
import json
import struct
from pathlib import Path

import numpy as np
import soundfile as sf
from soundevent import audio, data
from soundevent.audio.io import audio_to_bytes

from sonari import schemas
from sonari.shared_cache_global import get_shared_cache

__all__ = [
    "load_audio",
    "load_clip_bytes",
    "load_audio_bytes_from_cache",
]

CHUNK_SIZE = 512 * 1024
HEADER_FORMAT = "<4si4s4sihhiihh4si"
HEADER_SIZE = struct.calcsize(HEADER_FORMAT)


def _create_audio_cache_key(
    recording: schemas.Recording,
) -> str:
    """Create a cache key for loaded audio clips."""
    params_dict = {
        "recording_id": recording.id,
        "recording_hash": recording.hash,
    }

    # Create a stable JSON string and hash it
    params_json = json.dumps(params_dict, sort_keys=True)
    params_hash = hashlib.sha256(params_json.encode()).hexdigest()[:16]

    return f"audio:{recording.id}:{params_hash}"


def load_audio(
    recording: schemas.Recording,
    start_time: float | None = None,
    end_time: float | None = None,
    audio_dir: Path | None = None,
    audio_parameters: schemas.AudioParameters | None = None,
):
    """Load audio with caching.

    This function caches the ENTIRE audio file in memory. When subsequent requests
    come in for different time ranges (e.g., streaming chunks), they are sliced
    from the cached full file. This is efficient because:
    - The frontend requests audio chunks sequentially (only once or twice per chunk)
    - All chunks come from the same file
    - Loading the full file once and caching it is better than caching individual chunks

    Parameters
    ----------
    recording
        The recording to load audio from.
    start_time
        Start time in seconds.
    end_time
        End time in seconds.
    audio_dir
        The directory where the audio files are stored.
    audio_parameters
        Audio parameters.

    Returns
    -------
    xr.DataArray
        Audio data as an xarray DataArray (sliced to requested time range).
    """
    if audio_dir is None:
        audio_dir = Path().cwd()

    if audio_parameters is None:
        audio_parameters = schemas.AudioParameters()

    # Set start and end times.
    if start_time is None:
        start_time = 0.0

    if end_time is None:
        end_time = recording.duration

    # Try to get FULL audio file from cache
    cache = get_shared_cache()
    cache_key = _create_audio_cache_key(recording)

    full_audio = None
    if cache is not None:
        full_audio = cache.get(cache_key)

    # If not in cache, load the ENTIRE file
    if full_audio is None:
        clip = data.Clip(
            recording=data.Recording(
                id=recording.id,
                path=audio_dir / recording.path,
                duration=recording.duration,
                samplerate=recording.samplerate,
                channels=recording.channels,
                time_expansion=recording.time_expansion,
            ),
            start_time=0,
            end_time=recording.duration,  # Load the ENTIRE file
        )

        # Load full audio file - soundfile will read from disk
        # The OS page cache will naturally cache these file pages
        # across all worker processes (no explicit mmap needed)
        full_audio = audio.load_clip(clip)

        if cache is not None:
            cache[cache_key] = full_audio

    # Apply audio processing to the full file
    # Resample audio.
    if audio_parameters.resample:
        full_audio = audio.resample(full_audio, audio_parameters.samplerate)

    # Filter audio.
    if audio_parameters.low_freq is not None or audio_parameters.high_freq is not None:
        full_audio = audio.filter(
            full_audio,
            low_freq=audio_parameters.low_freq,
            high_freq=audio_parameters.high_freq,
            order=audio_parameters.filter_order,
        )

    # Now slice the requested time range from the cached full audio
    # Convert time to sample indices
    samplerate = 1 / (full_audio.time.data[1] - full_audio.time.data[0])
    start_sample = int(start_time * samplerate)
    end_sample = int(end_time * samplerate)

    # Slice the audio data
    wave = full_audio.isel(time=slice(start_sample, end_sample))

    return wave


def load_audio_bytes_from_cache(
    recording: schemas.Recording,
    start_byte: int,
    end_byte: int | None,
    audio_dir: Path,
    start_time: float | None = None,
    end_time: float | None = None,
    speed: float = 1.0,
    frames: int = 8192,
    bit_depth: int = 16,
) -> tuple[bytes, int, int, int]:
    """Load audio bytes using the cached audio data.

    This function uses the cached full audio file (via load_audio) and converts
    the requested portion to bytes for streaming.

    Parameters
    ----------
    recording
        The recording to load.
    start_byte
        Start byte position for range request.
    end_byte
        End byte position for range request.
    audio_dir
        Directory where audio files are stored.
    start_time
        Start time in seconds (for time-based clipping).
    end_time
        End time in seconds (for time-based clipping).
    speed
        Playback speed multiplier.
    frames
        Number of frames to read per chunk.
    bit_depth
        Bit depth for output.

    Returns
    -------
    tuple
        (audio_bytes, actual_start, actual_end, total_filesize)
    """
    # Load the full audio (uses cache)
    # Note: We use default audio parameters (no resampling/filtering) for streaming
    audio_params = schemas.AudioParameters()

    if start_time is None:
        start_time = 0.0
    if end_time is None:
        end_time = recording.duration

    # Get the full cached audio
    full_audio = load_audio(
        recording=recording,
        start_time=0,
        end_time=recording.duration,
        audio_dir=audio_dir,
        audio_parameters=audio_params,
    )

    # Calculate parameters
    samplerate = int(recording.samplerate * recording.time_expansion)
    channels = recording.channels

    # Calculate time-based frame range
    start_frame = int(start_time * samplerate)
    end_frame = int(end_time * samplerate)
    total_frames = end_frame - start_frame
    bytes_per_frame = channels * bit_depth // 8
    filesize = total_frames * bytes_per_frame + HEADER_SIZE

    # Calculate byte-range offset in frames
    offset = start_frame
    if start_byte != 0:
        offset_frames = (start_byte - HEADER_SIZE) // bytes_per_frame
        offset += offset_frames

    # Limit frames to read
    frames_to_read = min(frames, end_frame - offset)

    # Slice the cached audio
    slice_start = offset
    slice_end = offset + frames_to_read
    audio_slice = full_audio.isel(time=slice(slice_start, slice_end))

    # Convert to numpy array
    # xarray DataArray has dimensions, need to get the raw numpy array
    # The soundevent xarray typically has dimensions (channel, time)
    audio_data = audio_slice.values

    # Ensure correct shape for audio_to_bytes: (time, channels)
    if audio_data.ndim == 1:
        # Single channel, reshape to (time, 1)
        audio_data = audio_data.reshape(-1, 1)
    elif audio_data.ndim == 2:
        # Check dimension order - soundevent uses (channel, time) but audio_to_bytes needs (time, channel)
        if audio_data.shape[0] == channels:
            # Data is (channel, time), transpose to (time, channel)
            audio_data = audio_data.T
        # else: already in (time, channel) format

    # Ensure it's C-contiguous for soundfile
    audio_data = np.ascontiguousarray(audio_data)

    audio_bytes = audio_to_bytes(
        audio_data,
        samplerate=int(samplerate * speed),
        bit_depth=bit_depth,
    )

    # Add WAV header if starting from byte 0
    if start_byte == 0:
        header = generate_wav_header(
            samplerate=int(samplerate * speed),
            channels=channels,
            data_size=filesize - HEADER_SIZE,
            bit_depth=bit_depth,
        )
        audio_bytes = header + audio_bytes

    # Handle Safari single-byte requests
    if end_byte is not None and end_byte - start_byte < len(audio_bytes):
        audio_bytes = audio_bytes[: end_byte - start_byte]

    return (
        audio_bytes,
        start_byte,
        start_byte + len(audio_bytes),
        filesize,
    )


BIT_DEPTH_MAP: dict[str, int] = {
    "PCM_S8": 8,
    "PCM_16": 16,
    "PCM_24": 24,
    "PCM_32": 32,
    "PCM_U8": 8,
    "FLOAT": 32,
    "DOUBLE": 64,
}


def load_clip_bytes(
    path: Path,
    start: int,
    end: int | None,
    speed: float = 1,
    frames: int = 8192,
    time_expansion: float = 1,
    start_time: float | None = None,
    end_time: float | None = None,
    bit_depth: int = 16,
) -> tuple[bytes, int, int, int]:
    """Load audio.

    Parameters
    ----------
    clip
        The clip to load audio from.
    start
        Start byte.
    end
        End byte.
    speed
        Speed of the audio.
    time_expansion
        Time expansion factor.
    start_time
        Start time in seconds.
    end_time
        End time in seconds.

    Returns
    -------
    bytes
        Loaded audio data in bytes
    start
        Start byte
    end
        End byte
    filesize
        Total size of clip in bytes.
    """
    with sf.SoundFile(path) as sf_file:
        samplerate = int(sf_file.samplerate * time_expansion)
        channels = sf_file.channels

        # Calculate start and end frames based on start and end times
        # to ensure that the requested piece of audio is loaded.
        if start_time is None:
            start_time = 0
        start_frame = int(start_time * samplerate)

        end_frame = sf_file.frames
        if end_time is not None:
            end_frame = int(end_time * samplerate)

        # Calculate the total number of frames and the size of the audio
        # data in bytes.
        total_frames = end_frame - start_frame
        bytes_per_frame = channels * bit_depth // 8
        filesize = total_frames * bytes_per_frame

        # Compute the offset, which is the frame at which to start reading
        # the audio data.
        offset = start_frame
        if start != 0:
            # When the start byte is not 0, calculate the offset in frames
            # and add it to the start frame. Note that we need to
            # remove the size of the header from the start byte to correctly
            # calculate the offset in frames.
            offset_frames = (start - HEADER_SIZE) // bytes_per_frame
            offset += offset_frames

        # Make sure that the number of frames to read is not greater than
        # the number of frames requested.
        frames = min(frames, end_frame - offset)

        sf_file.seek(offset)
        audio_data = sf_file.read(frames, fill_value=0, always_2d=True)

        # Convert the audio data to raw bytes
        audio_bytes = audio_to_bytes(
            audio_data,
            samplerate=samplerate,
            bit_depth=bit_depth,
        )

        # Generate the WAV header if the start byte is 0 and
        # append to the start of the audio data.
        if start == 0:
            header = generate_wav_header(
                samplerate=int(samplerate * speed),
                channels=channels,
                data_size=filesize,
                bit_depth=bit_depth,
            )
            audio_bytes = header + audio_bytes

        # This fixes the Safari playback issue, as the first request
        # in Safari always requests exactly one byte. This code makes
        # sure that only the requests amount (or less) is returned.
        if end is not None and end - start < len(audio_bytes):
            audio_bytes = audio_bytes[:end]

        return (
            audio_bytes,
            start,
            start + len(audio_bytes),
            filesize + HEADER_SIZE,
        )


def generate_wav_header(
    samplerate: int,
    channels: int,
    data_size: int,
    bit_depth: int = 16,
) -> bytes:
    """Generate the data of a WAV header.

    This function generates the data of a WAV header according to the
    given parameters. The WAV header is a 44-byte string that contains
    information about the audio data, such as the sample rate, the
    number of channels, and the number of samples. The WAV header
    assumes that the audio data is PCM encoded.

    Parameters
    ----------
    samplerate
        Sample rate in Hz.
    channels
        Number of channels.
    samples
        Number of samples.
    bit_depth
        The number of bits per sample. By default, it is 16 bits.

    Notes
    -----
    The structure of the WAV header is described in
    (WAV PCM soundfile format)[http://soundfile.sapp.org/doc/WaveFormat/].
    """
    byte_rate = samplerate * channels * bit_depth // 8
    block_align = channels * bit_depth // 8

    return struct.pack(
        HEADER_FORMAT,
        b"RIFF",  # RIFF chunk id
        data_size + 36,  # Size of the entire file minus 8 bytes
        b"WAVE",  # RIFF chunk id
        b"fmt ",  # fmt chunk id
        16,  # Size of the fmt chunk
        1,  # Audio format (3 corresponds to float)
        channels,  # Number of channels
        samplerate,  # Sample rate in Hz
        byte_rate,  # Byte rate
        block_align,  # Block align
        bit_depth,  # Number of bits per sample
        b"data",  # data chunk id
        data_size,  # Size of the data chunk
    )

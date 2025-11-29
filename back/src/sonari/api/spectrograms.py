"""API functions to generate spectrograms."""

from pathlib import Path

import numpy as np
from soundevent import arrays, audio
from soundevent.arrays import Dimensions, get_dim_step

import sonari.api.audio as audio_api
from sonari import schemas
from sonari.core.spectrograms import compute_spectrogram_from_samples, normalize_spectrogram

__all__ = [
    "compute_spectrogram",
    "compute_waveform",
]


def compute_spectrogram(
    recording: schemas.Recording,
    start_time: float,
    end_time: float,
    audio_parameters: schemas.AudioParameters,
    spectrogram_parameters: schemas.SpectrogramParameters,
    audio_dir: Path | None = None,
) -> np.ndarray:
    """Compute a spectrogram for a recording.

    Parameters
    ----------
    recording
        The recording to compute the spectrogram for.
    start_time
        Start time in seconds.
    end_time
        End time in seconds.
    audio_dir
        The directory where the audio files are stored.
    spectrogram_parameters : SpectrogramParameters
        Spectrogram parameters.

    Returns
    -------
    DataArray
        Spectrogram image.
    """
    if audio_dir is None:
        audio_dir = Path.cwd()

    wav = audio_api.load_audio(
        recording,
        start_time,
        end_time,
        audio_parameters=audio_parameters,
        audio_dir=audio_dir,
    )

    # Select channel. Do this early to avoid unnecessary computation.
    # Handle channel mismatch gracefully - if requested channel doesn't exist, fall back to channel 0
    available_channels = wav.sizes.get("channel", 1)
    channel_to_use = spectrogram_parameters.channel if spectrogram_parameters.channel < available_channels else 0
    wav = wav[dict(channel=[channel_to_use])]

    # if spectrogram_parameters.overlap_percent == 1:
    #     # Decimate to 8 kHz by skipping samples
    #     current_samplerate = 1 / get_dim_step(wav, Dimensions.time.value)
    #     target_samplerate = 8000
    #     decimation_factor = int(current_samplerate / target_samplerate)

    #     if decimation_factor > 1:
    #         # Skip samples by taking every Nth sample along the time dimension
    #         wav = wav[{Dimensions.time.value: slice(None, None, decimation_factor)}]

    # Convert samples to seconds
    window_size_samples = spectrogram_parameters.window_size_samples
    overlap_percent = spectrogram_parameters.overlap_percent

    # Calculate hop size from overlap
    overlap_samples = int(window_size_samples * overlap_percent / 100)
    hop_size_samples = window_size_samples - overlap_samples

    spectrogram = compute_spectrogram_from_samples(
        wav,
        window_size_samples,
        hop_size_samples,
        window_type=spectrogram_parameters.window,
    )

    # De-noise spectrogram with PCEN
    if not spectrogram_parameters.pcen:
        # NOTE: PCEN expects a spectrogram in amplitude scale so it should be
        # applied before scaling.
        spectrogram = audio.pcen(spectrogram)

    # Scale spectrogram.
    spectrogram = arrays.to_db(
        spectrogram,
        min_db=spectrogram_parameters.min_dB,
        max_db=spectrogram_parameters.max_dB,
    )

    # Scale to [0, 1]. If normalization is relative, the minimum and maximum
    # values are computed from the spectrogram, otherwise they are taken from
    # the provided min_dB and max_dB.
    spectrogram = normalize_spectrogram(
        spectrogram,
        relative=spectrogram_parameters.normalize,
    )

    # Get the underlying numpy array.
    array = spectrogram.data

    # Remove unncecessary dimensions.
    return array.squeeze()


def compute_waveform(
    recording: schemas.Recording,
    start_time: float,
    end_time: float,
    audio_parameters: schemas.AudioParameters,
    spectrogram_parameters: schemas.SpectrogramParameters,
    audio_dir: Path | None = None,
) -> np.ndarray:
    """Compute waveform for a recording segment.

    Parameters
    ----------
    recording : Recording
        The recording to compute the waveform for.
    start_time : float
        Start time in seconds.
    end_time : float
        End time in seconds.
    audio_parameters : AudioParameters
        Audio loading parameters.
    spectrogram_parameters : SpectrogramParameters
        Spectrogram parameters used to calculate image dimensions.
    audio_dir : Path | None
        Directory where audio files are stored.

    Returns
    -------
    np.ndarray
        Waveform data as a 2D array with values between 0 and 1.
        Width matches the number of STFT time bins for proper stitching.
    """
    if audio_dir is None:
        audio_dir = Path.cwd()

    wav = audio_api.load_audio(
        recording,
        start_time,
        end_time,
        audio_parameters=audio_parameters,
        audio_dir=audio_dir,
    )

    # Select channel (always use channel 0 for waveform)
    wav = wav[dict(channel=[0])]
    waveform = wav.data.squeeze()

    # Calculate dimensions based on STFT parameters
    # This ensures pixel-to-time ratio matches spectrograms for proper image stitching
    duration = end_time - start_time
    window_size_samples = spectrogram_parameters.window_size_samples
    overlap_percent = spectrogram_parameters.overlap_percent

    # Get actual samplerate from loaded audio (important if audio was resampled)
    actual_samplerate = 1 / get_dim_step(wav, Dimensions.time.value)

    # Calculate hop size
    overlap_samples = int(window_size_samples * overlap_percent / 100)
    hop_size_samples = window_size_samples - overlap_samples
    hop_size_seconds = hop_size_samples / actual_samplerate

    # Width = number of STFT time bins
    width = int(np.ceil(duration / hop_size_seconds))

    # Height matches frontend WAVEFORM_CANVAS_DIMENSIONS.height
    height = 64

    # Resample waveform to match target width
    # Use min/max downsampling for better visual representation
    samples_per_pixel = len(waveform) // width

    if samples_per_pixel > 1:
        # Reshape and compute min/max for each pixel column
        truncated_length = (len(waveform) // samples_per_pixel) * samples_per_pixel
        reshaped = waveform[:truncated_length].reshape(-1, samples_per_pixel)
        waveform_max = reshaped.max(axis=1)
        waveform_min = reshaped.min(axis=1)
    else:
        # If we have fewer samples than pixels, just use the waveform as-is
        # and pad or interpolate if needed
        waveform_max = waveform[:width] if len(waveform) >= width else np.pad(waveform, (0, width - len(waveform)))
        waveform_min = waveform_max

    # Create 2D array for the waveform visualization
    canvas = np.zeros((height, width), dtype=np.float32)

    # Normalize waveform to [0, height-1] range
    # Center line is at height // 2
    center = height // 2

    # Normalize amplitude to use available height
    # Find max absolute value for symmetric scaling
    max_amp = max(abs(waveform_max.max()), abs(waveform_min.min()))
    if max_amp > 0:
        scale = (height // 2 - 1) / max_amp
    else:
        scale = 1

    # For each x position, fill from min to max amplitude
    for x in range(min(width, len(waveform_max))):
        y_max = int(center - waveform_max[x] * scale)
        y_min = int(center - waveform_min[x] * scale)

        # Clamp to valid range
        y_max = max(0, min(height - 1, y_max))
        y_min = max(0, min(height - 1, y_min))

        # Fill from min to max (or max to min if inverted)
        start_y = min(y_max, y_min)
        end_y = max(y_max, y_min) + 1
        canvas[start_y:end_y, x] = 1.0

    return canvas

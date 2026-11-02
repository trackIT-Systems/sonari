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

    # Select channel or mix to mono. Do this early to avoid unnecessary computation.
    wav = audio_api.select_audio_channel(wav, spectrogram_parameters)

    # if spectrogram_parameters.overlap_percent == 1:
    #     # Decimate to 8 kHz by skipping samples
    #     current_samplerate = 1 / get_dim_step(wav, Dimensions.time.value)
    #     target_samplerate = 8000
    #     decimation_factor = int(current_samplerate / target_samplerate)

    #     if decimation_factor > 1:
    #         # Skip samples by taking every Nth sample along the time dimension
    #         wav = wav[{Dimensions.time.value: slice(None, None, decimation_factor)}]

    # Get audio length in samples
    audio_length = wav.sizes.get("time", len(wav.time))

    # Get window size and overlap
    window_size_samples = spectrogram_parameters.window_size_samples
    overlap_percent = spectrogram_parameters.overlap_percent

    # Clamp window size to not exceed audio length
    if window_size_samples > audio_length:
        window_size_samples = max(64, audio_length)  # Minimum 64 samples

    # Calculate hop size from overlap
    overlap_samples = int(window_size_samples * overlap_percent / 100)
    hop_size_samples = window_size_samples - overlap_samples

    # Ensure hop size is at least 1
    if hop_size_samples < 1:
        hop_size_samples = 1
        overlap_samples = window_size_samples - 1

    # Previews and zoomed out views only need a limited number of columns: widen
    # the hop instead of computing every frame and downscaling afterwards. Frames
    # further apart than half a window would leave audio unanalysed (short calls
    # could vanish), so beyond that columns are max-pooled instead.
    pool_size = 1
    if spectrogram_parameters.max_columns is not None:
        min_hop_size_samples = int(np.ceil(audio_length / spectrogram_parameters.max_columns))
        max_hop_size_samples = max(hop_size_samples, window_size_samples // 2)
        if min_hop_size_samples > max_hop_size_samples:
            pool_size = int(np.ceil(min_hop_size_samples / max_hop_size_samples))
        # hop * pool_size ~= min_hop_size_samples, so close to max_columns remain
        pooled_hop_size_samples = int(np.ceil(min_hop_size_samples / pool_size))
        hop_size_samples = max(hop_size_samples, pooled_hop_size_samples)

    spectrogram = compute_spectrogram_from_samples(
        wav,
        window_size_samples,
        hop_size_samples,
        window_type=spectrogram_parameters.window,
    )

    # Pool right after the STFT so the steps below run on far fewer columns. dB
    # scaling and normalisation commute with the maximum; PCEN smooths per frame,
    # so like any hop change, pooling alters its effective time constant.
    if pool_size > 1:
        spectrogram = spectrogram.coarsen(
            {Dimensions.time.value: pool_size},
            boundary="pad",
            coord_func="min",
        ).max()

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

    wav = audio_api.select_audio_channel(wav, spectrogram_parameters)
    waveform = wav.data.squeeze()

    # Calculate dimensions based on STFT parameters
    # This ensures pixel-to-time ratio matches spectrograms for proper image stitching
    duration = end_time - start_time
    window_size_samples = spectrogram_parameters.window_size_samples
    overlap_percent = spectrogram_parameters.overlap_percent

    # Get actual samplerate from loaded audio (important if audio was resampled)
    actual_samplerate = 1 / get_dim_step(wav, Dimensions.time.value)

    # Clamp window size to not exceed waveform length
    if window_size_samples > len(waveform):
        window_size_samples = max(64, len(waveform))

    # Calculate hop size
    overlap_samples = int(window_size_samples * overlap_percent / 100)
    hop_size_samples = window_size_samples - overlap_samples

    # Ensure hop size is at least 1
    if hop_size_samples < 1:
        hop_size_samples = 1

    hop_size_seconds = hop_size_samples / actual_samplerate

    # Width = number of STFT time bins
    width = int(np.ceil(duration / hop_size_seconds))

    # Zoomed out views only need as many columns as are drawn
    if spectrogram_parameters.max_columns is not None:
        width = min(width, spectrogram_parameters.max_columns)

    # Height matches frontend WAVEFORM_CANVAS_DIMENSIONS.height
    height = 64

    # Resample waveform to match target width
    # Use min/max downsampling for better visual representation
    if len(waveform) > width:
        # Exactly `width` columns spanning all samples, so the image lines up
        # with the requested time range.
        column_starts = np.linspace(0, len(waveform), width + 1).astype(int)[:-1]
        waveform_max = np.maximum.reduceat(waveform, column_starts)
        waveform_min = np.minimum.reduceat(waveform, column_starts)
    else:
        # If we have fewer samples than pixels, just use the waveform as-is
        # and pad or interpolate if needed
        waveform_max = waveform[:width] if len(waveform) >= width else np.pad(waveform, (0, width - len(waveform)))
        waveform_min = waveform_max

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

    # Fill each column from min to max amplitude
    y_max = np.clip(np.trunc(center - waveform_max * scale), 0, height - 1)
    y_min = np.clip(np.trunc(center - waveform_min * scale), 0, height - 1)
    rows = np.arange(height)[:, None]
    canvas = (rows >= np.minimum(y_max, y_min)) & (rows <= np.maximum(y_max, y_min))

    return canvas.astype(np.float32)

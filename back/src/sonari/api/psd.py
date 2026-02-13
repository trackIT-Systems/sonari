"""API functions to generate Power Spectral Density plots."""

from pathlib import Path

import numpy as np
from soundevent import arrays, audio
from soundevent.arrays import Dimensions, get_dim_step

import sonari.api.audio as audio_api
from sonari import schemas
from sonari.core.spectrograms import compute_spectrogram_from_samples

__all__ = [
    "compute_psd",
]


def compute_psd(
    recording: schemas.Recording,
    start_time: float,
    end_time: float,
    audio_parameters: schemas.AudioParameters,
    spectrogram_parameters: schemas.SpectrogramParameters,
    audio_dir: Path | None = None,
) -> tuple[np.ndarray, np.ndarray, float]:
    """Compute Power Spectral Density for a recording segment.

    The PSD is computed by averaging the spectrogram over the time axis,
    giving a 1D representation of power vs frequency.

    Parameters
    ----------
    recording
        The recording to compute the PSD for.
    start_time
        Start time in seconds.
    end_time
        End time in seconds.
    audio_parameters
        Audio loading parameters.
    spectrogram_parameters
        Spectrogram parameters for the underlying STFT.
    audio_dir
        The directory where the audio files are stored.

    Returns
    -------
    tuple[np.ndarray, np.ndarray, float]
        Tuple of (psd_values, frequencies, samplerate).
        - psd_values: 1D array of power values in dB at each frequency bin.
        - frequencies: 1D array of frequency values (Hz) for each bin.
        - samplerate: The effective sample rate used for computation.
    """
    if audio_dir is None:
        audio_dir = Path.cwd()

    # Gracefully clip time range to valid bounds
    start_time = max(0, start_time)
    end_time = min(recording.duration, end_time)
    
    # If start_time >= end_time, swap them or use a small default window
    if start_time >= end_time:
        # If they're equal or invalid, create a small window around that time
        center_time = max(0, min(start_time, recording.duration))
        min_duration = max(
            0.02,  # 20ms minimum window
            spectrogram_parameters.window_size_samples / recording.samplerate * 3
        )
        start_time = max(0, center_time - min_duration / 2)
        end_time = min(recording.duration, center_time + min_duration / 2)
    
    # Check if the time segment is too small and expand it if needed
    min_duration = max(
        0.02,  # 20ms absolute minimum
        spectrogram_parameters.window_size_samples / recording.samplerate * 3  # At least 3 windows
    )
    duration = end_time - start_time
    
    if duration < min_duration:
        # Expand the window around the center while respecting recording bounds
        center = (start_time + end_time) / 2
        half_duration = min_duration / 2
        
        start_time = center - half_duration
        end_time = center + half_duration
        
        # Adjust if we're out of bounds
        if start_time < 0:
            start_time = 0
            end_time = min(min_duration, recording.duration)
        
        if end_time > recording.duration:
            end_time = recording.duration
            start_time = max(0, recording.duration - min_duration)

    try:
        wav = audio_api.load_audio(
            recording,
            start_time,
            end_time,
            audio_parameters=audio_parameters,
            audio_dir=audio_dir,
        )
    except Exception as e:
        # Log the error but try to recover by loading from the start of the recording
        import logging
        logger = logging.getLogger(__name__)
        logger.warning(
            f"Failed to load audio at {start_time:.6f}s - {end_time:.6f}s for recording {recording.id}. "
            f"Error: {type(e).__name__}: {e}. Attempting to load from start..."
        )
        
        # Try loading from the beginning with the same duration
        duration = end_time - start_time
        try:
            wav = audio_api.load_audio(
                recording,
                0,
                min(duration, recording.duration),
                audio_parameters=audio_parameters,
                audio_dir=audio_dir,
            )
        except Exception as e2:
            # If that also fails, raise a more informative error
            raise RuntimeError(
                f"Failed to load audio for PSD calculation even after fallback attempt. "
                f"Recording: {recording.id}, Original time range: {start_time:.6f}s - {end_time:.6f}s. "
                f"Fallback range: 0s - {min(duration, recording.duration):.6f}s. "
                f"Error: {type(e2).__name__}: {e2}"
            ) from e2

    # Select channel
    available_channels = wav.sizes.get("channel", 1)
    channel_to_use = (
        spectrogram_parameters.channel
        if spectrogram_parameters.channel < available_channels
        else 0
    )
    wav = wav[dict(channel=[channel_to_use])]

    # Get samplerate from loaded audio
    samplerate = 1 / get_dim_step(wav, Dimensions.time.value)

    # Get audio length in samples
    audio_length = wav.sizes.get("time", len(wav.time))

    # Calculate hop size from overlap
    window_size_samples = spectrogram_parameters.window_size_samples
    overlap_percent = spectrogram_parameters.overlap_percent

    # Clamp window size to not exceed audio length
    if window_size_samples > audio_length:
        window_size_samples = max(64, audio_length)  # Minimum 64 samples

    overlap_samples = int(window_size_samples * overlap_percent / 100)
    hop_size_samples = window_size_samples - overlap_samples

    # Ensure hop size is at least 1
    if hop_size_samples < 1:
        hop_size_samples = 1
        overlap_samples = window_size_samples - 1

    # Compute spectrogram
    spectrogram = compute_spectrogram_from_samples(
        wav,
        window_size_samples,
        hop_size_samples,
        window_type=spectrogram_parameters.window,
    )

    # De-noise spectrogram with PCEN if enabled
    if spectrogram_parameters.pcen:
        spectrogram = audio.pcen(spectrogram)

    # Convert to dB scale
    spectrogram = arrays.to_db(
        spectrogram,
        min_db=spectrogram_parameters.min_dB,
        max_db=spectrogram_parameters.max_dB,
    )

    # Get the spectrogram array and squeeze unnecessary dimensions
    spec_array = spectrogram.data.squeeze()

    # spec_array is (frequency, time) - average over time axis (axis=1)
    if spec_array.ndim == 2:
        psd = np.mean(spec_array, axis=1)
    else:
        psd = spec_array

    # Compute frequency array
    num_freq_bins = len(psd)
    nyquist = samplerate / 2
    frequencies = np.linspace(0, nyquist, num_freq_bins)

    return psd, frequencies, samplerate


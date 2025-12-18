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

    wav = audio_api.load_audio(
        recording,
        start_time,
        end_time,
        audio_parameters=audio_parameters,
        audio_dir=audio_dir,
    )

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

    # De-noise spectrogram with PCEN if not disabled
    if not spectrogram_parameters.pcen:
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


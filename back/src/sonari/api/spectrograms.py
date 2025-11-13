"""API functions to generate spectrograms."""

from io import BytesIO
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
from matplotlib import colormaps
from PIL import Image
from soundevent import arrays, audio

import sonari.api.audio as audio_api
from sonari import schemas
from sonari.core.spectrograms import normalize_spectrogram

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
    low_res: bool = False,
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

    # Get samplerate from wav
    samplerate = recording.samplerate

    # Convert samples to seconds
    window_size_samples = spectrogram_parameters.window_size_samples
    overlap_percent = spectrogram_parameters.overlap_percent

    if low_res:
        window_size_samples = window_size_samples * 10
        overlap_percent = max(50.0, overlap_percent - 25.0)

    # Calculate hop size from overlap
    overlap_samples = int(window_size_samples * overlap_percent / 100)
    hop_size_samples = window_size_samples - overlap_samples

    # Convert to seconds for soundevent
    window_size = window_size_samples / samplerate
    hop_size = hop_size_samples / samplerate

    spectrogram = audio.compute_spectrogram(
        wav,
        window_size=window_size,
        hop_size=hop_size,
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
    audio_parameters: schemas.AudioParameters,
    audio_dir: Path | None = None,
    return_image: bool = False,
    cmap: str = "plasma",
    gamma: float = 1.0,
) -> np.ndarray | bytes:
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
    audio_dir : Path | None
        Directory where audio files are stored.
    return_image : bool
        If True, return a PNG image buffer of the waveform. Otherwise return data array.

    Returns
    -------
    np.ndarray or bytes
        Waveform data array or PNG image buffer.
    """
    if audio_dir is None:
        audio_dir = Path.cwd()

    wav = audio_api.load_audio(
        recording,
        0,
        recording.duration,
        audio_parameters=audio_parameters,
        audio_dir=audio_dir,
    )

    # Select channel (always use channel 0 for waveform)
    wav = wav[dict(channel=[0])]
    waveform = wav.data.squeeze()

    if return_image:
        time = np.linspace(0, recording.duration, waveform.shape[-1])

        # --- 1. Create figure and plot ---
        width_inches = 12
        height_inches = 1

        fig, ax = plt.subplots(figsize=(width_inches, height_inches), dpi=500)
        ax.plot(time, waveform, linewidth=0.1, color="white")

        for spine in ax.spines.values():
            spine.set_visible(False)
        ax.set_xticks([])
        ax.set_yticks([])
        ax.set_xticklabels([])
        ax.set_yticklabels([])

        fig.patch.set_facecolor("black")
        ax.set_facecolor("black")

        ax.set_xlim(time[0], time[-1])
        plt.subplots_adjust(left=0, right=1, top=1, bottom=0)

        # --- 2. Save to buffer (grayscale image) ---
        buf = BytesIO()
        fig.savefig(buf, format="png", dpi=500, bbox_inches="tight", pad_inches=0)
        plt.close(fig)
        buf.seek(0)

        # --- 3. Load image with PIL ---
        image = Image.open(buf).convert("L")  # grayscale

        # --- 4. Normalize and apply gamma ---
        arr = np.array(image).astype(np.float32) / 255.0
        arr = np.power(arr, 1 / gamma)

        # --- 5. Apply colormap ---
        cmap_fn = colormaps.get_cmap(cmap)
        rgba = cmap_fn(arr, bytes=True)
        colored_img = Image.fromarray(rgba)

        # --- 6. Return final image buffer ---
        out_buf = BytesIO()
        colored_img.save(out_buf, format="PNG")
        out_buf.seek(0)
        return out_buf.read()

    return waveform

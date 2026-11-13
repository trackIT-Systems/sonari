"""Main frequencies of the sound events of an annotation task."""

from pathlib import Path
from typing import Sequence

import numpy as np

import sonari.api.audio as audio_api
from sonari import schemas
from sonari.core.main_frequency import peak_frequency
from sonari.core.spectrograms import compute_spectrogram_from_samples

__all__ = [
    "MAIN_FREQUENCY_DEFAULT_BAND",
    "compute_main_frequencies",
    "sound_event_extent",
]

# Band searched for sound events without a frequency range (Hz), as the PSD axis
MAIN_FREQUENCY_DEFAULT_BAND = (10_000.0, 110_000.0)

# Fixed STFT, independent of the display settings, so the result is the same for everyone
WINDOW_SIZE_SAMPLES = 1024
HOP_SIZE_SAMPLES = 256


def sound_event_extent(
    sound_event_annotation: schemas.SoundEventAnnotation,
) -> tuple[float, float, float | None, float | None] | None:
    """Time span and frequency band of a sound event: (start, end, low, high).

    The band is None where the geometry has none. None for geometries
    without a single time span.
    """
    geometry = sound_event_annotation.geometry
    coordinates = geometry.coordinates
    if geometry.type == "BoundingBox":
        start, low, end, high = coordinates
        if low >= high:
            return start, end, None, None
        return start, end, low, high
    if geometry.type == "TimeInterval":
        start, end = coordinates
        return start, end, None, None
    if geometry.type == "TimeStamp":
        return coordinates, coordinates, None, None
    if geometry.type == "Point":
        time, _ = coordinates
        return time, time, None, None
    return None


def compute_main_frequencies(
    recording: schemas.Recording,
    start_time: float,
    end_time: float,
    sound_event_annotations: Sequence[schemas.SoundEventAnnotation],
    audio_dir: Path | None = None,
    channel: int = 0,
) -> dict[int, float | None]:
    """Main frequency of each sound event, by id.

    The main frequency is the frequency of maximum power, averaged over the
    sound event's time span, within its bounding box's band (or
    MAIN_FREQUENCY_DEFAULT_BAND without one). One spectrogram over the task's
    time span serves all its sound events. None where nothing can be
    measured (no time span, band above Nyquist, silence).
    """
    if not sound_event_annotations:
        return {}

    start_time = max(0.0, start_time)
    end_time = min(recording.duration, end_time)
    wav = audio_api.load_audio(recording, start_time, end_time, audio_dir=audio_dir)
    if "channel" in wav.dims:
        wav = wav.isel(channel=[min(channel, wav.sizes["channel"] - 1)])

    num_samples = wav.sizes["time"]
    window_size = max(64, min(WINDOW_SIZE_SAMPLES, num_samples))
    hop_size = max(1, min(HOP_SIZE_SAMPLES, window_size // 4))
    spectrogram = compute_spectrogram_from_samples(wav, window_size, hop_size, scale="psd")

    times = spectrogram.time.values
    frequencies = spectrogram.frequency.values
    extra_dims = [dim for dim in spectrogram.dims if dim not in ("frequency", "time")]
    power = spectrogram.isel({dim: 0 for dim in extra_dims}).transpose("frequency", "time").values

    results: dict[int, float | None] = {}
    for sound_event_annotation in sound_event_annotations:
        extent = sound_event_extent(sound_event_annotation)
        if extent is None or times.size == 0:
            results[sound_event_annotation.id] = None
            continue
        start, end, low, high = extent
        if low is None or high is None:
            low, high = MAIN_FREQUENCY_DEFAULT_BAND

        columns = (times >= start) & (times <= end)
        if not columns.any():
            # Shorter than a hop (or a time stamp): the nearest frame
            columns = np.zeros(times.size, dtype=bool)
            columns[int(np.argmin(np.abs(times - (start + end) / 2)))] = True
        rows = (frequencies >= low) & (frequencies <= high)
        if not rows.any():
            results[sound_event_annotation.id] = None
            continue

        spectrum = power[rows][:, columns].mean(axis=1)
        results[sound_event_annotation.id] = peak_frequency(spectrum, frequencies[rows])
    return results

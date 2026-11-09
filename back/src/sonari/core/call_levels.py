"""Levels of a call inside a bounding box, from its samples.

Pure computation; :mod:`sonari.api.call_levels` loads the audio and stores the levels
as sound event features under the names below.
"""

from dataclasses import dataclass

import numpy as np
from scipy import signal

__all__ = [
    "BOUNDING_BOX",
    "CALL_LEVEL_FEATURE_NAMES",
    "CallLevels",
    "LEVEL_CHANNEL",
    "LEVEL_CLIPPED",
    "LEVEL_PEAK",
    "LEVEL_RMS",
    "LEVEL_SNR",
    "measure_box_levels",
]

LEVEL_PEAK = "call_level_peak_dbfs"
"""Loudest short-time RMS (``frame_duration``) inside the box, in dBFS."""
LEVEL_RMS = "call_level_rms_dbfs"
"""RMS over the whole box, in dBFS. Lower for boxes drawn loosely in time."""
LEVEL_SNR = "call_level_snr_db"
"""Box RMS minus the RMS of the same band in the padding around it. Absent without padding."""
LEVEL_CLIPPED = "call_level_clipped"
"""1 if a raw sample inside the box reached full scale: the real level is higher."""
LEVEL_CHANNEL = "call_level_channel"
"""Channel the levels were measured on (0 for mono): of a multichannel file, the one where the
call is clearest. Also marks current measurements: levels stored before channels were chosen
lack it and count as unmeasured."""
CALL_LEVEL_FEATURE_NAMES = (LEVEL_PEAK, LEVEL_RMS, LEVEL_SNR, LEVEL_CLIPPED, LEVEL_CHANNEL)

BOUNDING_BOX = "BoundingBox"
CLIP_THRESHOLD = 0.999
_POWER_FLOOR = 1e-20  # -200 dBFS, for digital silence


@dataclass(frozen=True)
class CallLevels:
    """Levels of one call."""

    peak_dbfs: float
    rms_dbfs: float
    snr_db: float | None
    clipped: bool
    channel: int | None = None

    def as_features(self) -> dict[str, float]:
        features = {
            LEVEL_PEAK: self.peak_dbfs,
            LEVEL_RMS: self.rms_dbfs,
            LEVEL_CLIPPED: float(self.clipped),
        }
        if self.snr_db is not None:
            features[LEVEL_SNR] = self.snr_db
        if self.channel is not None:
            features[LEVEL_CHANNEL] = float(self.channel)
        return features

    def clarity(self) -> float:
        """How clearly the call stands out, to pick a channel: SNR, else the peak level."""
        return self.snr_db if self.snr_db is not None else self.peak_dbfs


def _db(power: float) -> float:
    return float(10 * np.log10(max(power, _POWER_FLOOR)))


def _band_filter(
    samples: np.ndarray,
    samplerate: float,
    low_freq: float | None,
    high_freq: float | None,
    order: int,
) -> np.ndarray:
    """Zero-phase Butterworth filter to the band; edges at 0 Hz or Nyquist are left open."""
    nyquist = samplerate / 2
    low = low_freq if low_freq is not None and 0 < low_freq < nyquist else None
    high = high_freq if high_freq is not None and 0 < high_freq < 0.99 * nyquist else None
    if low is not None and high is not None and low >= high:
        high = None

    if low is not None and high is not None:
        sos = signal.butter(order, [low, high], btype="bandpass", fs=samplerate, output="sos")
    elif low is not None:
        sos = signal.butter(order, low, btype="highpass", fs=samplerate, output="sos")
    elif high is not None:
        sos = signal.butter(order, high, btype="lowpass", fs=samplerate, output="sos")
    else:
        return samples

    padlen = min(3 * (2 * len(sos) + 1), len(samples) - 1)
    if padlen < 1:
        return samples
    return signal.sosfiltfilt(sos, samples, padlen=padlen)


def measure_box_levels(
    samples: np.ndarray,
    samplerate: float,
    start_time: float,
    box: tuple[float, float, float, float],
    *,
    frame_duration: float = 0.005,
    filter_order: int = 4,
) -> CallLevels:
    """Measure the levels of a call in a bounding box.

    Parameters
    ----------
    samples
        Mono audio in full-scale units ([-1, 1]), covering the box and, for the SNR, some
        padding before and/or after it.
    samplerate
        Samplerate of ``samples`` in Hz.
    start_time
        Time of ``samples[0]`` in seconds, in the same time base as the box.
    box
        ``(start_time, low_freq, end_time, high_freq)`` as stored in a BoundingBox.
    frame_duration
        Window of the sliding RMS whose maximum is the peak level. Boxes shorter than
        this use their full length.
    filter_order
        Order of the Butterworth band filter (applied forwards and backwards).

    """
    samples = np.asarray(samples, dtype=np.float64)
    if samples.ndim != 1 or samples.size == 0:
        raise ValueError("Expected non-empty mono samples")

    box_start, low_freq, box_end, high_freq = box
    box_start, box_end = sorted((box_start, box_end))
    low_freq, high_freq = sorted((low_freq, high_freq))

    i0 = int(np.clip(round((box_start - start_time) * samplerate), 0, samples.size - 1))
    i1 = int(np.clip(round((box_end - start_time) * samplerate), i0 + 1, samples.size))

    band = _band_filter(samples, samplerate, low_freq, high_freq, filter_order)
    call = band[i0:i1]
    squares = call**2

    window = int(np.clip(round(frame_duration * samplerate), 1, call.size))
    cumulative = np.concatenate(([0.0], np.cumsum(squares)))
    peak_power = float(np.max(cumulative[window:] - cumulative[:-window]) / window)
    rms_power = float(squares.mean())

    # Median over short frames, so neighbouring calls in the padding don't count as noise.
    frame_powers = [
        (part[: part.size // window * window] ** 2).reshape(-1, window).mean(axis=1)
        for part in (band[:i0], band[i1:])
        if part.size >= window
    ]
    snr_db = _db(rms_power) - _db(float(np.median(np.concatenate(frame_powers)))) if frame_powers else None

    return CallLevels(
        peak_dbfs=_db(peak_power),
        rms_dbfs=_db(rms_power),
        snr_db=snr_db,
        clipped=bool(np.any(np.abs(samples[i0:i1]) >= CLIP_THRESHOLD)),
    )

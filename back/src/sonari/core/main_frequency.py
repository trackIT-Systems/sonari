"""Main (peak) frequency of a sound event."""

import numpy as np

__all__ = ["peak_frequency"]


def peak_frequency(spectrum: np.ndarray, frequencies: np.ndarray) -> float | None:
    """Frequency of maximum power in a power spectrum.

    The peak bin is refined by fitting a parabola through the dB values of
    the bin and its two neighbours, which locates the peak more finely than
    the bin spacing.

    Parameters
    ----------
    spectrum
        1D array of linear power values, one per frequency bin.
    frequencies
        1D array of the bins' frequencies (Hz), evenly spaced.

    Returns
    -------
    float | None
        The peak frequency in Hz, or None for an empty or silent spectrum.
    """
    if spectrum.size == 0:
        return None
    index = int(np.argmax(spectrum))
    if not spectrum[index] > 0:
        return None
    frequency = float(frequencies[index])
    if 0 < index < spectrum.size - 1:
        tiny = np.finfo(float).tiny
        left, center, right = 10 * np.log10(np.maximum(spectrum[index - 1 : index + 2], tiny))
        curvature = left - 2 * center + right
        if curvature < 0:
            offset = 0.5 * (left - right) / curvature
            frequency += float(offset * (frequencies[index + 1] - frequencies[index]))
    return frequency

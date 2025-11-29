"""Functions for spectrogram manipulation."""

from typing import Callable, Literal, Optional, Union

import numpy as np
import xarray as xr
from scipy import signal
from soundevent.arrays import (
    ArrayAttrs,
    Dimensions,
    create_frequency_dim_from_array,
    create_time_dim_from_array,
    get_dim_step,
)

__all__ = [
    "normalize_spectrogram",
    "compute_spectrogram_from_samples",
]

DEFAULT_DIM_ORDER = ("frequency", "time", "channel")


def normalize_spectrogram(
    spectrogram: xr.DataArray,
    relative: bool = False,
) -> xr.DataArray:
    """Normalize array values to [0, 1].

    The minimum value will be mapped to 0 and the maximum value will be mapped
    to 1.

    Parameters
    ----------
    spectrogram : xr.DataArray
        The spectrogram to normalize.
    relative : bool
        If True, use the minimum and maximum values of the spectrogram to
        normalize. If False, use the minimum and maximum values of the
        spectrogram's attributes.

    Returns
    -------
    xr.DataArray
        Normalized array.
    """
    attrs = spectrogram.attrs
    min_val = attrs.get("min_dB")
    if min_val is None or relative:
        min_val = spectrogram.min()

    max_val = attrs.get("max_dB")
    if max_val is None or relative:
        max_val = spectrogram.max()

    array_range = max_val - min_val

    if array_range == 0:
        # If all values are the same, return zeros.
        return spectrogram * 0

    return (spectrogram - min_val) / array_range


def compute_spectrogram_from_samples(
    audio: xr.DataArray,
    window_size_samples: int,
    hop_size_samples: int,
    window_type: str = "hann",
    detrend: Union[str, Callable, Literal[False]] = False,
    padded: bool = True,
    boundary: Optional[Literal["zeros", "odd", "even", "constant"]] = "zeros",
    scale: Literal["amplitude", "power", "psd"] = "psd",
    sort_dims: Union[tuple[str, ...], bool] = DEFAULT_DIM_ORDER,
) -> xr.DataArray:
    """Compute the spectrogram of a signal using sample-based parameters.

    This function is optimized for Sonari's use case where window and hop sizes
    are already specified in samples, avoiding unnecessary time-to-sample conversions.

    This function calculates the short-time Fourier transform (STFT), which decomposes
    a signal into overlapping windows and computes the Fourier transform of each window.

    Parameters
    ----------
    audio: xr.DataArray
        The audio signal.
    window_size_samples: int
        The number of samples in each STFT window (nperseg).
    hop_size_samples: int
        The number of samples between consecutive STFT frames.
    window_type: str
        The type of window to use. Refer to scipy.signal.get_window for supported types.
    detrend: Union[str, Callable, Literal[False]]
        Specifies how to detrend each STFT window. Default is False (no detrending).
    padded: bool
        Indicates whether the input signal is zero-padded at the beginning and
        end before performing the STFT. Default is True.
    boundary: Optional[Literal["zeros", "odd", "even", "constant"]]
        Specifies the boundary extension mode for padding the signal. Default is "zeros".
    scale: Literal["amplitude", "power", "psd"]
        Specifies the scaling of the returned spectrogram values. Default is "psd".
        - "amplitude": Returns the magnitude of the STFT components.
        - "power": Returns the squared magnitude of the STFT components.
        - "psd": Returns the Power Spectral Density.
    sort_dims: Union[tuple[str, ...], bool]
        Controls the final dimension order of the output DataArray.
        If True, transpose to DEFAULT_DIM_ORDER. If False, no transpose.
        Default is DEFAULT_DIM_ORDER.

    Returns
    -------
    spectrogram : xr.DataArray
        The spectrogram of the audio signal. This is a three-dimensional
        xarray data array with the dimensions frequency, time, and channel.

    Notes
    -----
    This implementation is based on soundevent's compute_spectrogram but accepts
    parameters directly in samples to avoid redundant time conversions.
    """
    samplerate = 1 / get_dim_step(audio, Dimensions.time.value)
    time_axis: int = audio.get_axis_num(Dimensions.time.value)  # type: ignore

    # Calculate overlap from window and hop sizes
    noverlap = window_size_samples - hop_size_samples

    # Compute the spectrogram
    frequencies, times, spectrogram = signal.stft(
        audio.data,
        fs=samplerate,
        window=window_type,
        nperseg=window_size_samples,
        noverlap=noverlap,
        return_onesided=True,
        axis=time_axis,
        detrend=detrend,  # type: ignore
        padded=padded,
        boundary=boundary,  # type: ignore
        scaling="psd" if scale == "psd" else "spectrum",
    )

    original_units = audio.attrs.get(ArrayAttrs.units.value, "V")
    if scale == "psd":
        # Compute the power spectral density
        spectrogram = np.abs(spectrogram) ** 2
        long_name = "Power Spectral Density Spectrogram"
        units = f"{original_units}**2/Hz"
    elif scale == "amplitude":
        spectrogram = np.abs(spectrogram)
        long_name = "Amplitude Spectrogram"
        units = f"{original_units}"
    elif scale == "power":
        spectrogram = np.abs(spectrogram) ** 2
        long_name = "Power Spectrogram"
        units = f"{original_units}**2"
    else:
        raise ValueError(f"Invalid scale option {scale}. Choose one of: psd, amplitude, power")

    # Calculate hop size in seconds for metadata
    hop_size = hop_size_samples / samplerate
    window_size = window_size_samples / samplerate

    dims = (
        *[name if name != Dimensions.time.value else Dimensions.frequency.value for name in audio.dims],
        Dimensions.time.value,
    )

    array = xr.DataArray(
        data=spectrogram,
        dims=dims,
        coords={
            Dimensions.frequency.value: create_frequency_dim_from_array(
                frequencies,
                step=samplerate / window_size_samples,
            ),
            Dimensions.time.value: create_time_dim_from_array(
                times + audio.time.data[0],
                step=hop_size,
            ),
            Dimensions.channel.value: audio.channel,
        },
        attrs={
            **audio.attrs,
            "window_size": window_size,
            "hop_size": hop_size,
            "window_size_samples": window_size_samples,
            "hop_size_samples": hop_size_samples,
            "window_type": window_type,
            ArrayAttrs.units.value: units,
            ArrayAttrs.standard_name.value: "spectrogram",
            ArrayAttrs.long_name.value: long_name,
        },
    )

    if sort_dims:
        if not isinstance(sort_dims, tuple):
            sort_dims = DEFAULT_DIM_ORDER

        return array.transpose(..., *sort_dims, missing_dims="ignore")

    return array

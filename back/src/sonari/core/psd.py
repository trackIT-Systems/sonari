"""Functions for Power Spectral Density computation and visualization."""

from io import BytesIO

import numpy as np
from PIL import Image, ImageDraw

__all__ = [
    "psd_to_plot_image",
    "psd_image_to_buffer",
]

# Visual styling constants
BACKGROUND_COLOR = (41, 37, 36)  # stone-800
LINE_COLOR = (251, 191, 36)  # amber-400


def psd_to_plot_image(
    psd: np.ndarray,
    width: int = 455,
    height: int = 225,
    freq_min: float = 0,
    freq_max: float | None = None,
    samplerate: float | None = None,
) -> tuple[Image.Image, float, float]:
    """Render 1D PSD array as a line plot image using PIL.

    The image contains only the plot area with the curve and grid lines.
    Axis labels should be rendered by the frontend.

    Parameters
    ----------
    psd : np.ndarray
        1D array of PSD values (power at each frequency bin, in dB).
    width : int
        Width of the output image in pixels.
    height : int
        Height of the output image in pixels.
    freq_min : float
        Minimum frequency to display (Hz).
    freq_max : float | None
        Maximum frequency to display (Hz). If None, uses Nyquist.
    samplerate : float | None
        Sample rate of the original audio (Hz).

    Returns
    -------
    tuple[Image.Image, float, float]
        Tuple of (image, psd_min, psd_max) where psd_min and psd_max are
        the dB range of the displayed data for axis labeling.
    """
    # Calculate frequency axis
    num_bins = len(psd)
    if samplerate is not None:
        nyquist = samplerate / 2
        frequencies = np.linspace(0, nyquist, num_bins)
        if freq_max is None:
            freq_max = nyquist
    else:
        frequencies = np.arange(num_bins)
        if freq_max is None:
            freq_max = num_bins

    # Create image with dark background
    image = Image.new("RGB", (width, height), BACKGROUND_COLOR)
    draw = ImageDraw.Draw(image)

    # Filter PSD to frequency range
    if freq_min > 0 or (freq_max is not None and freq_max < frequencies[-1]):
        mask = (frequencies >= freq_min) & (frequencies <= freq_max)
        psd_filtered = psd[mask]
        freq_filtered = frequencies[mask]
    else:
        psd_filtered = psd
        freq_filtered = frequencies

    if len(psd_filtered) == 0:
        return image, 0.0, 0.0

    # Get PSD range for normalization and return values
    psd_min = float(psd_filtered.min())
    psd_max = float(psd_filtered.max())
    psd_range = psd_max - psd_min

    if psd_range == 0:
        psd_normalized = np.full_like(psd_filtered, 0.5)
    else:
        psd_normalized = (psd_filtered - psd_min) / psd_range

    # Convert PSD to pixel coordinates
    points = []
    for freq, value in zip(freq_filtered, psd_normalized, strict=True):
        # X: map frequency to image width
        x = int(((freq - freq_min) / (freq_max - freq_min)) * (width - 1))
        # Y: map normalized value to image height (inverted, 0 at bottom)
        y = int((1 - value) * (height - 1))
        points.append((x, y))

    # Draw the PSD line
    if len(points) > 1:
        draw.line(points, fill=LINE_COLOR, width=2)

    return image, psd_min, psd_max


def psd_image_to_buffer(image: Image.Image, fmt: str = "webp") -> tuple[BytesIO, int, str]:
    """Convert a PIL image to a BytesIO buffer.

    Parameters
    ----------
    image : Image.Image
        PIL Image to convert.
    fmt : str
        Image format (webp or jpeg).

    Returns
    -------
    tuple[BytesIO, int, str]
        Tuple of (buffer, buffer_size, format).
    """
    buffer = BytesIO()

    max_webp_size = (2**14) - 1
    if image.width > max_webp_size:
        fmt = "jpeg"
        if image.mode != "RGB":
            image = image.convert("RGB")
        image.save(buffer, format=fmt, quality=70, optimize=False)
    else:
        image.save(
            buffer,
            format=fmt,
            lossless=True,
            quality=0,
            method=0,
            exact=True,
            minimize_size=False,
        )

    buffer_size = buffer.tell()
    buffer.seek(0)
    return buffer, buffer_size, fmt

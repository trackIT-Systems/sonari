"""Functions to handle images."""

from io import BytesIO

import numpy as np
from matplotlib import colormaps
from matplotlib.colors import PowerNorm
from PIL import Image as img
from PIL.Image import Image

__all__ = [
    "array_to_image",
    "image_to_buffer",
]

max_webp_size: int = (2**14) - 1


def array_to_image(array: np.ndarray, cmap: str, gamma: float) -> Image:
    """Convert a numpy array to a PIL image.

    Parameters
    ----------
    array : np.ndarray
        The array to convert into an image. It must be a 2D array.
    cmap : str
        Name of the matplotlib colormap
    gamma : float
        Gamma of the image

    Returns
    -------
    Image
        A Pillow Image object.

    Notes
    -----
    The array values must be between 0 and 1.
    """
    if array.ndim != 2:
        raise ValueError("The array must be 2D.")

    # Get the colormap
    colormap = colormaps.get_cmap(cmap)

    # Flip the array vertically
    array = np.flipud(array)

    norm = PowerNorm(gamma=gamma)
    normalized_array = norm(array)
    color_array = colormap(normalized_array)

    return img.fromarray(np.uint8(color_array * 255))


def image_to_buffer(image: Image, fmt="webp") -> tuple[BytesIO, str]:
    """Convert a PIL image to a BytesIO buffer."""
    buffer = BytesIO()
    if image.width > max_webp_size:
        fmt = "jpeg"
        image = image.convert("RGB")
        image.save(buffer, format=fmt, quality=80)
    else:
        image.save(buffer, format=fmt, lossless=True, quality=0, method=0)
    buffer.seek(0)
    return buffer, fmt

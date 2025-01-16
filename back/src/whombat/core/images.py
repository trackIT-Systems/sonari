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

    # Cache the colormap outside the function if you're using the same one repeatedly
    colormap = colormaps.get_cmap(cmap)

    # Combine operations to reduce memory allocations
    # Use in-place operations where possible
    array = np.flipud(array)

    # Avoid PowerNorm class - implement gamma correction directly
    # This is much faster than using matplotlib's PowerNorm
    normalized_array = np.power(array, 1 / gamma, out=array)  # in-place operation

    # Apply colormap and convert to uint8 in one step
    color_array = colormap(normalized_array, bytes=True)

    return img.fromarray(color_array)


def image_to_buffer(image: Image, fmt="webp") -> tuple[BytesIO, str]:
    """Convert a PIL image to a BytesIO buffer."""
    # Preallocate a buffer with an estimated size to reduce resizing
    estimated_size = image.width * image.height * 4  # rough estimate for RGBA
    buffer = BytesIO(bytearray(estimated_size))

    if image.width > max_webp_size:
        fmt = "jpeg"
        # Only convert if not already RGB
        if image.mode != "RGB":
            image = image.convert("RGB")
        image.save(buffer, format=fmt, quality=70, optimize=False)
    else:
        # For webp, use fastest encoding method
        image.save(
            buffer,
            format=fmt,
            lossless=True,
            quality=0,
            method=0,
            exact=True,  # Skip alpha premultiplication
            minimize_size=False,  # Skip extra compression steps
        )

    buffer.seek(0)
    return buffer, fmt

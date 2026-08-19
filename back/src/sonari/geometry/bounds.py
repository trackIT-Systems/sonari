"""Clip sound event geometries to valid bounds."""

from soundevent import Geometry

__all__ = ["clip_geometry"]


def clip_geometry(
    geometry: Geometry,
    *,
    time_min: float,
    time_max: float,
    freq_min: float = 0.0,
    freq_max: float,
) -> Geometry | None:
    """Clip geometry to the given time and frequency bounds.

    Returns None if the clipped geometry would be degenerate (zero area/length).
    """
    if geometry.type == "BoundingBox":
        start, low, end, high = geometry.coordinates
        if low >= high:
            from soundevent import TimeInterval
            interval = TimeInterval(coordinates=[start, end])
            return clip_geometry(
                interval,
                time_min=time_min,
                time_max=time_max,
                freq_min=freq_min,
                freq_max=freq_max,
            )
        start = max(time_min, start)
        end = min(time_max, end)
        low = max(freq_min, low)
        high = min(freq_max, high)
        if start >= end or low >= high:
            return None
        return geometry.model_copy(update={"coordinates": [start, low, end, high]})

    if geometry.type == "TimeInterval":
        start, end = geometry.coordinates
        start = max(time_min, start)
        end = min(time_max, end)
        if start >= end:
            return None
        return geometry.model_copy(update={"coordinates": [start, end]})

    return geometry

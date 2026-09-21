"""Formatting and confidence helpers for ProBat CSV export."""

import datetime
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from sonari.models.sound_event_annotation import SoundEventAnnotation

BIRDEDGE_USERNAME = "birdedge"


def format_probat_datetime(
    date: datetime.date | None,
    time: datetime.time | None,
) -> str:
    """Format recording date and time as ``DD.MM.YYYY, HH:MM:SS``."""
    if date is None:
        return ""
    date_str = date.strftime("%d.%m.%Y")
    if time is None:
        return date_str
    return f"{date_str}, {time.strftime('%H:%M:%S')}"


def format_probat_number(value: float, decimals: int = 2) -> str:
    """Format a float with comma as decimal separator."""
    formatted = f"{value:.{decimals}f}"
    return formatted.replace(".", ",")


def format_probat_count(count: int) -> str:
    """Format call count with one decimal place (e.g. ``3,0``)."""
    return format_probat_number(float(count), decimals=1)


def format_task_notes(notes) -> str:
    """Format annotation task notes like MultiBase (pipe-separated)."""
    if not notes:
        return ""
    parts = []
    for note in notes:
        parts.append(f" {note.message} ")
    return "|" + "|".join(parts) + "|" if parts else ""


def _max_feature_value(annotation: "SoundEventAnnotation", prefix: str) -> float | None:
    best: float | None = None
    for feature in annotation.features:
        if feature.name.startswith(prefix):
            if best is None or feature.value > best:
                best = feature.value
    return best


def max_confidence_for_species(
    annotation: "SoundEventAnnotation",
    species_tag_value: str,
) -> float | None:
    """Max confidence for an event, using species vs detection per tag creator (birdedge)."""
    matching_tags = [tag for tag in annotation.tags if tag.value == species_tag_value]
    if not matching_tags:
        return None

    use_species_confidence = any(
        tag.created_by is not None and tag.created_by.username == BIRDEDGE_USERNAME for tag in matching_tags
    )
    prefix = "species_confidence" if use_species_confidence else "detection_confidence"
    return _max_feature_value(annotation, prefix)

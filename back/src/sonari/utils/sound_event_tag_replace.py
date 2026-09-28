"""Shared logic for sound-event tag replace (annotate UI and bulk API)."""

from typing import Sequence

from sonari import schemas

__all__ = [
    "is_replace_all_tag",
    "sound_event_annotations_for_tag_replace",
]


def is_replace_all_tag(tag: schemas.TagCreate | schemas.Tag | None) -> bool:
    """True when old tag is the annotate UI sentinel for all tags."""
    return tag is not None and tag.key == "all" and tag.value == "tags"


def sound_event_annotations_for_tag_replace(
    sound_event_annotations: Sequence[schemas.SoundEventAnnotation],
    *,
    old_tag: schemas.TagCreate | schemas.Tag | None,
    replace_all: bool,
) -> list[schemas.SoundEventAnnotation]:
    """Return sound event annotations that should be updated for a bulk/single replace."""
    replace_all = replace_all or is_replace_all_tag(old_tag)

    if replace_all:
        return [
            sea
            for sea in sound_event_annotations
            if sea.tags and len(sea.tags) > 0
        ]

    if old_tag is not None:
        return [
            sea
            for sea in sound_event_annotations
            if any(
                t.key == old_tag.key and t.value == old_tag.value for t in (sea.tags or [])
            )
        ]

    return list(sound_event_annotations)

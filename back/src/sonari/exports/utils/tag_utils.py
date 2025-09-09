"""Tag processing utilities for exports."""


def find_matching_tags(event_tags: set[str], selected_tags: list[str]) -> list[str]:
    """Find which selected tags match the event tags."""
    return [tag for tag in selected_tags if tag in event_tags]


def extract_tag_set(annotation_tags) -> set[str]:
    """Extract tag set from annotation tags."""
    return {f"{tag.key}:{tag.value}" for tag in annotation_tags}

"""Tag processing utilities for exports."""


def extract_tag_values_from_selected(selected_tags: list[str]) -> list[str]:
    """Extract tag values from selected tags that may be in 'key:value' format.

    Args
    ----
        selected_tags: List of tags in "key:value" format from frontend

    Returns
    -------
        List of tag values (just the value part)
    """
    tag_values = []
    for selected_tag in selected_tags:
        if ":" in selected_tag:
            tag_value = selected_tag.split(":", 1)[1]  # Split only on first ":"
        else:
            tag_value = selected_tag  # Handle case where no ":" exists
        tag_values.append(tag_value)
    return tag_values


def find_matching_tags(event_tags: set[str], selected_tags: list[str]) -> list[str]:
    """Find which selected tags match the event tags.

    Args
    ----
        event_tags: Set of tag values (just the value part)
        selected_tags: List of tags in "key:value" format from frontend

    Returns
    -------
        List of matching tag values (just the value part)
    """
    selected_tag_values = extract_tag_values_from_selected(selected_tags)
    return [tag_value for tag_value in selected_tag_values if tag_value in event_tags]


def find_matching_tag_values_on_annotation(annotation_tags, selected_tags: list[str] | None) -> list[str]:
    """Match selected export tags against tags on a sound event annotation.

    When ``selected_tags`` is empty or None, returns all tag values on the annotation.
    Otherwise matches on ``key:value`` or on value alone (legacy behaviour).
    """
    if not selected_tags:
        return [tag.value for tag in annotation_tags]

    selected_set = set(selected_tags)
    selected_values = set(extract_tag_values_from_selected(selected_tags))
    matched: list[str] = []
    seen: set[str] = set()
    for tag in annotation_tags:
        full = f"{tag.key}:{tag.value}"
        if full in selected_set or tag.value in selected_values:
            if tag.value not in seen:
                matched.append(tag.value)
                seen.add(tag.value)
    return matched


def extract_tag_set(annotation_tags) -> set[str]:
    """Extract tag set from annotation tags."""
    return {tag.value for tag in annotation_tags}

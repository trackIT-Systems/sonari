"""Filters for tags."""

from sqlalchemy import Select

from sonari import models
from sonari.filters import base

__all__ = [
    "KeyFilter",
    "ValueFilter",
    "SearchFilter",
    "AnnotationProjectFilter",
    "TagFilter",
]


KeyFilter = base.string_filter(models.Tag.key)
"""Filter tags by key."""

ValueFilter = base.string_filter(models.Tag.value)
"""Filter tags by value."""

SearchFilter = base.search_filter([models.Tag.key, models.Tag.value])
"""Search tags by key or value."""


class AnnotationProjectFilter(base.Filter):
    """Get tags for an annotation project."""

    eq: int | None = None

    def filter(self, query: Select) -> Select:
        """Filter tags by project."""
        if self.eq is None:
            return query

        return (
            query.join(
                models.AnnotationProjectTag,
                models.AnnotationProjectTag.tag_id == models.Tag.id,
            )
            .join(
                models.AnnotationProject,
                models.AnnotationProject.id == models.AnnotationProjectTag.annotation_project_id,
            )
            .where(models.AnnotationProject.id == self.eq)
        )


class RecordingFilter(base.Filter):
    """Get tags for a recording."""

    eq: int | None = None

    def filter(self, query: Select) -> Select:
        """Filter tags by recording."""
        if self.eq is None:
            return query

        return (
            query.join(
                models.RecordingTag,
                models.RecordingTag.tag_id == models.Tag.id,
            )
            .join(
                models.Recording,
                models.Recording.id == models.RecordingTag.recording_id,
            )
            .where(models.Recording.id == self.eq)
        )


class SoundEventAnnotationFilter(base.Filter):
    """Get tags for a sound event annotation."""

    eq: int | None = None

    def filter(self, query: Select) -> Select:
        """Filter tags by sound event annotation."""
        if self.eq is None:
            return query

        return (
            query.join(
                models.SoundEventAnnotationTag,
                models.SoundEventAnnotationTag.tag_id == models.Tag.id,
            )
            .join(
                models.SoundEventAnnotation,
                models.SoundEventAnnotation.id == models.SoundEventAnnotationTag.sound_event_annotation_id,
            )
            .where(models.SoundEventAnnotation.id == self.eq)
        )


class AnnotationTaskFilter(base.Filter):
    """Get tags for an annotation task."""

    eq: int | None = None

    def filter(self, query: Select) -> Select:
        """Filter tags by annotation task."""
        if self.eq is None:
            return query

        return (
            query.join(
                models.AnnotationTaskTag,
                models.AnnotationTaskTag.tag_id == models.Tag.id,
            )
            .join(
                models.AnnotationTask,
                models.AnnotationTask.id == models.AnnotationTaskTag.annotation_task_id,
            )
            .where(models.AnnotationTask.id == self.eq)
        )


TagFilter = base.combine(
    SearchFilter,
    key=KeyFilter,
    value=ValueFilter,
    annotation_project=AnnotationProjectFilter,
    recording=RecordingFilter,
    sound_event_annotation=SoundEventAnnotationFilter,
    annotation_task=AnnotationTaskFilter,
)

"""Filters for Annotations."""

from sqlalchemy import Select, select, tuple_

from sonari import models
from sonari.filters import base

__all__ = [
    "AnnotationTaskFilter",
    "CreatedByFilter",
    "CreatedOnFilter",
    "ProjectFilter",
    "RecordingFilter",
    "SoundEventAnnotationFilter",
    "SoundEventFilter",
    "TagFilter",
]

CreatedOnFilter = base.date_filter(
    models.SoundEventAnnotation.created_on,
)


class AnnotationTaskFilter(base.Filter):
    """Filter for annotations by annotation task."""

    eq: int | None = None

    def filter(self, query: Select) -> Select:
        """Filter the query."""
        if not self.eq:
            return query

        return query.join(
            models.AnnotationTask,
            models.AnnotationTask.id == models.SoundEventAnnotation.annotation_task_id,
        ).where(
            models.AnnotationTask.id == self.eq,
        )


class SoundEventFilter(base.Filter):
    """Filter for annotations by annotation ID (sound events are now part of annotations)."""

    eq: int | None = None

    def filter(self, query: Select) -> Select:
        """Filter the query."""
        if not self.eq:
            return query

        # Since sound events are now merged into annotations, filter by annotation ID
        return query.where(models.SoundEventAnnotation.id == self.eq)


CreatedByFilter = base.uuid_filter(
    models.SoundEventAnnotation.created_by_id,
)


class ProjectFilter(base.Filter):
    """Filter for annotations by project."""

    eq: int | None = None

    def filter(self, query: Select) -> Select:
        """Filter the query."""
        if not self.eq:
            return query

        return (
            query.join(
                models.AnnotationTask,
                models.AnnotationTask.id == models.SoundEventAnnotation.annotation_task_id,
            )
            .join(
                models.AnnotationProject,
                models.AnnotationProject.id == models.AnnotationTask.annotation_project_id,
            )
            .filter(models.AnnotationProject.id == self.eq)
        )


class RecordingFilter(base.Filter):
    """Filter for annotations by recording."""

    eq: int | None = None

    def filter(self, query: Select) -> Select:
        """Filter the query."""
        if not self.eq:
            return query

        return (
            query.join(
                models.AnnotationTask,
                models.AnnotationTask.id == models.SoundEventAnnotation.annotation_task_id,
            )
            .join(
                models.Recording,
                models.Recording.id == models.AnnotationTask.recording_id,
            )
            .where(models.Recording.id == self.eq)
        )


class TagFilter(base.Filter):
    """Filter for annotations by tag."""

    key: str | None = None
    value: str | None = None

    def filter(self, query: Select) -> Select:
        """Filter the query."""
        if self.key is None and self.value is None:
            return query

        subquery = (
            select(models.SoundEventAnnotation.id)
            .join(
                models.SoundEventAnnotationTag,
                models.SoundEventAnnotationTag.sound_event_annotation_id == models.SoundEventAnnotation.id,
            )
            .join(
                models.Tag,
                models.Tag.id == models.SoundEventAnnotationTag.tag_id,
            )
        )

        if self.key is None:
            subquery = subquery.where(models.Tag.value == self.value)
        elif self.value is None:
            subquery = subquery.where(models.Tag.key == self.key)
        else:
            subquery = subquery.where(tuple_(models.Tag.key, models.Tag.value) == (self.key, self.value))

        subquery = subquery.distinct(models.SoundEventAnnotation.id)
        return query.where(models.SoundEventAnnotation.id.in_(subquery))


SoundEventAnnotationFilter = base.combine(
    project=ProjectFilter,
    recording=RecordingFilter,
    sound_event=SoundEventFilter,
    created_by=CreatedByFilter,
    task=AnnotationTaskFilter,
    tag=TagFilter,
    created_on=CreatedOnFilter,
)

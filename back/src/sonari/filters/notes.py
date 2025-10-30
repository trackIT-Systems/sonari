"""Filters for Notes."""

from sqlalchemy import Select

from sonari import models
from sonari.filters import base

__all__ = [
    "MessageFilter",
    "CreatedByFilter",
    "CreatedAtFilter",
    "IssueFilter",
    "NoteFilter",
]


MessageFilter = base.string_filter(models.Note.message)
"""Filter note by message content."""

CreatedByFilter = base.uuid_filter(models.Note.created_by_id)
"""Filter notes by the user who created them."""

CreatedAtFilter = base.date_filter(models.Note.created_on)

IssueFilter = base.boolean_filter(models.Note.is_issue)
"""Filter notes by whether they are issues or not."""


class AnnotationProjectFilter(base.Filter):
    """Get notes created within a specific annotation project."""

    eq: int | None = None

    def filter(self, query: Select) -> Select:
        """Filter the query."""
        if not self.eq:
            return query

        return (
            query.join(
                models.AnnotationTask,
                models.AnnotationTask.id == models.Note.annotation_task_id,
            )
            .join(
                models.AnnotationProject,
                models.AnnotationProject.id == models.AnnotationTask.annotation_project_id,
            )
            .where(
                models.AnnotationProject.id == self.eq,
            )
        )


class RecordingFilter(base.Filter):
    """Get notes created within a specific recording."""

    eq: int | None = None

    def filter(self, query: Select) -> Select:
        """Filter the query."""
        if not self.eq:
            return query

        return (
            query.join(
                models.AnnotationTask,
                models.AnnotationTask.id == models.Note.annotation_task_id,
            )
            .join(
                models.Recording,
                models.Recording.id == models.AnnotationTask.recording_id,
            )
            .where(
                models.Recording.id == self.eq,
            )
        )


class SoundEventAnnotationFilter(base.Filter):
    """Get notes for annotation tasks containing a specific sound event annotation."""

    eq: int | None = None

    def filter(self, query: Select) -> Select:
        """Filter the query."""
        if not self.eq:
            return query

        return (
            query.join(
                models.AnnotationTask,
                models.AnnotationTask.id == models.Note.annotation_task_id,
            )
            .join(
                models.SoundEventAnnotation,
                models.SoundEventAnnotation.annotation_task_id == models.AnnotationTask.id,
            )
            .where(
                models.SoundEventAnnotation.id == self.eq,
            )
        )


class AnnotationTaskFilter(base.Filter):
    """Get notes created within a specific annotation task."""

    eq: int | None = None

    def filter(self, query: Select) -> Select:
        """Filter the query."""
        if not self.eq:
            return query

        return query.join(
            models.AnnotationTask,
            models.AnnotationTask.id == models.Note.annotation_task_id,
        ).where(
            models.AnnotationTask.id == self.eq,
        )


class DatasetFilter(base.Filter):
    """Get notes of annotation tasks within a specific dataset."""

    eq: int | None = None

    def filter(self, query: Select) -> Select:
        """Apply the filter.

        Will filter the query to only include notes of annotation tasks
        whose recordings are within the specified dataset.
        """
        if self.eq is None:
            return query

        return (
            query.join(
                models.AnnotationTask,
                models.AnnotationTask.id == models.Note.annotation_task_id,
            )
            .join(
                models.Recording,
                models.Recording.id == models.AnnotationTask.recording_id,
            )
            .join(
                models.DatasetRecording,
                models.DatasetRecording.recording_id == models.Recording.id,
            )
            .join(
                models.Dataset,
                models.Dataset.id == models.DatasetRecording.dataset_id,
            )
            .where(models.Dataset.id == self.eq)
        )


NoteFilter = base.combine(
    message=MessageFilter,
    created_by=CreatedByFilter,
    created_on=CreatedAtFilter,
    is_issue=IssueFilter,
    annotation_project=AnnotationProjectFilter,
    recording=RecordingFilter,
    sound_event_annotation=SoundEventAnnotationFilter,
    annotation_task=AnnotationTaskFilter,
    dataset=DatasetFilter,
)

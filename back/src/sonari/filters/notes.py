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


NoteFilter = base.combine(
    message=MessageFilter,
    created_by=CreatedByFilter,
    created_on=CreatedAtFilter,
    is_issue=IssueFilter,
    annotation_task=AnnotationTaskFilter,
)

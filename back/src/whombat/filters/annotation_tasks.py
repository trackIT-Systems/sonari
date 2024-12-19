"""Filters for Annotation Tasks."""

from datetime import datetime, time
from uuid import UUID

from soundevent import data
from sqlalchemy import Select, and_, exists, func, not_, select

from whombat import models
from whombat.api.users import detector_users
from whombat.filters import base

__all__ = [
    "AnnotationProjectFilter",
    "DatasetFilter",
    "AnnotationTaskFilter",
    "SearchRecordingsFilter",
]


class RecordingTagFilter(base.Filter):
    """Filter for tasks by recording tag."""

    key: str | None = None
    value: str | None = None

    def filter(self, query: Select) -> Select:
        """Filter the query."""
        if self.key is None and self.value is None:
            return query

        # Should use aliases to avoid ambiguity
        Recording = models.Recording.__table__.alias("recording_tag_recording")
        Clip = models.Clip.__table__.alias("recording_tag_clip")

        query = (
            query.join(
                Clip,
                Clip.c.id == models.AnnotationTask.clip_id,
            )
            .join(
                Recording,
                Recording.c.id == Clip.c.recording_id,
            )
            .join(
                models.RecordingTag,
                models.RecordingTag.recording_id == Recording.c.id,
            )
            .join(
                models.Tag,
                models.Tag.id == models.RecordingTag.tag_id,
            )
        )

        if self.key is None:
            return query.where(
                models.Tag.value == self.value,
            )

        if self.value is None:
            return query.where(
                models.Tag.key == self.key,
            )

        return query.where(
            models.Tag.key == self.key,
            models.Tag.value == self.value,
        )


class PendingFilter(base.Filter):
    """Filter for annotation tasks if pending."""

    eq: bool | None = None

    def filter(self, query: Select) -> Select:
        """Filter the query."""
        if self.eq is None:
            return query

        return query.where(
            not_(
                models.AnnotationTask.status_badges.any(
                    and_(
                        models.AnnotationStatusBadge.state.in_(
                            [
                                data.AnnotationState.completed,
                                data.AnnotationState.rejected,
                                data.AnnotationState.verified,
                            ]
                        ),
                        not_(models.AnnotationStatusBadge.user.has(models.User.username.in_(detector_users))),
                    )
                )
            )
            == self.eq
        )


class IsVerifiedFilter(base.Filter):
    """Filter for tasks if verified."""

    eq: bool | None = None

    def filter(self, query: Select) -> Select:
        """Filter the query."""
        if self.eq is None:
            return query

        return query.where(
            models.AnnotationTask.status_badges.any(
                models.AnnotationStatusBadge.state == data.AnnotationState.verified,
            )
            == self.eq,
        )


class IsRejectedFilter(base.Filter):
    """Filter for tasks if rejected."""

    eq: bool | None = None

    def filter(self, query: Select) -> Select:
        """Filter the query."""
        if self.eq is None:
            return query

        return query.where(
            models.AnnotationTask.status_badges.any(
                models.AnnotationStatusBadge.state == data.AnnotationState.rejected,
            )
            == self.eq,
        )


class IsCompletedFilter(base.Filter):
    """Filter for tasks if rejected."""

    eq: bool | None = None

    def filter(self, query: Select) -> Select:
        """Filter the query."""
        if self.eq is None:
            return query

        return query.where(
            models.AnnotationTask.status_badges.any(
                models.AnnotationStatusBadge.state == data.AnnotationState.completed,
            )
            == self.eq,
        )


class IsAssignedFilter(base.Filter):
    """Filter for tasks if assigned."""

    eq: bool | None = None

    def filter(self, query: Select) -> Select:
        """Filter the query."""
        if self.eq is None:
            return query

        return query.where(
            models.AnnotationTask.status_badges.any(
                models.AnnotationStatusBadge.state == data.AnnotationState.assigned,
            )
            == self.eq,
        )


class AssignedToFilter(base.Filter):
    """Filter for tasks by assigned user."""

    eq: UUID | None = None

    def filter(self, query: Select) -> Select:
        """Filter the query."""
        if self.eq is None:
            return query

        return query.join(
            models.AnnotationStatusBadge,
        ).where(
            models.AnnotationStatusBadge.state == data.AnnotationState.assigned,
            models.AnnotationStatusBadge.user_id == self.eq,
        )


class AnnotationProjectFilter(base.Filter):
    """Filter for tasks by project."""

    eq: UUID | None = None

    def filter(self, query: Select) -> Select:
        """Filter the query."""
        if self.eq is None:
            return query

        return query.join(
            models.AnnotationProject,
            models.AnnotationProject.id == models.AnnotationTask.annotation_project_id,
        ).where(
            models.AnnotationProject.uuid == self.eq,
        )


class DatasetFilter(base.Filter):
    """Filter for tasks by dataset."""

    eq: UUID | None = None

    def filter(self, query: Select) -> Select:
        if not self.eq:
            return query

        # Should use aliases
        Recording = models.Recording.__table__.alias("dataset_recording")
        Clip = models.Clip.__table__.alias("dataset_clip")

        return (
            query.join(
                Clip,
                Clip.c.id == models.AnnotationTask.clip_id,
            )
            .join(
                Recording,
                Recording.c.id == Clip.c.recording_id,
            )
            .join(
                models.DatasetRecording,
                models.DatasetRecording.recording_id == Recording.c.id,
            )
            .join(
                models.Dataset,
                models.Dataset.id == models.DatasetRecording.dataset_id,
            )
            .where(models.Dataset.uuid == self.eq)
        )


class SearchRecordingsFilter(base.Filter):
    """Filter recordings by the dataset they are in."""

    search_recordings: str | None = None

    def filter(self, query: Select) -> Select:
        """Filter the query."""
        if not self.search_recordings:
            return query

        # Use specific aliases for both Recording and Clip tables
        Recording = models.Recording.__table__.alias("search_recording")
        Clip = models.Clip.__table__.alias("search_clip")

        query = (
            query.join(
                models.ClipAnnotation,
                models.AnnotationTask.clip_annotation_id == models.ClipAnnotation.id,
            )
            .join(
                Clip,
                models.ClipAnnotation.clip_id == Clip.c.id,
            )
            .join(
                Recording,
                Recording.c.id == Clip.c.recording_id,
            )
        )

        term = f"%{self.search_recordings}%"
        return query.where(Recording.c.path.ilike(term))


class SoundEventAnnotationTagFilter(base.Filter):
    """Filter for tasks by sound event annotation tag."""

    key: str | None = None
    value: str | None = None

    def filter(self, query: Select) -> Select:
        """Filter the query."""
        if self.key is None or self.value is None:
            return query

        subquery = (
            select(models.SoundEventAnnotationTag.sound_event_annotation_id)
            .join(models.Tag, models.Tag.id == models.SoundEventAnnotationTag.tag_id)
            .where(
                models.Tag.key == self.key,
                models.Tag.value == self.value,
            )
        )

        return query.where(
            exists(
                select(1).where(
                    models.SoundEventAnnotation.clip_annotation_id == models.AnnotationTask.clip_annotation_id,
                    models.SoundEventAnnotation.id.in_(subquery),
                )
            )
        )


class DateRangeFilter(base.Filter):
    """Filter for tasks by date range."""

    start_date: str | None = None
    end_date: str | None = None
    start_time: str | None = None
    end_time: str | None = None

    def filter(self, query: Select) -> Select:
        if self.start_date is None and self.end_date is None and self.start_time is None and self.end_time is None:
            return query

        # Should use aliases
        Recording = models.Recording.__table__.alias("date_range_recording")
        Clip = models.Clip.__table__.alias("date_range_clip")

        query = (
            query.join(
                models.ClipAnnotation,
                models.AnnotationTask.clip_annotation_id == models.ClipAnnotation.id,
            )
            .join(
                Clip,
                models.ClipAnnotation.clip_id == Clip.c.id,
            )
            .join(
                Recording,
                Recording.c.id == Clip.c.recording_id,
            )
        )

        conditions = []
        start_date = None
        end_date = None

        # Update conditions to use aliased tables
        if self.start_date:
            start_date = datetime.strptime(self.start_date[:-1], "%Y-%m-%dT%H:%M:%S.%f").date()
            conditions.append(Recording.c.date >= start_date)
        if self.end_date:
            end_date = datetime.strptime(self.end_date[:-1], "%Y-%m-%dT%H:%M:%S.%f").date()
            conditions.append(Recording.c.date <= end_date)

        if self.start_time or self.end_time:
            start_time = (
                datetime.strptime(self.start_time[:-1], "%Y-%m-%dT%H:%M:%S.%f").time() if self.start_time else time.min
            )
            end_time = (
                datetime.strptime(self.end_time[:-1], "%Y-%m-%dT%H:%M:%S.%f").time() if self.end_time else time.max
            )

            virtual_datetime = func.datetime(Recording.c.date, Recording.c.time)

            if start_date and self.start_time:
                start_datetime = datetime.combine(start_date, start_time)
                conditions.append(virtual_datetime >= start_datetime)
            elif self.start_time:
                conditions.append(Recording.c.time >= start_time)

            if end_date and self.end_time:
                end_datetime = datetime.combine(end_date, end_time)
                conditions.append(virtual_datetime <= end_datetime)
            elif self.end_time:
                conditions.append(Recording.c.time <= end_time)

        return query.where(and_(*conditions))


class NightFilter(base.Filter):
    """Filter for tasks by night time recordings."""

    eq: bool | None = None
    tz: str | None = None  # Using a dict to hold location info

    def filter(self, query: Select) -> Select:
        """Filter the query."""
        return query


class DayFilter(base.Filter):
    """Filter for tasks by night time recordings."""

    eq: bool | None = None
    tz: str | None = None  # Using a dict to hold location info

    def filter(self, query: Select) -> Select:
        """Filter the query."""
        return query


AnnotationTaskFilter = base.combine(
    SearchRecordingsFilter,
    assigned_to=AssignedToFilter,
    pending=PendingFilter,
    verified=IsVerifiedFilter,
    rejected=IsRejectedFilter,
    completed=IsCompletedFilter,
    assigned=IsAssignedFilter,
    annotation_project=AnnotationProjectFilter,
    dataset=DatasetFilter,
    recording_tag=RecordingTagFilter,
    sound_event_annotation_tag=SoundEventAnnotationTagFilter,
    date=DateRangeFilter,
    night=NightFilter,
    day=DayFilter,
)

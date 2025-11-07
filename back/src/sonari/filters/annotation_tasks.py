"""Filters for Annotation Tasks."""

from datetime import datetime, time

from soundevent import data
from sqlalchemy import Select, and_, exists, func, not_, or_, select

from sonari import models
from sonari.filters import base

__all__ = [
    "AnnotationProjectFilter",
    "StationFilter",
    "AnnotationTaskFilter",
    "SearchRecordingsFilter",
]


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
                        models.AnnotationStatusBadge.state.in_([
                            data.AnnotationState.completed,
                            data.AnnotationState.rejected,
                            data.AnnotationState.verified,
                        ]),
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

    eq: int | None = None

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

    eq: int | None = None

    def filter(self, query: Select) -> Select:
        """Filter the query."""
        if self.eq is None:
            return query

        return query.where(
            models.AnnotationTask.annotation_project_id == self.eq,
        )


class StationFilter(base.Filter):
    """Filter for tasks by stations, which is the external name for datasets."""

    lst: str | None = None

    def filter(self, query: Select) -> Select:
        if not self.lst:
            return query

        ids: list[str] = self.lst.split(",")

        Recording = models.Recording.__table__.alias("dataset_recording")

        return (
            query.join(
                Recording,
                Recording.c.id == models.AnnotationTask.recording_id,
            )
            .join(
                models.DatasetRecording,
                models.DatasetRecording.recording_id == Recording.c.id,
            )
            .join(
                models.Dataset,
                models.Dataset.id == models.DatasetRecording.dataset_id,
            )
            .where(models.Dataset.id.in_(ids))
        )


class SearchRecordingsFilter(base.Filter):
    """Filter recordings by the dataset they are in."""

    search_recordings: str | None = None

    def filter(self, query: Select) -> Select:
        """Filter the query."""
        if not self.search_recordings:
            return query

        # Use specific alias for Recording table
        Recording = models.Recording.__table__.alias("search_recording")

        query = query.join(
            Recording,
            Recording.c.id == models.AnnotationTask.recording_id,
        )

        term = f"%{self.search_recordings}%"
        return query.where(Recording.c.path.ilike(term))


class SoundEventAnnotationTagFilter(base.Filter):
    """Filter for tasks by sound event annotation tag or recording tag."""

    keys: str | None = None
    values: str | None = None

    def filter(self, query: Select) -> Select:
        """Filter the query."""
        if self.keys is None or self.values is None:
            return query

        # Split the comma-separated strings into lists
        keys = self.keys.split(",")
        values = self.values.split(",")

        # Create alias for Recording table
        Recording = models.Recording.__table__.alias("sound_event_tag_recording")

        # Create subqueries for each key-value pair for sound event annotations
        sound_event_subqueries = []
        recording_subqueries = []

        for k, v in zip(keys, values, strict=True):
            # Sound event annotation subquery
            sound_event_subquery = (
                select(models.SoundEventAnnotationTag.sound_event_annotation_id)
                .join(models.Tag, models.Tag.id == models.SoundEventAnnotationTag.tag_id)
                .where(
                    models.Tag.key == k,
                    models.Tag.value == v,
                )
            )
            sound_event_subqueries.append(sound_event_subquery)

            # Recording tag subquery
            recording_subquery = (
                select(1)
                .select_from(models.RecordingTag)
                .join(
                    models.Tag,
                    models.Tag.id == models.RecordingTag.tag_id,
                )
                .where(
                    models.Tag.key == k,
                    models.Tag.value == v,
                    models.RecordingTag.recording_id == Recording.c.id,
                )
            )
            recording_subqueries.append(recording_subquery)

        # Combine sound event conditions with OR
        sound_event_condition = or_(
            *(
                exists(
                    select(1).where(
                        models.SoundEventAnnotation.annotation_task_id == models.AnnotationTask.id,
                        models.SoundEventAnnotation.id.in_(subquery),
                    )
                )
                for subquery in sound_event_subqueries
            )
        )

        # Join the query with Recording table
        query = query.join(
            Recording,
            Recording.c.id == models.AnnotationTask.recording_id,
        )

        # Combine recording conditions with OR
        recording_condition = or_(*(exists(subquery) for subquery in recording_subqueries))

        # Return query with combined conditions using OR
        return query.where(or_(sound_event_condition, recording_condition))


class EmptyFilter(base.Filter):
    """Filter for annotation tasks with no sound event annotations."""

    eq: bool | None = None

    def filter(self, query: Select) -> Select:
        if self.eq is None:
            return query

        sound_event_count = (
            select(
                models.SoundEventAnnotation.annotation_task_id,
                func.count(models.SoundEventAnnotation.id).label("count"),
            )
            .group_by(models.SoundEventAnnotation.annotation_task_id)
            .subquery()
        )

        # Join with our query
        query = query.outerjoin(
            sound_event_count,
            models.AnnotationTask.id == sound_event_count.c.annotation_task_id,
        )

        # Filter based on eq parameter
        if self.eq:
            # When eq=True, return tasks where count is NULL or 0
            return query.where(or_(sound_event_count.c.count.is_(None), sound_event_count.c.count == 0))
        else:
            # When eq=False, return tasks where count is greater than 0
            return query.where(sound_event_count.c.count > 0)


class DateRangeFilter(base.Filter):
    """Filter for tasks by date range."""

    start_dates: str | None = None
    end_dates: str | None = None
    start_times: str | None = None
    end_times: str | None = None

    def _parse_datetime(self, dt_str: str | None) -> datetime | None:
        """Parse datetime string in ISO format."""
        if not dt_str:
            return None
        try:
            return datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
        except ValueError:
            return None

    def filter(self, query: Select) -> Select:
        if not any([self.start_dates, self.end_dates, self.start_times, self.end_times]):
            return query

        # Use alias for Recording table
        Recording = models.Recording.__table__.alias("date_range_recording")

        query = query.join(
            Recording,
            Recording.c.id == models.AnnotationTask.recording_id,
        )

        # Split the comma-separated strings into lists
        start_dates = self.start_dates.split(",") if self.start_dates else []
        end_dates = self.end_dates.split(",") if self.end_dates else []
        start_times = self.start_times.split(",") if self.start_times else []
        end_times = self.end_times.split(",") if self.end_times else []

        # Create conditions for each date range
        range_conditions = []
        for i in range(max(len(start_dates), len(end_dates), len(start_times), len(end_times))):
            conditions = []

            if i < len(start_dates) and start_dates[i]:
                start_dt = self._parse_datetime(start_dates[i])
                if start_dt:
                    conditions.append(Recording.c.date >= start_dt.date())

            if i < len(end_dates) and end_dates[i]:
                end_dt = self._parse_datetime(end_dates[i])
                if end_dt:
                    conditions.append(Recording.c.date <= end_dt.date())

            if (i < len(start_times) and start_times[i]) or (i < len(end_times) and end_times[i]):
                start_dt = self._parse_datetime(start_times[i]) if i < len(start_times) and start_times[i] else None
                end_dt = self._parse_datetime(end_times[i]) if i < len(end_times) and end_times[i] else None

                start_time = start_dt.time() if start_dt else time.min
                end_time = end_dt.time() if end_dt else time.max

                virtual_datetime = func.datetime(Recording.c.date, Recording.c.time)

                if i < len(start_dates) and start_dates[i] and start_dt:
                    start_date_dt = self._parse_datetime(start_dates[i])
                    if start_date_dt:
                        start_datetime = datetime.combine(start_date_dt.date(), start_time)
                        conditions.append(virtual_datetime >= start_datetime)
                elif start_dt:
                    conditions.append(Recording.c.time >= start_time)

                if i < len(end_dates) and end_dates[i] and end_dt:
                    end_date_dt = self._parse_datetime(end_dates[i])
                    if end_date_dt:
                        end_datetime = datetime.combine(end_date_dt.date(), end_time)
                        conditions.append(virtual_datetime <= end_datetime)
                elif end_dt:
                    conditions.append(Recording.c.time <= end_time)

            if conditions:
                range_conditions.append(and_(*conditions))

        return query.where(or_(*range_conditions)) if range_conditions else query


class NightFilter(base.Filter):
    """Filter for tasks by night time recordings."""

    eq: bool | None = None
    tz: str | None = None

    def filter(self, query: Select) -> Select:
        """Filter the query."""
        return query


class DayFilter(base.Filter):
    """Filter for tasks by day time recordings."""

    eq: bool | None = None
    tz: str | None = None

    def filter(self, query: Select) -> Select:
        """Filter the query."""
        return query


class SampleFilter(base.Filter):
    """Subsample tasks."""

    eq: float | None = None

    def filter(self, query: Select) -> Select:
        """Filter the query."""
        return query


class DetectionConfidenceFilter(base.Filter):
    """Filter by detection confidence.

    This filter returns all tasks where all sound event annotations that have the feature
    "detection_confidence" have values that are greater or lower than the values given.
    """

    gt: float | None = None
    lt: float | None = None

    def filter(self, query: Select) -> Select:
        """Filter the query."""
        if self.gt is None and self.lt is None:
            return query

        # Create alias for Recording table
        Recording = models.Recording.__table__.alias("detection_confidence_recording")

        # Create subquery to find sound event annotations with detection confidence that match conditions
        subquery = (
            select(1)
            .select_from(models.SoundEventAnnotation)
            .join(
                models.SoundEventAnnotationFeature,
                models.SoundEventAnnotation.id == models.SoundEventAnnotationFeature.sound_event_annotation_id,
            )
            .where(
                models.SoundEventAnnotationFeature.name == "detection_confidence",
                models.SoundEventAnnotation.recording_id == Recording.c.id,
            )
        )

        # Add confidence value conditions - looking for matches
        if self.gt is not None:
            subquery = subquery.where(models.SoundEventAnnotationFeature.value > self.gt)
        if self.lt is not None:
            subquery = subquery.where(models.SoundEventAnnotationFeature.value < self.lt)

        # Join with main query and use exists to show only tasks with confidence data
        query = query.join(
            Recording,
            Recording.c.id == models.AnnotationTask.recording_id,
        ).where(exists(subquery))

        return query


class SpeciesConfidenceFilter(base.Filter):
    """Filter by species confidence.

    This filter returns all tasks where all sound event annotations that have the feature
    "species_confidence" have values that are greater or lower than the values given.
    """

    gt: float | None = None
    lt: float | None = None

    def filter(self, query: Select) -> Select:
        """Filter the query."""
        if self.gt is None and self.lt is None:
            return query

        # Create alias for Recording table
        Recording = models.Recording.__table__.alias("species_confidence_recording")

        # Create subquery to find sound event annotations with species confidence that match conditions
        subquery = (
            select(1)
            .select_from(models.SoundEventAnnotation)
            .join(
                models.SoundEventAnnotationFeature,
                models.SoundEventAnnotation.id == models.SoundEventAnnotationFeature.sound_event_annotation_id,
            )
            .where(
                models.SoundEventAnnotationFeature.name == "species_confidence",
                models.SoundEventAnnotation.recording_id == Recording.c.id,
            )
        )

        # Add confidence value conditions - looking for matches
        if self.gt is not None:
            subquery = subquery.where(models.SoundEventAnnotationFeature.value > self.gt)
        if self.lt is not None:
            subquery = subquery.where(models.SoundEventAnnotationFeature.value < self.lt)

        # Join with main query and use exists to show only tasks with confidence data
        query = query.join(
            Recording,
            Recording.c.id == models.AnnotationTask.recording_id,
        ).where(exists(subquery))

        return query


AnnotationTaskFilter = base.combine(
    SearchRecordingsFilter,
    assigned_to=AssignedToFilter,
    pending=PendingFilter,
    empty=EmptyFilter,
    verified=IsVerifiedFilter,
    rejected=IsRejectedFilter,
    completed=IsCompletedFilter,
    assigned=IsAssignedFilter,
    annotation_project=AnnotationProjectFilter,
    dataset=StationFilter,
    sound_event_annotation_tag=SoundEventAnnotationTagFilter,
    date=DateRangeFilter,
    night=NightFilter,
    day=DayFilter,
    sample=SampleFilter,
    detection_confidence=DetectionConfidenceFilter,
    species_confidence=SpeciesConfidenceFilter,
)

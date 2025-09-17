"""Filters for Annotation Tasks."""

from datetime import datetime, time
from uuid import UUID

from soundevent import data
from sqlalchemy import Select, and_, exists, func, not_, or_, select

from sonari import models
from sonari.filters import base

__all__ = [
    "AnnotationProjectFilter",
    "DatasetFilter",
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

    lst: str | None = None

    def filter(self, query: Select) -> Select:
        if not self.lst:
            return query

        uuids: list[str] = self.lst.split(",")

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
            .where(models.Dataset.uuid.in_(uuids))
        )


class SearchRecordingsFilter(base.Filter):
    """Filter recordings by the dataset they are in."""

    search_recordings: str | None = None

    def filter(self, query: Select) -> Select:
        """Filter the query."""
        if not self.search_recordings:
            return query

        # Use specific aliases for both Recording and Clip tables
        ClipAnnotation = models.ClipAnnotation.__table__.alias("search_clip_annotation")
        Recording = models.Recording.__table__.alias("search_recording")
        Clip = models.Clip.__table__.alias("search_clip")

        query = (
            query.join(
                ClipAnnotation,
                models.AnnotationTask.clip_annotation_id == ClipAnnotation.c.id,
            )
            .join(
                Clip,
                ClipAnnotation.c.clip_id == Clip.c.id,
            )
            .join(
                Recording,
                Recording.c.id == Clip.c.recording_id,
            )
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

        # Create aliases for needed tables
        ClipAnnotation = models.ClipAnnotation.__table__.alias("sound_event_tag_clip_annotation")
        Recording = models.Recording.__table__.alias("sound_event_tag_recording")
        Clip = models.Clip.__table__.alias("sound_event_tag_clip")

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
                        models.SoundEventAnnotation.clip_annotation_id == ClipAnnotation.c.id,
                        models.SoundEventAnnotation.id.in_(subquery),
                    )
                )
                for subquery in sound_event_subqueries
            )
        )

        # Join the query with Recording table
        query = (
            query.join(
                ClipAnnotation,
                models.AnnotationTask.clip_annotation_id == ClipAnnotation.c.id,
            )
            .join(
                Clip,
                ClipAnnotation.c.clip_id == Clip.c.id,
            )
            .join(
                Recording,
                Recording.c.id == Clip.c.recording_id,
            )
        )

        # Combine recording conditions with OR
        recording_condition = or_(*(exists(subquery) for subquery in recording_subqueries))

        # Return query with combined conditions using OR
        return query.where(or_(sound_event_condition, recording_condition))


class EmptyFilter(base.Filter):
    """Filter for annotation tasks with no sound events."""

    eq: bool | None = None

    def filter(self, query: Select) -> Select:
        if self.eq is None:
            return query

        sound_event_count = (
            select(
                models.SoundEventAnnotation.clip_annotation_id,
                func.count(models.SoundEventAnnotation.id).label("count"),
            )
            .group_by(models.SoundEventAnnotation.clip_annotation_id)
            .subquery()
        )

        # Join with our query
        query = query.outerjoin(
            sound_event_count,
            models.AnnotationTask.clip_annotation_id == sound_event_count.c.clip_annotation_id,
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

        # Should use aliases
        ClipAnnotation = models.ClipAnnotation.__table__.alias("date_range_clip_annotation")
        Recording = models.Recording.__table__.alias("date_range_recording")
        Clip = models.Clip.__table__.alias("date_range_clip")

        query = (
            query.join(
                ClipAnnotation,
                models.AnnotationTask.clip_annotation_id == ClipAnnotation.c.id,
            )
            .join(
                Clip,
                ClipAnnotation.c.clip_id == Clip.c.id,
            )
            .join(
                Recording,
                Recording.c.id == Clip.c.recording_id,
            )
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

    This filter returns all tasks where all sound events that have the feature
    "detection_confidence" have values that are greater or lower than the values given.
    """

    gt: float | None = None
    lt: float | None = None

    def filter(self, query: Select) -> Select:
        """Filter the query."""
        if self.gt is None and self.lt is None:
            return query

        # Create aliases for needed tables
        ClipAnnotation = models.ClipAnnotation.__table__.alias("detection_confidence_clip_annotation")
        Recording = models.Recording.__table__.alias("detection_confidence_recording")
        Clip = models.Clip.__table__.alias("detection_confidence_clip")

        # Create subquery to find sound events with detection confidence that violate conditions
        subquery = (
            select(1)
            .select_from(models.SoundEvent)
            .join(
                models.SoundEventFeature,
                models.SoundEvent.id == models.SoundEventFeature.sound_event_id,
            )
            .join(
                models.FeatureName,
                models.SoundEventFeature.feature_name_id == models.FeatureName.id,
            )
            .where(
                models.FeatureName.name == "detection_confidence",
                models.SoundEvent.recording_id == Recording.c.id,
            )
        )

        # Add inverted confidence value conditions - looking for violations
        if self.gt is not None:
            subquery = subquery.where(models.SoundEventFeature.value <= self.gt)
        if self.lt is not None:
            subquery = subquery.where(models.SoundEventFeature.value >= self.lt)

        # Join with main query and use not exists to ensure no violations exist
        query = (
            query.join(
                ClipAnnotation,
                models.AnnotationTask.clip_annotation_id == ClipAnnotation.c.id,
            )
            .join(
                Clip,
                ClipAnnotation.c.clip_id == Clip.c.id,
            )
            .join(
                Recording,
                Recording.c.id == Clip.c.recording_id,
            )
            .where(~exists(subquery))
        )

        return query


class SpeciesConfidenceFilter(base.Filter):
    """Filter by species confidence.

    This filter returns all tasks where all sound events that have the feature
    "species_confidence" have values that are greater or lower than the values given.
    """

    gt: float | None = None
    lt: float | None = None

    def filter(self, query: Select) -> Select:
        """Filter the query."""
        if self.gt is None and self.lt is None:
            return query

        # Create aliases for needed tables
        ClipAnnotation = models.ClipAnnotation.__table__.alias("species_confidence_clip_annotation")
        Recording = models.Recording.__table__.alias("species_confidence_recording")
        Clip = models.Clip.__table__.alias("species_confidence_clip")

        # Create subquery to find sound events with species confidence that violate conditions
        subquery = (
            select(1)
            .select_from(models.SoundEvent)
            .join(
                models.SoundEventFeature,
                models.SoundEvent.id == models.SoundEventFeature.sound_event_id,
            )
            .join(
                models.FeatureName,
                models.SoundEventFeature.feature_name_id == models.FeatureName.id,
            )
            .where(
                models.FeatureName.name == "species_confidence",
                models.SoundEvent.recording_id == Recording.c.id,
            )
        )

        # Add inverted confidence value conditions - looking for violations
        if self.gt is not None:
            subquery = subquery.where(models.SoundEventFeature.value <= self.gt)
        if self.lt is not None:
            subquery = subquery.where(models.SoundEventFeature.value >= self.lt)

        # Join with main query and use not exists to ensure no violations exist
        query = (
            query.join(
                ClipAnnotation,
                models.AnnotationTask.clip_annotation_id == ClipAnnotation.c.id,
            )
            .join(
                Clip,
                ClipAnnotation.c.clip_id == Clip.c.id,
            )
            .join(
                Recording,
                Recording.c.id == Clip.c.recording_id,
            )
            .where(~exists(subquery))
        )

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
    dataset=DatasetFilter,
    sound_event_annotation_tag=SoundEventAnnotationTagFilter,
    date=DateRangeFilter,
    night=NightFilter,
    day=DayFilter,
    sample=SampleFilter,
    detection_confidence=DetectionConfidenceFilter,
    species_confidence=SpeciesConfidenceFilter,
)

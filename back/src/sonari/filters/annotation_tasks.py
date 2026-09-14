"""Filters for Annotation Tasks."""

from datetime import datetime, timedelta, time

from soundevent import data
from sqlalchemy import Float, Select, and_, exists, func, literal, not_, or_, select
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.sql.expression import FunctionElement

from sonari import models
from sonari.filters import base

__all__ = [
    "AnnotationProjectFilter",
    "StationFilter",
    "AnnotationTaskFilter",
    "SearchRecordingsFilter",
]


# Extract min_freq from JSON geometry coordinates
# BoundingBox format: [start_time, min_freq, end_time, max_freq]
# So coordinates[1] is the minimum frequency
# Create a custom SQL function that compiles differently for SQLite vs PostgreSQL
class json_array_element(FunctionElement):
    """Extract element from JSON array - compiles to dialect-specific SQL."""

    type = Float()
    name = "json_array_element"
    inherit_cache = True


@compiles(json_array_element, "sqlite")
def _json_array_element_sqlite(element, compiler, **kw):
    """Use json_extract with array index for SQLite."""
    col, idx = list(element.clauses)
    # Get the literal value of the index
    idx_value = idx.value if hasattr(idx, "value") else idx
    return f"CAST(json_extract({compiler.process(col, **kw)}, '$.coordinates[{idx_value}]') AS REAL)"


@compiles(json_array_element, "postgresql")
def _json_array_element_postgresql(element, compiler, **kw):
    """Use JSON operators for PostgreSQL."""
    col, idx = list(element.clauses)
    # Get the literal value of the index
    idx_value = idx.value if hasattr(idx, "value") else idx
    return f"CAST(CAST({compiler.process(col, **kw)} AS json)->'coordinates'->{idx_value} AS FLOAT)"


@compiles(json_array_element)
def _json_array_element_default(element, compiler, **kw):
    """Use SQLite syntax as default."""
    col, idx = list(element.clauses)
    # Get the literal value of the index
    idx_value = idx.value if hasattr(idx, "value") else idx
    return f"CAST(json_extract({compiler.process(col, **kw)}, '$.coordinates[{idx_value}]') AS REAL)"


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


class RecordingFilter(base.Filter):
    """Filter for tasks by recording."""

    eq: int | None = None

    def filter(self, query: Select) -> Select:
        """Filter the query."""
        if self.eq is None:
            return query

        return query.where(
            models.AnnotationTask.recording_id == self.eq,
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


def _task_has_tag_key_value(key: str, value: str):
    """Task has this tag on a sound event or as an annotation-task tag."""
    sound_event_subquery = (
        select(models.SoundEventAnnotationTag.sound_event_annotation_id)
        .join(models.Tag, models.Tag.id == models.SoundEventAnnotationTag.tag_id)
        .where(
            models.Tag.key == key,
            models.Tag.value == value,
        )
    )
    sound_event_exists = exists(
        select(1).where(
            models.SoundEventAnnotation.annotation_task_id == models.AnnotationTask.id,
            models.SoundEventAnnotation.id.in_(sound_event_subquery),
        )
    )
    task_tag_exists = exists(
        select(1)
        .select_from(models.AnnotationTaskTag)
        .join(
            models.Tag,
            models.Tag.id == models.AnnotationTaskTag.tag_id,
        )
        .where(
            models.Tag.key == key,
            models.Tag.value == value,
            models.AnnotationTaskTag.annotation_task_id == models.AnnotationTask.id,
        )
    )
    return or_(sound_event_exists, task_tag_exists)


class SoundEventAnnotationTagFilter(base.Filter):
    """Filter for tasks by sound event annotation tag or annotation task tag."""

    keys: str | None = None
    values: str | None = None
    exclude_keys: str | None = None
    exclude_values: str | None = None

    def filter(self, query: Select) -> Select:
        """Filter the query."""
        if self.keys is not None and self.values is not None:
            keys = self.keys.split(",")
            values = self.values.split(",")
            include_conditions = [
                _task_has_tag_key_value(k, v) for k, v in zip(keys, values, strict=True)
            ]
            query = query.where(or_(*include_conditions))

        if self.exclude_keys is not None and self.exclude_values is not None:
            exclude_keys = self.exclude_keys.split(",")
            exclude_values = self.exclude_values.split(",")
            exclude_conditions = [
                _task_has_tag_key_value(k, v)
                for k, v in zip(exclude_keys, exclude_values, strict=True)
            ]
            query = query.where(not_(or_(*exclude_conditions)))

        return query


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

        range_conditions = []
        for i in range(max(len(start_dates), len(end_dates), len(start_times), len(end_times))):
            conditions = []

            # Parse dates and times for this index
            start_date_dt = (
                self._parse_datetime(start_dates[i]) if i < len(start_dates) and start_dates[i] else None
            )
            end_date_dt = (
                self._parse_datetime(end_dates[i]) if i < len(end_dates) and end_dates[i] else None
            )
            start_time_dt = (
                self._parse_datetime(start_times[i]) if i < len(start_times) and start_times[i] else None
            )
            end_time_dt = (
                self._parse_datetime(end_times[i]) if i < len(end_times) and end_times[i] else None
            )

            has_times = (i < len(start_times) and start_times[i]) or (i < len(end_times) and end_times[i])
            start_time_val = start_time_dt.time() if start_time_dt else time.min
            end_time_val = end_time_dt.time() if end_time_dt else time.max
            crosses_midnight = (
                start_time_dt is not None
                and end_time_dt is not None
                and end_time_val < start_time_val
            )

            # Date conditions (end date extended by one day when range crosses midnight)
            if start_date_dt:
                conditions.append(Recording.c.date >= start_date_dt.date())
            if end_date_dt:
                end_date_bound = (
                    end_date_dt.date() + timedelta(days=1) if crosses_midnight else end_date_dt.date()
                )
                conditions.append(Recording.c.date <= end_date_bound)

            # Time/datetime conditions
            if has_times:
                virtual_datetime = func.datetime(Recording.c.date, Recording.c.time)
                has_dates = (i < len(start_dates) and start_dates[i]) or (
                    i < len(end_dates) and end_dates[i]
                )

                if has_dates:
                    if start_date_dt and start_time_dt:
                        start_datetime = datetime.combine(start_date_dt.date(), start_time_val)
                        conditions.append(virtual_datetime >= start_datetime)
                    if end_date_dt and end_time_dt:
                        end_date_for_datetime = (
                            end_date_dt.date() + timedelta(days=1)
                            if crosses_midnight
                            else end_date_dt.date()
                        )
                        end_datetime = datetime.combine(end_date_for_datetime, end_time_val)
                        conditions.append(virtual_datetime <= end_datetime)
                else:
                    if crosses_midnight:
                        conditions.append(
                            or_(
                                Recording.c.time >= start_time_val,
                                Recording.c.time <= end_time_val,
                            )
                        )
                    else:
                        if start_time_dt:
                            conditions.append(Recording.c.time >= start_time_val)
                        if end_time_dt:
                            conditions.append(Recording.c.time <= end_time_val)

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
    """Subsample tasks.

    Keeps a stable fraction of matching tasks using a deterministic hash of
    the task id, so pagination, the task index, and stats all see the same
    subsample.
    """

    eq: float | None = None

    _SEED = 35039
    _BUCKETS = 10_000

    def filter(self, query: Select) -> Select:
        """Filter the query."""
        if self.eq is None:
            return query

        fraction = float(self.eq)
        if fraction <= 0:
            return query.where(literal(False))
        if fraction >= 1:
            return query

        threshold = min(self._BUCKETS, max(1, round(fraction * self._BUCKETS)))
        # Reduce id first so (id * seed) cannot overflow 32-bit SQL integers.
        bucket = (
            (models.AnnotationTask.id % self._BUCKETS) * (self._SEED % self._BUCKETS)
        ) % self._BUCKETS
        return query.where(bucket < threshold)


def _confidence_feature_name_clause_for_tag_creator(tag_creator_username):
    """Pick confidence feature from the user who created the tag (birdedge → species)."""
    return or_(
        and_(
            tag_creator_username == "birdedge",
            models.SoundEventAnnotationFeature.name.like("species_confidence%"),
        ),
        and_(
            tag_creator_username.is_distinct_from("birdedge"),
            models.SoundEventAnnotationFeature.name.like("detection_confidence%"),
        ),
    )


def _sound_event_confidence_exists(
    gt: float | None,
    lt: float | None,
    tag_key: str | None = None,
    tag_value: str | None = None,
):
    """EXISTS: a sound event on this task with confidence in range (optional tag)."""
    tag_creator_user = models.User.__table__.alias("tag_creator_user")

    subquery = (
        select(1)
        .select_from(models.SoundEventAnnotation)
        .join(
            models.SoundEventAnnotationFeature,
            models.SoundEventAnnotation.id == models.SoundEventAnnotationFeature.sound_event_annotation_id,
        )
        .join(
            models.SoundEventAnnotationTag,
            models.SoundEventAnnotationTag.sound_event_annotation_id == models.SoundEventAnnotation.id,
        )
        .join(models.Tag, models.Tag.id == models.SoundEventAnnotationTag.tag_id)
        .outerjoin(
            tag_creator_user,
            tag_creator_user.c.id == models.Tag.created_by_id,
        )
        .where(
            models.SoundEventAnnotation.annotation_task_id == models.AnnotationTask.id,
            _confidence_feature_name_clause_for_tag_creator(tag_creator_user.c.username),
        )
    )

    if tag_key is not None and tag_value is not None:
        subquery = subquery.where(
            models.Tag.key == tag_key,
            models.Tag.value == tag_value,
        )

    if gt is not None:
        subquery = subquery.where(models.SoundEventAnnotationFeature.value > gt)
    if lt is not None:
        subquery = subquery.where(models.SoundEventAnnotationFeature.value < lt)

    return exists(subquery)


class ConfidenceFilter(base.Filter):
    """Filter by confidence on tagged sound events.

    species_confidence when the sound event tag was created by birdedge,
    detection_confidence otherwise. Tag filters optionally restrict which tags
    must satisfy the range.
    """

    gt: float | None = None
    lt: float | None = None

    def filter(self, query: Select) -> Select:
        if self.gt is None and self.lt is None:
            return query

        return query.where(_sound_event_confidence_exists(self.gt, self.lt))


def _apply_tag_and_confidence_filters(
    query: Select,
    tag_filter: SoundEventAnnotationTagFilter,
    confidence_filter: ConfidenceFilter,
) -> Select:
    """Require each selected tag on a sound event with confidence in range (AND across tags)."""
    assert tag_filter.keys is not None and tag_filter.values is not None
    keys = tag_filter.keys.split(",")
    values = tag_filter.values.split(",")

    for key, value in zip(keys, values, strict=True):
        query = query.where(
            _sound_event_confidence_exists(
                confidence_filter.gt,
                confidence_filter.lt,
                tag_key=key,
                tag_value=value,
            )
        )

    return query


def _apply_tag_exclude_and_confidence_filters(
    query: Select,
    tag_filter: SoundEventAnnotationTagFilter,
    confidence_filter: ConfidenceFilter,
) -> Select:
    """Exclude tasks with a tagged sound event whose confidence is in range (per excluded tag)."""
    assert tag_filter.exclude_keys is not None and tag_filter.exclude_values is not None
    keys = tag_filter.exclude_keys.split(",")
    values = tag_filter.exclude_values.split(",")

    for key, value in zip(keys, values, strict=True):
        query = query.where(
            not_(
                _sound_event_confidence_exists(
                    confidence_filter.gt,
                    confidence_filter.lt,
                    tag_key=key,
                    tag_value=value,
                )
            )
        )

    return query


class SoundEventAnnotationMinFreqFilter(base.Filter):
    """Filter by lower frequency.

    This filter returns all tasks where sound event annotations exist with the minimum frequency
    greater or lower than the specified values. Uses database-level JSON extraction for filtering.

    Note: This filter works with both SQLite and PostgreSQL by using SQLAlchemy's compilation
    system to generate dialect-appropriate SQL.
    """

    gt: float | None = None
    lt: float | None = None

    def filter(self, query: Select) -> Select:
        """Filter the query."""
        if self.gt is None and self.lt is None:
            return query

        min_freq_expr = json_array_element(models.SoundEventAnnotation.geometry, literal(1))

        # Create subquery to find sound event annotations matching conditions
        subquery = (
            select(1)
            .select_from(models.SoundEventAnnotation)
            .where(
                models.SoundEventAnnotation.annotation_task_id == models.AnnotationTask.id,
                models.SoundEventAnnotation.geometry_type == "BoundingBox",
            )
        )

        # Add frequency conditions
        if self.gt is not None:
            subquery = subquery.where(min_freq_expr > self.gt)
        if self.lt is not None:
            subquery = subquery.where(min_freq_expr < self.lt)

        # Use exists to filter tasks - very efficient
        return query.where(exists(subquery))


class SoundEventAnnotationMaxFreqFilter(base.Filter):
    """Filter by upper frequency.

    This filter returns all tasks where sound event annotations exist with the maximum frequency
    greater or lower than the specified values. Uses database-level JSON extraction for filtering.

    Note: This filter works with both SQLite and PostgreSQL by using SQLAlchemy's compilation
    system to generate dialect-appropriate SQL.
    """

    gt: float | None = None
    lt: float | None = None

    def filter(self, query: Select) -> Select:
        """Filter the query."""
        if self.gt is None and self.lt is None:
            return query

        max_freq_expr = json_array_element(models.SoundEventAnnotation.geometry, literal(3))

        # Create subquery to find sound event annotations matching conditions
        subquery = (
            select(1)
            .select_from(models.SoundEventAnnotation)
            .where(
                models.SoundEventAnnotation.annotation_task_id == models.AnnotationTask.id,
                models.SoundEventAnnotation.geometry_type == "BoundingBox",  # Fast filter first
            )
        )

        # Add frequency conditions
        if self.gt is not None:
            subquery = subquery.where(max_freq_expr > self.gt)
        if self.lt is not None:
            subquery = subquery.where(max_freq_expr < self.lt)

        # Use exists to filter tasks - very efficient
        return query.where(exists(subquery))


_AnnotationTaskFilterCombined = base.combine(
    SearchRecordingsFilter,
    assigned_to=AssignedToFilter,
    pending=PendingFilter,
    empty=EmptyFilter,
    verified=IsVerifiedFilter,
    rejected=IsRejectedFilter,
    completed=IsCompletedFilter,
    assigned=IsAssignedFilter,
    annotation_project=AnnotationProjectFilter,
    recording=RecordingFilter,
    dataset=StationFilter,
    sound_event_annotation_tag=SoundEventAnnotationTagFilter,
    date=DateRangeFilter,
    night=NightFilter,
    day=DayFilter,
    sample=SampleFilter,
    confidence=ConfidenceFilter,
    sound_event_annotation_min_frequency=SoundEventAnnotationMinFreqFilter,
    sound_event_annotation_max_frequency=SoundEventAnnotationMaxFreqFilter,
)


class AnnotationTaskFilter(_AnnotationTaskFilterCombined):
    """Annotation task filter with correlated tag + confidence when both are set."""

    def filter(self, query: Select) -> Select:
        filters = self.build_filter_list()
        tag_filter: SoundEventAnnotationTagFilter | None = None
        confidence_filter: ConfidenceFilter | None = None
        other_filters: list[base.Filter] = []

        for filter_ in filters:
            if isinstance(filter_, SoundEventAnnotationTagFilter):
                tag_filter = filter_
            elif isinstance(filter_, ConfidenceFilter):
                confidence_filter = filter_
            else:
                other_filters.append(filter_)

        for filter_ in other_filters:
            query = filter_.filter(query)

        include_tags_active = (
            tag_filter is not None
            and tag_filter.keys is not None
            and tag_filter.values is not None
        )
        exclude_tags_active = (
            tag_filter is not None
            and tag_filter.exclude_keys is not None
            and tag_filter.exclude_values is not None
        )
        confidence_active = (
            confidence_filter is not None
            and (confidence_filter.gt is not None or confidence_filter.lt is not None)
        )

        if confidence_active:
            if include_tags_active:
                query = _apply_tag_and_confidence_filters(
                    query, tag_filter, confidence_filter
                )
            elif not exclude_tags_active:
                query = confidence_filter.filter(query)
            if exclude_tags_active:
                query = _apply_tag_exclude_and_confidence_filters(
                    query, tag_filter, confidence_filter
                )
        elif tag_filter is not None:
            query = tag_filter.filter(query)

        return query

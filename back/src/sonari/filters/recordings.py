"""Filters for Recordings."""

from sqlalchemy import Select

from sonari import models
from sonari.filters import base

__all__ = [
    "ChannelsFilter",
    "DatasetFilter",
    "DateFilter",
    "DurationFilter",
    "IDFilter",
    "LatitudeFilter",
    "LongitudeFilter",
    "RecordingFilter",
    "SamplerateFilter",
    "SearchFilter",
    "TagFilter",
    "TimeExpansionFilter",
    "TimeFilter",
]

IDFilter = base.integer_filter(models.Recording.id)

DurationFilter = base.float_filter(models.Recording.duration)
"""Filter recordings by duration."""

SamplerateFilter = base.integer_filter(models.Recording.samplerate)
"""Filter recordings by samplerate."""

ChannelsFilter = base.integer_filter(models.Recording.channels)
"""Filter recordings by channels."""

LatitudeFilter = base.optional_float_filter(models.Recording.latitude)
"""Filter recordings by latitude."""

LongitudeFilter = base.optional_float_filter(models.Recording.longitude)
"""Filter recordings by longitude."""

DateFilter = base.optional_date_filter(models.Recording.date)
"""Filter recordings by date."""

TimeFilter = base.optional_time_filter(models.Recording.time)
"""Filter recordings by time."""

TimeExpansionFilter = base.float_filter(models.Recording.time_expansion)
"""Filter recordings by time expansion."""

HashFilter = base.string_filter(models.Recording.hash)
"""Filter recordings by hash."""

SearchFilter = base.search_filter([
    models.Recording.path,
])


class DatasetFilter(base.Filter):
    """Filter recordings by the dataset they are in."""

    eq: int | None = None

    def filter(self, query: Select) -> Select:
        """Filter the query."""
        if not self.eq:
            return query

        return query.join(
            models.DatasetRecording,
            models.Recording.id == models.DatasetRecording.recording_id,
        ).where(models.DatasetRecording.dataset_id == self.eq)


class TagFilter(base.Filter):
    """Filter recordings by tags.

    This filter can be used to filter recordings that have a certain
    tag.
    """

    key: str | None = None
    value: str | None = None

    def filter(self, query: Select) -> Select:
        """Filter the query."""
        if self.key is None and self.value is None:
            return query

        query = query.join(
            models.RecordingTag,
            models.Recording.id == models.RecordingTag.recording_id,
        ).join(models.Tag, models.RecordingTag.tag_id == models.Tag.id)

        conditions = []
        if self.key is not None:
            conditions.append(models.Tag.key == self.key)
        if self.value is not None:
            conditions.append(models.Tag.value == self.value)

        return query.where(*conditions)


RecordingFilter = base.combine(
    SearchFilter,
    tag=TagFilter,
    dataset=DatasetFilter,
    duration=DurationFilter,
    samplerate=SamplerateFilter,
    channels=ChannelsFilter,
    latitude=LatitudeFilter,
    longitude=LongitudeFilter,
    date=DateFilter,
    time=TimeFilter,
    time_expansion=TimeExpansionFilter,
)

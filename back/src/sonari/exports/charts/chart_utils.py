"""Chart utility functions for export functionality."""

import datetime
from datetime import timedelta
from typing import Any, Dict, List, Tuple

from ..constants import ExportConstants


def generate_time_buckets(
    events_with_datetime: List[Dict[str, Any]],
    period_seconds: int | None,
    time_period_type: str,
    predefined_period: str | None,
) -> List[Tuple[datetime.datetime, datetime.datetime]]:
    """Generate time buckets for the given period."""
    if not events_with_datetime:
        return []

    # Find overall time range
    all_datetimes = [event["datetime"] for event in events_with_datetime]
    start_datetime = min(all_datetimes)
    end_datetime = max(all_datetimes)

    # Handle "overall" period - single bucket for entire range
    if period_seconds is None:
        return [(start_datetime, end_datetime)]

    # Handle "night" period - generate night-only buckets
    if time_period_type == "predefined" and predefined_period == "night":
        return generate_night_buckets(start_datetime, end_datetime)

    # Generate regular time buckets
    buckets = []
    current = start_datetime

    while current < end_datetime:
        bucket_end = current + timedelta(seconds=period_seconds)
        if bucket_end > end_datetime:
            bucket_end = end_datetime
        buckets.append((current, bucket_end))
        current = bucket_end

    return buckets


def generate_night_buckets(
    start_datetime: datetime.datetime, end_datetime: datetime.datetime
) -> List[Tuple[datetime.datetime, datetime.datetime]]:
    """Generate night-only buckets (6PM-6AM)."""
    buckets = []
    current_date = start_datetime.date()
    end_date = end_datetime.date()

    while current_date <= end_date:
        # Night starts at 6PM of current day
        night_start = datetime.datetime.combine(current_date, datetime.time(ExportConstants.NIGHT_START_HOUR, 0))
        # Night ends at 6AM of next day
        night_end = datetime.datetime.combine(
            current_date + timedelta(days=1), datetime.time(ExportConstants.NIGHT_END_HOUR, 0)
        )

        # Only include if within our overall range
        if night_end >= start_datetime and night_start <= end_datetime:
            # Clip to actual data range
            actual_start = max(night_start, start_datetime)
            actual_end = min(night_end, end_datetime)
            if actual_start < actual_end:
                buckets.append((actual_start, actual_end))

        current_date += timedelta(days=1)

    return buckets


def convert_time_period_to_seconds(
    time_period_type: str,
    predefined_period: str | None,
    custom_period_value: int | None,
    custom_period_unit: str | None,
) -> int | None:
    """Convert time period to seconds. Returns None for 'overall' period."""
    if time_period_type == "predefined":
        predefined_map = {
            "second": 1,
            "minute": 60,
            "hour": 3600,
            "night": 12 * 3600,  # 12 hours (6PM-6AM)
            "day": 24 * 3600,
            "week": 7 * 24 * 3600,
            "overall": None,  # Special case
        }
        return predefined_map.get(predefined_period)
    else:
        # Convert custom periods
        if custom_period_value is None or custom_period_unit is None:
            return 60  # Default to 1 minute

        unit_map = {
            "seconds": 1,
            "minutes": 60,
            "hours": 3600,
            "days": 24 * 3600,
            "weeks": 7 * 24 * 3600,
            "months": 30 * 24 * 3600,  # Approximate
            "years": 365 * 24 * 3600,  # Approximate
        }
        return custom_period_value * unit_map.get(custom_period_unit, 1)

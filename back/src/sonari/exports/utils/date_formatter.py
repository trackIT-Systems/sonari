"""Date formatting utilities for exports."""

import datetime


class DateFormatter:
    """Utility class for consistent date formatting across exports."""

    @staticmethod
    def format_date(date: datetime.date | None, format_type: str = "DD.MM.YYYY") -> str:
        """Format date according to specified format."""
        if date is None:
            return ""

        if format_type == "DD.MM.YYYY":
            return date.strftime("%d.%m.%Y")
        else:
            return str(date)

    @staticmethod
    def parse_date_string(date_str: str) -> datetime.date:
        """Parse date string in YYYY-MM-DD format."""
        return datetime.datetime.strptime(date_str, "%Y-%m-%d").date()

    @staticmethod
    def extract_date_components(date: datetime.date | None, format_type: str = "DD.MM.YYYY") -> dict:
        """Extract day, month, year components."""
        if date is None:
            return {"day": "", "month": "", "year": "", "date_str": ""}

        return {
            "day": date.day,
            "month": date.month,
            "year": date.year,
            "date_str": DateFormatter.format_date(date, format_type),
        }

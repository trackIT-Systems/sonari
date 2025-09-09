"""Base export service with common functionality."""

import datetime
from abc import ABC
from typing import List
from uuid import UUID

from ..data import resolve_project_ids
from ..utils import DateFormatter
from sonari.routes.dependencies import Session


class BaseExportService(ABC):
    """Base service class for all export types."""

    def __init__(self, session: Session):
        self.session = session

    async def resolve_projects(self, annotation_project_uuids: List[UUID]):
        """Resolve annotation project UUIDs to IDs and project mapping."""
        return await resolve_project_ids(self.session, annotation_project_uuids)

    def parse_date_range(self, start_date: str | None, end_date: str | None):
        """Parse date range strings to date objects."""
        parsed_start_date = None
        parsed_end_date = None

        if start_date:
            parsed_start_date = DateFormatter.parse_date_string(start_date)
        if end_date:
            parsed_end_date = DateFormatter.parse_date_string(end_date)

        return parsed_start_date, parsed_end_date

    def generate_filename(self, export_type: str) -> str:
        """Generate standardized filename for export."""
        return f"{datetime.datetime.now().strftime('%d.%m.%Y_%H_%M')}_{export_type}"

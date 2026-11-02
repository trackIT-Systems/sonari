"""Filters related to guided tour projects."""

from sqlalchemy import Select

from sonari import models
from sonari.filters.base import Filter

__all__ = [
    "ExcludeGuidedToursFilter",
]


class ExcludeGuidedToursFilter(Filter):
    """Exclude personal guided tour projects from list results."""

    def filter(self, query: Select) -> Select:
        return query.where(models.AnnotationProject.is_guided_tour.is_(False))

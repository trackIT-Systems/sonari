"""Status of the GUANO backfill per annotation project."""

import datetime
from typing import Optional

import sqlalchemy.orm as orm
from sqlalchemy import DateTime, ForeignKey

from sonari.models.base import Base

__all__ = ["PredictionBackfill"]


class PredictionBackfill(Base):
    """State of the GUANO backfill of a project's oldest sound event versions; one row per project."""

    __tablename__ = "prediction_backfill"

    annotation_project_id: orm.Mapped[int] = orm.mapped_column(
        ForeignKey("annotation_project.id", ondelete="CASCADE"),
        primary_key=True,
    )
    # "running", "done" or "failed".
    state: orm.Mapped[str] = orm.mapped_column(nullable=False)
    started_on: orm.Mapped[datetime.datetime] = orm.mapped_column(DateTime(timezone=True), nullable=False)
    # Updated while running; a run without updates for a while counts as dead.
    updated_on: orm.Mapped[datetime.datetime] = orm.mapped_column(DateTime(timezone=True), nullable=False)
    finished_on: orm.Mapped[Optional[datetime.datetime]] = orm.mapped_column(DateTime(timezone=True), default=None)
    reviewed_tasks: orm.Mapped[int] = orm.mapped_column(default=0)
    recordings: orm.Mapped[int] = orm.mapped_column(default=0)
    recordings_with_source: orm.Mapped[int] = orm.mapped_column(default=0)
    match_rate: orm.Mapped[Optional[float]] = orm.mapped_column(default=None)
    originals_created: orm.Mapped[int] = orm.mapped_column(default=0)
    error: orm.Mapped[Optional[str]] = orm.mapped_column(default=None)

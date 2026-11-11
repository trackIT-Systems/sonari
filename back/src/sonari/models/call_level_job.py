"""Status of the search for reference calls of one tag in an annotation project."""

import datetime
from typing import Optional

import sqlalchemy.orm as orm
from sqlalchemy import DateTime, ForeignKey

from sonari.models.base import Base

__all__ = ["CallLevelJob"]


class CallLevelJob(Base):
    """Last search for reference calls of a tag in a project; one row per project and tag."""

    __tablename__ = "call_level_job"

    annotation_project_id: orm.Mapped[int] = orm.mapped_column(
        ForeignKey("annotation_project.id", ondelete="CASCADE"),
        primary_key=True,
    )
    tag_id: orm.Mapped[int] = orm.mapped_column(
        ForeignKey("tag.id", ondelete="CASCADE"),
        primary_key=True,
    )
    # "running", "done" or "failed".
    state: orm.Mapped[str] = orm.mapped_column(nullable=False)
    started_on: orm.Mapped[datetime.datetime] = orm.mapped_column(DateTime(timezone=True), nullable=False)
    # Updated after every batch; a run without updates for a while counts as dead.
    updated_on: orm.Mapped[datetime.datetime] = orm.mapped_column(DateTime(timezone=True), nullable=False)
    finished_on: orm.Mapped[Optional[datetime.datetime]] = orm.mapped_column(DateTime(timezone=True), default=None)
    # Calls this run set out to measure, and how far it got.
    total: orm.Mapped[int] = orm.mapped_column(default=0)
    done: orm.Mapped[int] = orm.mapped_column(default=0)
    failed: orm.Mapped[int] = orm.mapped_column(default=0)
    error: orm.Mapped[Optional[str]] = orm.mapped_column(default=None)

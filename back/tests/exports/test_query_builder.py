"""Tests for exports/data/query_builder.py."""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from sonari.exports.data.query_builder import (
    build_status_filters,
    get_filtered_annotation_tasks,
    resolve_project_ids,
)

# ---------------------------------------------------------------------------
# resolve_project_ids
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_resolve_project_ids_valid(db_session: AsyncSession, test_annotation_project):
    """Test resolve_project_ids with valid project IDs."""
    project_ids, projects_by_id = await resolve_project_ids(db_session, [test_annotation_project.id])
    assert project_ids == [test_annotation_project.id]
    assert test_annotation_project.id in projects_by_id
    assert projects_by_id[test_annotation_project.id].name == test_annotation_project.name


@pytest.mark.asyncio
async def test_resolve_project_ids_empty_raises(db_session: AsyncSession):
    """Test resolve_project_ids with empty list raises ValueError."""
    with pytest.raises(ValueError, match="No valid annotation projects found"):
        await resolve_project_ids(db_session, [])


@pytest.mark.asyncio
async def test_resolve_project_ids_invalid_raises(db_session: AsyncSession):
    """Test resolve_project_ids with non-existent IDs raises ValueError."""
    with pytest.raises(ValueError, match="No valid annotation projects found"):
        await resolve_project_ids(db_session, [999999])


# ---------------------------------------------------------------------------
# build_status_filters
# ---------------------------------------------------------------------------


def test_build_status_filters_none():
    """Test build_status_filters with None returns empty list."""
    assert build_status_filters(None) == []


def test_build_status_filters_empty():
    """Test build_status_filters with empty list returns empty list."""
    assert build_status_filters([]) == []


def test_build_status_filters_regular_statuses():
    """Test build_status_filters with regular statuses."""
    filters = build_status_filters(["completed", "verified"])
    assert len(filters) == 1


def test_build_status_filters_no_status():
    """Test build_status_filters with 'no' status (tasks with no badges)."""
    filters = build_status_filters(["no"])
    assert len(filters) == 1


def test_build_status_filters_combined():
    """Test build_status_filters with combined regular and 'no'."""
    filters = build_status_filters(["completed", "no"])
    assert len(filters) == 1  # OR of two conditions


# ---------------------------------------------------------------------------
# get_filtered_annotation_tasks
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_filtered_annotation_tasks_project_filter(
    db_session: AsyncSession,
    test_annotation_project,
    test_annotation_task,
):
    """Test get_filtered_annotation_tasks filters by project and eager loads."""
    tasks, count = await get_filtered_annotation_tasks(db_session, [test_annotation_project.id])
    assert count >= 1
    assert len(tasks) >= 1
    task_ids = [t.id for t in tasks]
    assert test_annotation_task.id in task_ids
    # Check eager loading
    for t in tasks:
        assert t.recording is not None
        assert hasattr(t, "status_badges")
        assert hasattr(t, "sound_event_annotations")
        assert hasattr(t, "notes")


@pytest.mark.asyncio
async def test_get_filtered_annotation_tasks_with_status_filter(
    db_session: AsyncSession,
    test_annotation_project,
):
    """Test get_filtered_annotation_tasks with status filter."""
    tasks, count = await get_filtered_annotation_tasks(
        db_session,
        [test_annotation_project.id],
        statuses=["completed"],
    )
    # May be 0 if no tasks have completed status
    assert isinstance(count, int)
    assert len(tasks) == count

"""Tests for export endpoints."""

import pytest
from httpx import AsyncClient

from sonari import schemas


@pytest.mark.asyncio
async def test_export_multibase_with_empty_projects(auth_client: AsyncClient):
    """Test multibase export with empty project list."""
    response = await auth_client.get(
        "/api/v1/export/multibase/",
        params={
            "annotation_project_ids": [],
            "tags": ["test"],
        },
    )
    # Should handle empty project list gracefully
    assert response.status_code in [200, 400, 422]


@pytest.mark.asyncio
async def test_export_multibase_with_project(
    auth_client: AsyncClient,
    test_annotation_project: schemas.AnnotationProject,
    test_tag: schemas.Tag,
):
    """Test multibase export with a valid project."""
    response = await auth_client.get(
        "/api/v1/export/multibase/",
        params={
            "annotation_project_ids": [test_annotation_project.id],
            "tags": [test_tag.key],
        },
    )
    # Export should succeed even if project has no data
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_export_dump_with_project(
    auth_client: AsyncClient,
    test_annotation_project: schemas.AnnotationProject,
):
    """Test dump export with a valid project."""
    response = await auth_client.get(
        "/api/v1/export/dump/",
        params={
            "annotation_project_ids": [test_annotation_project.id],
        },
    )
    # Export should succeed even if project has no data
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_export_passes_with_project(
    auth_client: AsyncClient,
    test_annotation_project: schemas.AnnotationProject,
    test_tag: schemas.Tag,
):
    """Test passes export with a valid project."""
    response = await auth_client.get(
        "/api/v1/export/passes/",
        params={
            "annotation_project_ids": [test_annotation_project.id],
            "tags": [test_tag.key],
            "time_period_type": "predefined",
            "predefined_period": "week",
        },
    )
    # Export should succeed even if project has no data
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_export_stats_with_project(
    auth_client: AsyncClient,
    test_annotation_project: schemas.AnnotationProject,
    test_tag: schemas.Tag,
):
    """Test stats export with a valid project."""
    response = await auth_client.get(
        "/api/v1/export/stats/",
        params={
            "annotation_project_ids": [test_annotation_project.id],
            "tags": [test_tag.key],
        },
    )
    # Export should succeed even if project has no data
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_export_time_with_project(
    auth_client: AsyncClient,
    test_annotation_project: schemas.AnnotationProject,
    test_tag: schemas.Tag,
):
    """Test time export with a valid project."""
    response = await auth_client.get(
        "/api/v1/export/time/",
        params={
            "annotation_project_ids": [test_annotation_project.id],
            "tags": [test_tag.key],
            "time_period_type": "predefined",
            "predefined_period": "month",
        },
    )
    # Export should succeed even if project has no data
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_export_yearly_activity_with_project(
    auth_client: AsyncClient,
    test_annotation_project: schemas.AnnotationProject,
    test_tag: schemas.Tag,
):
    """Test yearly activity export with a valid project."""
    response = await auth_client.get(
        "/api/v1/export/yearly-activity/",
        params={
            "annotation_project_ids": [test_annotation_project.id],
            "tags": [test_tag.key],
        },
    )
    # Export should succeed even if project has no data
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_export_stats_with_group_species(
    auth_client: AsyncClient,
    test_annotation_project: schemas.AnnotationProject,
    test_tag: schemas.Tag,
):
    """Test stats export with species grouping enabled."""
    response = await auth_client.get(
        "/api/v1/export/stats/",
        params={
            "annotation_project_ids": [test_annotation_project.id],
            "tags": [test_tag.key],
            "group_species": True,
        },
    )
    # Export should succeed even if project has no data
    assert response.status_code == 200

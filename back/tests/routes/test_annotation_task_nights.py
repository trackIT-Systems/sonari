"""The nights route and the recording night filter of the task list."""

import pytest

from tests.api.test_api_annotation_task_nights import night_tasks  # noqa: F401  (fixture)


@pytest.mark.asyncio
async def test_nights_route(auth_client, night_tasks, test_annotation_project):
    response = await auth_client.get(
        "/api/v1/annotation_tasks/nights/",
        params={"annotation_project__eq": test_annotation_project.id, "utc_offset": 120, "limit": 1},
    )
    assert response.status_code == 200, response.text
    page = response.json()
    assert page["total"] == 3
    assert page["items"] == [{"night": "2026-06-14", "total": 2}]

    tasks = await auth_client.get(
        "/api/v1/annotation_tasks/",
        params={
            "annotation_project__eq": test_annotation_project.id,
            "recording_night__eq": "2026-06-15",
            "recording_night__utc_offset": 120,
            "limit": -1,
        },
    )
    assert tasks.status_code == 200, tasks.text
    assert tasks.json()["total"] == 2


@pytest.mark.asyncio
async def test_night_stats_route(auth_client, night_tasks, test_annotation_project):
    response = await auth_client.get(
        "/api/v1/annotation_tasks/nights/stats/",
        params=[
            ("annotation_project__eq", test_annotation_project.id),
            ("utc_offset", 120),
            ("night", "2026-06-15"),
            ("night", "none"),
        ],
    )
    assert response.status_code == 200, response.text
    assert [(n["night"], n["total"], n["pending_count"]) for n in response.json()] == [
        ("2026-06-15", 2, 2),
        (None, 1, 1),
    ]


@pytest.mark.asyncio
@pytest.mark.parametrize("night", ["2026-02-30", "tonight"])
async def test_night_stats_route_rejects_bad_nights(auth_client, test_annotation_project, night):
    response = await auth_client.get(
        "/api/v1/annotation_tasks/nights/stats/",
        params={"annotation_project__eq": test_annotation_project.id, "night": night},
    )
    assert response.status_code == 422, response.text


@pytest.mark.asyncio
async def test_recording_night_filter_rejects_impossible_dates(auth_client, test_annotation_project):
    response = await auth_client.get(
        "/api/v1/annotation_tasks/",
        params={"annotation_project__eq": test_annotation_project.id, "recording_night__eq": "2026-02-30"},
    )
    # Filter values the filter rejects are a 400 here, like every filter's
    assert response.status_code == 400, response.text

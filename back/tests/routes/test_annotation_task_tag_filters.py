"""Tests for grouped tag include/exclude and tag count task filters."""

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.routes.test_annotation_task_tag_confidence_filters import (
    _add_tag,
    _create_sound_event,
    _create_species_tag,
    _create_task,
    _fetch_task_ids,
)

from sonari import api, schemas


@pytest.fixture
async def tagged_tasks(
    db_session: AsyncSession,
    test_recording_id: int,
    test_user,
):
    """A project with tasks carrying different tag combinations.

    - ``none``: no tags at all
    - ``pip``: pip on a sound event
    - ``pip_nyct``: pip and nyct on two sound events
    - ``pip_task_nyct``: pip on a sound event, nyct as a task-level tag
    - ``task_only``: nyct as a task-level tag only
    - ``pip_twice``: pip on two sound events (one distinct tag)
    """
    user = schemas.SimpleUser.model_validate(test_user)
    project = await api.annotation_projects.create(
        db_session,
        name=f"tag_filters_{uuid.uuid4().hex[:8]}",
        description="tag filter test",
    )
    await db_session.commit()

    pip = await _create_species_tag(db_session, user, "pip")
    nyct = await _create_species_tag(db_session, user, "nyct")

    async def task(start: float):
        return await _create_task(db_session, project, test_recording_id, start, start + 1.0)

    async def event_tag(task_, tag):
        event = await _create_sound_event(db_session, task_, user)
        await _add_tag(db_session, event, tag, user)

    async def task_tag(task_, tag):
        task_ = await api.annotation_tasks.get(db_session, task_.id, include_tags=True)
        await api.annotation_tasks.add_tag(db_session, task_, tag, user=user)
        await db_session.commit()

    tasks = {name: await task(float(i)) for i, name in enumerate(
        ["none", "pip", "pip_nyct", "pip_task_nyct", "task_only", "pip_twice"]
    )}
    await event_tag(tasks["pip"], pip)
    await event_tag(tasks["pip_nyct"], pip)
    await event_tag(tasks["pip_nyct"], nyct)
    await event_tag(tasks["pip_task_nyct"], pip)
    await task_tag(tasks["pip_task_nyct"], nyct)
    await task_tag(tasks["task_only"], nyct)
    await event_tag(tasks["pip_twice"], pip)
    await event_tag(tasks["pip_twice"], pip)

    return project, pip, nyct, {name: t.id for name, t in tasks.items()}


_ALL = ("none", "pip", "pip_nyct", "pip_task_nyct", "task_only", "pip_twice")


def _names(ids: set[int], task_ids: dict[str, int]) -> set[str]:
    return {name for name, task_id in task_ids.items() if task_id in ids}


@pytest.mark.parametrize(
    ("params", "expected"),
    [
        # Only tags on sound events count: nyct as a task tag is left alone.
        ({"include": ["pip"]}, {"pip", "pip_nyct", "pip_task_nyct", "pip_twice"}),
        ({"include": ["nyct"]}, {"pip_nyct"}),
        ({"include": ["pip", "nyct"], "match": "and"}, {"pip_nyct"}),
        ({"include": ["pip", "nyct"], "match": "or"}, {"pip", "pip_nyct", "pip_task_nyct", "pip_twice"}),
        ({"exclude": ["nyct"]}, {"none", "pip", "pip_task_nyct", "task_only", "pip_twice"}),
        ({"exclude": ["pip", "nyct"]}, {"none", "task_only"}),
        ({"include": ["pip"], "exclude": ["nyct"]}, {"pip", "pip_task_nyct", "pip_twice"}),
        ({"count": {"eq": 0}}, {"none", "task_only"}),
        ({"count": {"eq": 1}}, {"pip", "pip_task_nyct", "pip_twice"}),
        ({"count": {"eq": 2}}, {"pip_nyct"}),
        ({"count": {"lt": 2}}, {"none", "pip", "pip_task_nyct", "task_only", "pip_twice"}),
        ({"count": {"gt": 0}}, {"pip", "pip_nyct", "pip_task_nyct", "pip_twice"}),
        ({"count": {"lt": 0}}, set()),
        ({"include": ["pip"], "count": {"eq": 1}}, {"pip", "pip_task_nyct", "pip_twice"}),
        ({"include": ["pip"], "count": {"eq": 0}}, set()),
        ({"exclude": ["pip"], "count": {"le": 1}}, {"none", "task_only"}),
    ],
)
@pytest.mark.asyncio
async def test_grouped_tag_filters(
    auth_client: AsyncClient,
    tagged_tasks,
    params: dict,
    expected: set[str],
):
    project, pip, nyct, task_ids = tagged_tasks
    filter_params = _tag_filter_params("sound_event_annotation_tag", params, {"pip": pip, "nyct": nyct})
    ids = await _fetch_task_ids(auth_client, project.id, **filter_params)
    assert _names(ids, task_ids) == expected


def _tag_filter_params(prefix: str, params: dict, tags: dict) -> dict[str, object]:
    filter_params: dict[str, object] = {}
    if "include" in params:
        filter_params[f"{prefix}__keys"] = ",".join(tags[n].key for n in params["include"])
        filter_params[f"{prefix}__values"] = ",".join(tags[n].value for n in params["include"])
    if "match" in params:
        filter_params[f"{prefix}__include_match"] = params["match"]
    if "exclude" in params:
        filter_params[f"{prefix}__exclude_keys"] = ",".join(tags[n].key for n in params["exclude"])
        filter_params[f"{prefix}__exclude_values"] = ",".join(tags[n].value for n in params["exclude"])
    for op, value in params.get("count", {}).items():
        filter_params[f"{prefix}_count__{op}"] = value
    return filter_params


@pytest.mark.parametrize(
    ("params", "expected"),
    [
        # Only tags on the task itself count: nyct is a task tag of pip_task_nyct and task_only.
        ({"include": ["nyct"]}, {"pip_task_nyct", "task_only"}),
        ({"include": ["pip"]}, set()),
        ({"include": ["pip", "nyct"], "match": "or"}, {"pip_task_nyct", "task_only"}),
        ({"include": ["pip", "nyct"], "match": "and"}, set()),
        ({"exclude": ["nyct"]}, {"none", "pip", "pip_nyct", "pip_twice"}),
        ({"exclude": ["pip"]}, set(_ALL)),
        ({"count": {"eq": 0}}, {"none", "pip", "pip_nyct", "pip_twice"}),
        ({"count": {"eq": 1}}, {"pip_task_nyct", "task_only"}),
        ({"count": {"gt": 1}}, set()),
        ({"include": ["nyct"], "count": {"eq": 1}}, {"pip_task_nyct", "task_only"}),
    ],
)
@pytest.mark.asyncio
async def test_task_tag_filters(auth_client: AsyncClient, tagged_tasks, params: dict, expected: set[str]):
    project, pip, nyct, task_ids = tagged_tasks
    filter_params = _tag_filter_params("task_tag", params, {"pip": pip, "nyct": nyct})
    ids = await _fetch_task_ids(auth_client, project.id, **filter_params)
    assert _names(ids, task_ids) == expected


@pytest.mark.asyncio
async def test_sound_event_and_task_tag_filters_combine(auth_client: AsyncClient, tagged_tasks):
    project, pip, nyct, task_ids = tagged_tasks
    tags = {"pip": pip, "nyct": nyct}
    ids = await _fetch_task_ids(
        auth_client,
        project.id,
        **_tag_filter_params("sound_event_annotation_tag", {"include": ["pip"]}, tags),
        **_tag_filter_params("task_tag", {"include": ["nyct"]}, tags),
    )
    assert _names(ids, task_ids) == {"pip_task_nyct"}


@pytest.mark.asyncio
async def test_include_unknown_tag_matches_nothing(auth_client: AsyncClient, tagged_tasks):
    project, _pip, _nyct, _task_ids = tagged_tasks
    ids = await _fetch_task_ids(
        auth_client,
        project.id,
        sound_event_annotation_tag__keys="species",
        sound_event_annotation_tag__values=f"unknown_{uuid.uuid4().hex}",
    )
    assert ids == set()

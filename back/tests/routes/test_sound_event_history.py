"""Tests for sound event versions (edit history) and the prediction stats."""

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from sonari import api, models, schemas

EDIT_HEADER = "X-Sonari-Edit-Id"
BOX = {"type": "BoundingBox", "coordinates": [0.5, 100.0, 1.5, 500.0]}


@pytest.fixture
def species_tag(db_session: AsyncSession, test_user):
    """Create species tags with unique values."""
    created_by = schemas.SimpleUser.model_validate(test_user)

    async def create() -> schemas.Tag:
        tag = await api.tags.create(
            db_session, key="species", value=f"Species {uuid.uuid4().hex[:8]}", created_by=created_by
        )
        await db_session.commit()
        return tag

    return create


async def _imported_event(
    db_session: AsyncSession,
    task: schemas.AnnotationTask,
    tag: schemas.Tag,
    confidence: float = 0.87,
) -> schemas.SoundEventAnnotation:
    """Create an event the way ecohub writes it: through the API, without an edit session."""
    detector = (await api.users.get_many(db_session, limit=1))[0][0]
    event = await api.sound_event_annotations.create(
        db_session,
        annotation_task=task,
        geometry=schemas.SoundEventAnnotationCreate(geometry=BOX, tags=[]).geometry,
        created_by=detector,
    )
    event = await api.sound_event_annotations.add_tag(db_session, event, tag)
    event = await api.sound_event_annotations.add_feature(
        db_session,
        event,
        schemas.Feature(name=f"detection_confidence:{tag.value}", value=confidence),
    )
    await db_session.commit()
    return event


async def _history(client: AsyncClient, task_id: int) -> schemas.SoundEventTaskHistory:
    response = await client.get("/api/v1/annotation_tasks/detail/history/", params={"annotation_task_id": task_id})
    assert response.status_code == 200, response.text
    return schemas.SoundEventTaskHistory.model_validate(response.json())


def _headers(edit_id: str) -> dict[str, str]:
    return {EDIT_HEADER: edit_id}


async def _patch_box(client: AsyncClient, event_id: int, coordinates: list[float], edit_id: str) -> None:
    response = await client.patch(
        "/api/v1/sound_event_annotations/detail/",
        params={"sound_event_annotation_id": event_id},
        json={"geometry": {"type": "BoundingBox", "coordinates": coordinates}},
        headers=_headers(edit_id),
    )
    assert response.status_code == 200, response.text


async def _tag(client: AsyncClient, method: str, event_id: int, tag: schemas.Tag, edit_id: str) -> None:
    response = await client.request(
        method,
        "/api/v1/sound_event_annotations/detail/tags/",
        params={"sound_event_annotation_id": event_id, "key": tag.key, "value": tag.value},
        headers=_headers(edit_id),
    )
    assert response.status_code == 200, response.text


async def _delete(client: AsyncClient, event_id: int, edit_id: str) -> None:
    response = await client.delete(
        "/api/v1/sound_event_annotations/detail/",
        params={"sound_event_annotation_id": event_id},
        headers=_headers(edit_id),
    )
    assert response.status_code == 200, response.text


def _box(version: schemas.SoundEventVersion) -> list[float]:
    return list(version.geometry.coordinates)


@pytest.mark.asyncio
async def test_one_version_per_event_and_session(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    species_tag,
    test_annotation_task: schemas.AnnotationTask,
):
    tag = await species_tag()
    event = await _imported_event(db_session, test_annotation_task, tag)
    first, second = str(uuid.uuid4()), str(uuid.uuid4())

    await _patch_box(auth_client, event.id, [0.6, 100.0, 1.5, 500.0], first)
    await _patch_box(auth_client, event.id, [0.7, 120.0, 1.4, 480.0], first)

    history = await _history(auth_client, test_annotation_task.id)
    (version,) = history.versions
    assert version.version_of_id == event.id
    assert _box(version) == [0.5, 100.0, 1.5, 500.0]
    assert [(t.value, t.confidence) for t in version.tags] == [(tag.value, 0.87)]
    assert (version.version_reason, version.edit_id, str(version.superseded_edit_id)) == ("edited", None, first)
    (live,) = history.live
    assert (live.id, str(live.edit_id)) == (event.id, first)

    # The next session keeps the state the first one left.
    await _patch_box(auth_client, event.id, [0.8, 120.0, 1.4, 480.0], second)
    await _patch_box(auth_client, event.id, [0.9, 120.0, 1.4, 480.0], second)
    history = await _history(auth_client, test_annotation_task.id)
    assert [_box(v) for v in history.versions] == [[0.5, 100.0, 1.5, 500.0], [0.7, 120.0, 1.4, 480.0]]
    assert str(history.versions[1].edit_id) == first


@pytest.mark.asyncio
async def test_edits_without_change_leave_no_version(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    species_tag,
    test_annotation_task: schemas.AnnotationTask,
):
    tag = await species_tag()
    event = await _imported_event(db_session, test_annotation_task, tag)
    # Saved without moving it.
    await _patch_box(auth_client, event.id, BOX["coordinates"], str(uuid.uuid4()))
    assert (await _history(auth_client, test_annotation_task.id)).versions == []


@pytest.mark.asyncio
async def test_versions_stay_out_of_queries(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    species_tag,
    test_annotation_project: schemas.AnnotationProject,
    test_annotation_task: schemas.AnnotationTask,
):
    old, new = await species_tag(), await species_tag()
    event = await _imported_event(db_session, test_annotation_task, old)
    session_id = str(uuid.uuid4())
    await _tag(auth_client, "DELETE", event.id, old, session_id)
    await _tag(auth_client, "POST", event.id, new, session_id)
    assert len((await _history(auth_client, test_annotation_task.id)).versions) == 1

    response = await auth_client.get(
        "/api/v1/annotation_tasks/detail/",
        params={"annotation_task_id": test_annotation_task.id, "include_sound_event_annotations": True},
    )
    assert response.status_code == 200, response.text
    assert [e["id"] for e in response.json()["sound_event_annotations"]] == [event.id]

    response = await auth_client.get(
        "/api/v1/sound_event_annotations/", params={"task__eq": test_annotation_task.id}
    )
    assert response.status_code == 200, response.text
    assert response.json()["total"] == 1

    response = await auth_client.get(
        "/api/v1/annotation_projects/detail/species_counts/",
        params={"annotation_project_id": test_annotation_project.id},
    )
    assert response.status_code == 200, response.text
    counts = {item["value"]: item["count"] for item in response.json()}
    assert old.value not in counts
    assert counts[new.value] == 1


@pytest.mark.asyncio
async def test_created_event_gets_versions_from_the_next_session(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    species_tag,
    test_annotation_task: schemas.AnnotationTask,
):
    tag = await species_tag()
    first, second = str(uuid.uuid4()), str(uuid.uuid4())
    response = await auth_client.post(
        "/api/v1/sound_event_annotations/",
        params={"annotation_task_id": test_annotation_task.id},
        json={"geometry": BOX, "tags": [{"key": tag.key, "value": tag.value}]},
        headers=_headers(first),
    )
    assert response.status_code == 200, response.text
    event_id = response.json()["id"]

    # Edits in the session that created it need no version: it didn't exist before.
    await _patch_box(auth_client, event_id, [0.6, 100.0, 1.5, 500.0], first)
    history = await _history(auth_client, test_annotation_task.id)
    assert history.versions == []
    assert [str(live.edit_id) for live in history.live] == [first]

    await _patch_box(auth_client, event_id, [0.7, 100.0, 1.5, 500.0], second)
    (version,) = (await _history(auth_client, test_annotation_task.id)).versions
    assert (_box(version)[0], str(version.edit_id), [t.value for t in version.tags]) == (0.6, first, [tag.value])


@pytest.mark.asyncio
async def test_created_and_deleted_in_one_session_leaves_nothing(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    species_tag,
    test_annotation_task: schemas.AnnotationTask,
):
    tag = await species_tag()
    session_id = str(uuid.uuid4())
    response = await auth_client.post(
        "/api/v1/sound_event_annotations/",
        params={"annotation_task_id": test_annotation_task.id},
        json={"geometry": BOX, "tags": [{"key": tag.key, "value": tag.value}]},
        headers=_headers(session_id),
    )
    assert response.status_code == 200, response.text
    await _delete(auth_client, response.json()["id"], session_id)

    history = await _history(auth_client, test_annotation_task.id)
    assert (history.versions, history.live) == ([], [])


@pytest.mark.asyncio
async def test_deleted_event_keeps_its_last_state(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    species_tag,
    test_annotation_task: schemas.AnnotationTask,
):
    tag = await species_tag()
    edited = await _imported_event(db_session, test_annotation_task, tag)
    untouched = await _imported_event(db_session, test_annotation_task, tag)
    session_id = str(uuid.uuid4())

    # Moved, then deleted in the same session: the state before the session is the last one.
    await _patch_box(auth_client, edited.id, [0.6, 100.0, 1.5, 500.0], session_id)
    await _delete(auth_client, edited.id, session_id)
    await _delete(auth_client, untouched.id, str(uuid.uuid4()))

    history = await _history(auth_client, test_annotation_task.id)
    by_event = {v.version_of_id: v for v in history.versions}
    assert set(by_event) == {edited.id, untouched.id}
    assert [v.version_reason for v in history.versions] == ["deleted", "deleted"]
    assert _box(by_event[edited.id])[0] == 0.5
    assert by_event[untouched.id].tags[0].confidence == 0.87
    assert history.live == []


@pytest.mark.asyncio
async def test_bulk_replace_creates_versions(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    species_tag,
    test_annotation_project: schemas.AnnotationProject,
    test_annotation_task: schemas.AnnotationTask,
):
    old = await species_tag()
    first = await _imported_event(db_session, test_annotation_task, old, confidence=0.4)
    second = await _imported_event(db_session, test_annotation_task, old, confidence=0.6)
    new_value = f"Species {uuid.uuid4().hex[:8]}"

    response = await auth_client.post(
        "/api/v1/annotation_tasks/bulk/sound_event_tags/replace/",
        params={"annotation_project__eq": test_annotation_project.id},
        json={
            "annotation_task_ids": [test_annotation_task.id],
            "old_tag": {"key": old.key, "value": old.value},
            "new_tag": {"key": "species", "value": new_value},
        },
    )
    assert response.status_code == 200, response.text

    history = await _history(auth_client, test_annotation_task.id)
    by_event = {v.version_of_id: v for v in history.versions}
    assert set(by_event) == {first.id, second.id}
    assert [(t.value, t.confidence) for t in by_event[first.id].tags] == [(old.value, 0.4)]
    assert len({v.superseded_edit_id for v in history.versions}) == 1


@pytest.mark.asyncio
async def test_tag_merge_moves_version_tags(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    species_tag,
    test_annotation_task: schemas.AnnotationTask,
):
    typo, target, other = await species_tag(), await species_tag(), await species_tag()
    event = await _imported_event(db_session, test_annotation_task, typo)
    session_id = str(uuid.uuid4())
    await _tag(auth_client, "DELETE", event.id, typo, session_id)
    await _tag(auth_client, "POST", event.id, other, session_id)

    response = await auth_client.post(
        "/api/v1/tags/merge/",
        json={"source_tag_ids": [typo.id], "target_tag_id": target.id},
    )
    assert response.status_code == 200, response.text

    (version,) = (await _history(auth_client, test_annotation_task.id)).versions
    assert [t.value for t in version.tags] == [target.value]


@pytest.mark.asyncio
async def test_project_stats_compare_edits_with_versions(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    species_tag,
    test_annotation_project: schemas.AnnotationProject,
    test_annotation_task: schemas.AnnotationTask,
    test_user,
):
    from soundevent import data

    kept, relabeled, deleted, new = [await species_tag() for _ in range(4)]
    await _imported_event(db_session, test_annotation_task, kept)
    to_relabel = await _imported_event(db_session, test_annotation_task, relabeled)
    to_delete = await _imported_event(db_session, test_annotation_task, deleted)

    session_id = str(uuid.uuid4())
    await _tag(auth_client, "DELETE", to_relabel.id, relabeled, session_id)
    await _tag(auth_client, "POST", to_relabel.id, new, session_id)
    response = await auth_client.delete(
        "/api/v1/sound_event_annotations/detail/",
        params={"sound_event_annotation_id": to_delete.id},
    )
    assert response.status_code == 200, response.text

    async def stats() -> schemas.PredictionHistoryStats:
        response = await auth_client.get(
            "/api/v1/annotation_projects/detail/prediction_history/",
            params={"annotation_project_id": test_annotation_project.id},
        )
        assert response.status_code == 200, response.text
        return schemas.PredictionHistoryStats.model_validate(response.json())

    # Only completed or verified tasks count.
    assert (await stats()).reviewed_tasks == 0
    assert (await stats()).species == []

    db_session.add(
        models.AnnotationStatusBadge(
            annotation_task_id=test_annotation_task.id, state=data.AnnotationState.completed, user_id=test_user.id
        )
    )
    await db_session.commit()

    result = await stats()
    by_value = {s.value: s for s in result.species}
    assert by_value[kept.value].confirmed == 1
    assert by_value[relabeled.value].relabeled == 1
    assert [t.value for t in by_value[relabeled.value].relabeled_to] == [new.value]
    assert by_value[deleted.value].event_deleted == 1
    assert (result.reviewed_tasks, result.predicted_events, result.edited_events) == (1, 3, 2)
    assert result.added == []
    assert result.backfill is None


@pytest.mark.asyncio
async def test_project_stats_read_older_relabels_from_confidence_names(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    species_tag,
    test_annotation_project: schemas.AnnotationProject,
    test_annotation_task: schemas.AnnotationTask,
    test_user,
):
    """Edits from before the history may keep the confidence, which still names the predicted species."""
    from soundevent import data

    predicted, chosen = await species_tag(), await species_tag()
    event = await _imported_event(db_session, test_annotation_task, predicted)
    # The relabel as older Sonari versions stored it: no version, confidence kept.
    await api.sound_event_annotations.remove_tag(db_session, event, predicted)
    await api.sound_event_annotations.add_tag(db_session, event, chosen)
    db_session.add(
        models.AnnotationStatusBadge(
            annotation_task_id=test_annotation_task.id, state=data.AnnotationState.verified, user_id=test_user.id
        )
    )
    await db_session.commit()

    response = await auth_client.get(
        "/api/v1/annotation_projects/detail/prediction_history/",
        params={"annotation_project_id": test_annotation_project.id},
    )
    assert response.status_code == 200, response.text
    stats = schemas.PredictionHistoryStats.model_validate(response.json())
    (entry,) = stats.species
    assert (entry.value, entry.predicted, entry.relabeled) == (predicted.value, 1, 1)
    assert [t.value for t in entry.relabeled_to] == [chosen.value]
    assert stats.edited_events == 1


@pytest.mark.asyncio
async def test_loaded_sound_events_can_be_pickled(
    db_session: AsyncSession,
    species_tag,
    test_annotation_task: schemas.AnnotationTask,
):
    """The API's shared cache pickles loaded objects, which carry the live-event filter."""
    import pickle

    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    event = await _imported_event(db_session, test_annotation_task, await species_tag())
    loaded = (
        await db_session.scalars(
            select(models.SoundEventAnnotation)
            .where(models.SoundEventAnnotation.id == event.id)
            .options(selectinload(models.SoundEventAnnotation.tags))
        )
    ).one()
    assert pickle.loads(pickle.dumps(loaded)).id == event.id

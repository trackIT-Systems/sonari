"""Tests for the original state and edit history of sound events."""

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
    """An event written the way ecohub writes it: through the API, without a history row."""
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


@pytest.mark.asyncio
async def test_resizes_in_one_session_merge_and_keep_the_original(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    species_tag,
    test_annotation_task: schemas.AnnotationTask,
):
    tag = await species_tag()
    event = await _imported_event(db_session, test_annotation_task, tag)
    session_id = str(uuid.uuid4())

    await _patch_box(auth_client, event.id, [0.6, 100.0, 1.5, 500.0], session_id)
    await _patch_box(auth_client, event.id, [0.7, 120.0, 1.4, 480.0], session_id)

    history = await _history(auth_client, test_annotation_task.id)
    (original,) = history.originals
    assert original.sound_event_annotation_id == event.id
    assert (original.start_time, original.end_time, original.low_freq, original.high_freq) == (0.5, 1.5, 100.0, 500.0)
    assert [(t.tag_value, t.confidence) for t in original.tags] == [(tag.value, 0.87)]

    (change,) = history.changes
    assert change.action == "geometry_changed"
    assert (change.old_start_time, change.old_low_freq) == (0.5, 100.0)
    assert (change.new_start_time, change.new_end_time, change.new_low_freq, change.new_high_freq) == (
        0.7,
        1.4,
        120.0,
        480.0,
    )
    assert change.updated_on is not None

    # A new session is a new row; resizing back to where it started cancels it.
    second = str(uuid.uuid4())
    await _patch_box(auth_client, event.id, [0.8, 120.0, 1.4, 480.0], second)
    await _patch_box(auth_client, event.id, [0.7, 120.0, 1.4, 480.0], second)
    history = await _history(auth_client, test_annotation_task.id)
    assert len(history.changes) == 1
    assert len(history.originals) == 1


@pytest.mark.asyncio
async def test_remove_and_add_in_one_session_is_a_replacement(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    species_tag,
    test_annotation_task: schemas.AnnotationTask,
):
    old, new = await species_tag(), await species_tag()
    event = await _imported_event(db_session, test_annotation_task, old)
    session_id = str(uuid.uuid4())

    await _tag(auth_client, "DELETE", event.id, old, session_id)
    await _tag(auth_client, "POST", event.id, new, session_id)

    history = await _history(auth_client, test_annotation_task.id)
    (change,) = history.changes
    assert change.action == "tag_replaced"
    assert (change.old_tag_id, change.old_tag_value) == (old.id, old.value)
    assert (change.new_tag_id, change.new_tag_value) == (new.id, new.value)
    # The confidence the edit deleted is kept in the original.
    assert [t.confidence for t in history.originals[0].tags] == [0.87]

    # Replacing back to the original tag in the same session leaves no change.
    await _tag(auth_client, "DELETE", event.id, new, session_id)
    await _tag(auth_client, "POST", event.id, old, session_id)
    assert (await _history(auth_client, test_annotation_task.id)).changes == []


@pytest.mark.asyncio
async def test_tags_with_unrelated_keys_are_not_paired(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    species_tag,
    test_annotation_task: schemas.AnnotationTask,
    test_tag: schemas.Tag,
):
    species = await species_tag()
    event = await _imported_event(db_session, test_annotation_task, species)
    session_id = str(uuid.uuid4())

    await _tag(auth_client, "DELETE", event.id, species, session_id)
    await _tag(auth_client, "POST", event.id, test_tag, session_id)

    actions = [c.action for c in (await _history(auth_client, test_annotation_task.id)).changes]
    assert actions == ["tag_removed", "tag_added"]


@pytest.mark.asyncio
async def test_requests_without_session_are_separate_edits(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    species_tag,
    test_annotation_task: schemas.AnnotationTask,
):
    old, new = await species_tag(), await species_tag()
    event = await _imported_event(db_session, test_annotation_task, old)

    for method, tag in (("DELETE", old), ("POST", new)):
        response = await auth_client.request(
            method,
            "/api/v1/sound_event_annotations/detail/tags/",
            params={"sound_event_annotation_id": event.id, "key": tag.key, "value": tag.value},
        )
        assert response.status_code == 200, response.text

    changes = (await _history(auth_client, test_annotation_task.id)).changes
    assert [c.action for c in changes] == ["tag_removed", "tag_added"]
    assert changes[0].edit_id != changes[1].edit_id


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
    event_id = response.json()["id"]

    history = await _history(auth_client, test_annotation_task.id)
    assert [c.action for c in history.changes] == ["created", "tag_added"]

    # Edits to an event created in Sonari don't copy an original.
    await _patch_box(auth_client, event_id, [0.6, 100.0, 1.5, 500.0], session_id)
    history = await _history(auth_client, test_annotation_task.id)
    assert history.originals == []
    assert history.changes[0].new_start_time == 0.6

    response = await auth_client.delete(
        "/api/v1/sound_event_annotations/detail/",
        params={"sound_event_annotation_id": event_id},
        headers=_headers(session_id),
    )
    assert response.status_code == 200, response.text
    # Created, tagged and deleted within one session: no net change.
    assert (await _history(auth_client, test_annotation_task.id)).changes == []


@pytest.mark.asyncio
async def test_deleted_imported_event_keeps_its_history(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    species_tag,
    test_annotation_task: schemas.AnnotationTask,
):
    tag = await species_tag()
    event = await _imported_event(db_session, test_annotation_task, tag)
    session_id = str(uuid.uuid4())

    await _patch_box(auth_client, event.id, [0.6, 100.0, 1.5, 500.0], session_id)
    response = await auth_client.delete(
        "/api/v1/sound_event_annotations/detail/",
        params={"sound_event_annotation_id": event.id},
        headers=_headers(session_id),
    )
    assert response.status_code == 200, response.text

    history = await _history(auth_client, test_annotation_task.id)
    assert [o.sound_event_annotation_id for o in history.originals] == [event.id]
    (change,) = history.changes
    assert change.action == "deleted"
    # The box before the session started, not the intermediate one.
    assert change.old_start_time == 0.5


@pytest.mark.asyncio
async def test_bulk_replace_records_replacements_and_originals(
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
    by_event = {o.sound_event_annotation_id: o for o in history.originals}
    assert set(by_event) == {first.id, second.id}
    assert by_event[first.id].tags[0].confidence == 0.4
    assert {(c.sound_event_annotation_id, c.action, c.old_tag_value, c.new_tag_value) for c in history.changes} == {
        (first.id, "tag_replaced", old.value, new_value),
        (second.id, "tag_replaced", old.value, new_value),
    }
    assert len({c.edit_id for c in history.changes}) == 1


@pytest.mark.asyncio
async def test_tag_merge_moves_history_to_the_surviving_tag(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    species_tag,
    test_annotation_task: schemas.AnnotationTask,
):
    typo = await species_tag()
    target = await species_tag()
    other = await species_tag()
    event = await _imported_event(db_session, test_annotation_task, typo)
    session_id = str(uuid.uuid4())
    await _tag(auth_client, "DELETE", event.id, typo, session_id)
    await _tag(auth_client, "POST", event.id, other, session_id)

    response = await auth_client.post(
        "/api/v1/tags/merge/",
        json={"source_tag_ids": [typo.id], "target_tag_id": target.id},
    )
    assert response.status_code == 200, response.text

    history = await _history(auth_client, test_annotation_task.id)
    (change,) = history.changes
    assert (change.old_tag_id, change.old_tag_value) == (target.id, typo.value)
    assert history.originals[0].tags[0].tag_id == target.id
    assert history.originals[0].tags[0].tag_value == typo.value


@pytest.mark.asyncio
async def test_project_stats_compare_edits_with_originals(
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
    # The relabel as older Sonari versions stored it: no original, confidence kept.
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

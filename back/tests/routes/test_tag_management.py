"""Tests for tag management: groups, presets, merging and project tag scopes."""

import uuid

import pytest
from httpx import AsyncClient

from sonari import api, schemas


def _unique(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:8]}"


async def _create_tag(auth_client: AsyncClient, key: str, value: str, **params) -> dict:
    response = await auth_client.post("/api/v1/tags/", json={"key": key, "value": value}, params=params)
    assert response.status_code == 200, response.text
    return response.json()


async def _tag_detail(auth_client: AsyncClient, key: str) -> list[dict]:
    response = await auth_client.get("/api/v1/tags/manage/", params={"search": key, "limit": 100})
    assert response.status_code == 200, response.text
    return [t for t in response.json()["items"] if t["key"] == key]


async def _create_project(auth_client: AsyncClient, name: str) -> dict:
    response = await auth_client.post(
        "/api/v1/annotation_projects/",
        json={"name": name, "description": "tag scope test"},
    )
    assert response.status_code == 200, response.text
    return response.json()


async def _groups(auth_client: AsyncClient) -> dict[str, dict]:
    response = await auth_client.get("/api/v1/tags/groups/")
    assert response.status_code == 200, response.text
    return {g["name"]: g for g in response.json()}


@pytest.mark.asyncio
async def test_default_groups_are_seeded(auth_client: AsyncClient):
    groups = await _groups(auth_client)
    assert {"Bat", "Bird", "Amphibian", "Cricket"} <= set(groups)
    assert "yolobat" in groups["Bat"]["project_keywords"]
    assert "birdedge" in groups["Bird"]["project_keywords"]


@pytest.mark.asyncio
async def test_group_crud(auth_client: AsyncClient):
    name = _unique("Grasshopper")
    response = await auth_client.post(
        "/api/v1/tags/groups/",
        json={"name": name, "project_keywords": ["Hopper", " insect "]},
    )
    assert response.status_code == 200, response.text
    group = response.json()
    assert group["project_keywords"] == ["hopper", "insect"]

    duplicate = await auth_client.post("/api/v1/tags/groups/", json={"name": name.upper()})
    assert duplicate.status_code == 409

    response = await auth_client.patch(
        "/api/v1/tags/groups/detail/",
        params={"tag_group_id": group["id"]},
        json={"project_keywords": ["orthoptera2"]},
    )
    assert response.status_code == 200, response.text
    assert response.json()["project_keywords"] == ["orthoptera2"]

    response = await auth_client.delete("/api/v1/tags/groups/detail/", params={"tag_group_id": group["id"]})
    assert response.status_code == 200, response.text
    assert name not in await _groups(auth_client)


@pytest.mark.asyncio
async def test_assign_group_and_filter_manage_list(auth_client: AsyncClient):
    key = _unique("species")
    await _create_tag(auth_client, key, "Myotis myotis")
    await _create_tag(auth_client, key, "Turdus merula")
    tags = {t["value"]: t for t in await _tag_detail(auth_client, key)}
    bat = (await _groups(auth_client))["Bat"]

    response = await auth_client.post(
        "/api/v1/tags/assign_group/",
        json={"tag_ids": [tags["Myotis myotis"]["id"]], "group_id": bat["id"]},
    )
    assert response.status_code == 200, response.text
    assert response.json() == 1

    in_bat = await auth_client.get("/api/v1/tags/manage/", params={"search": key, "group": bat["id"]})
    assert [t["value"] for t in in_bat.json()["items"]] == ["Myotis myotis"]

    ungrouped = await auth_client.get("/api/v1/tags/manage/", params={"search": key, "group": "none"})
    assert [t["value"] for t in ungrouped.json()["items"]] == ["Turdus merula"]


@pytest.mark.asyncio
async def test_project_scope_detected_from_name_filters_tag_search(auth_client: AsyncClient):
    key = _unique("species")
    groups = await _groups(auth_client)
    bat_tag = await _create_tag(auth_client, key, "Nyctalus noctula")
    bird_tag = await _create_tag(auth_client, key, "Erithacus rubecula")
    general_tag = await _create_tag(auth_client, key, "unknown")
    details = {t["value"]: t["id"] for t in await _tag_detail(auth_client, key)}
    await auth_client.post(
        "/api/v1/tags/assign_group/",
        json={"tag_ids": [details[bat_tag["value"]]], "group_id": groups["Bat"]["id"]},
    )
    await auth_client.post(
        "/api/v1/tags/assign_group/",
        json={"tag_ids": [details[bird_tag["value"]]], "group_id": groups["Bird"]["id"]},
    )

    project = await _create_project(auth_client, _unique("default-yolobat11 yolobat11"))
    scope = await auth_client.get(
        "/api/v1/annotation_projects/detail/tag_scope/",
        params={"annotation_project_id": project["id"]},
    )
    assert scope.status_code == 200, scope.text
    assert scope.json()["scope"] == "auto"
    assert scope.json()["group"]["name"] == "Bat"

    response = await auth_client.get(
        "/api/v1/tags/",
        params={"key__eq": key, "annotation_project_id": project["id"]},
    )
    assert response.status_code == 200, response.text
    values = {t["value"] for t in response.json()["items"]}
    assert values == {bat_tag["value"], general_tag["value"]}

    # Without a project every tag is visible.
    response = await auth_client.get("/api/v1/tags/", params={"key__eq": key})
    assert len(response.json()["items"]) == 3

    # A tag created in the project joins the project's group.
    created = await _create_tag(auth_client, key, "Myotis nattereri", annotation_project_id=project["id"])
    assert created["group_id"] == groups["Bat"]["id"]


@pytest.mark.asyncio
async def test_project_scope_explicit_group_and_all(auth_client: AsyncClient):
    groups = await _groups(auth_client)
    project = await _create_project(auth_client, _unique("birdedge"))

    response = await auth_client.patch(
        "/api/v1/annotation_projects/detail/",
        params={"annotation_project_id": project["id"]},
        json={"tag_scope": "group", "tag_group_id": groups["Cricket"]["id"]},
    )
    assert response.status_code == 200, response.text
    scope = await auth_client.get(
        "/api/v1/annotation_projects/detail/tag_scope/",
        params={"annotation_project_id": project["id"]},
    )
    assert scope.json()["scope"] == "group"
    assert scope.json()["group"]["name"] == "Cricket"

    response = await auth_client.patch(
        "/api/v1/annotation_projects/detail/",
        params={"annotation_project_id": project["id"]},
        json={"tag_scope": "all"},
    )
    assert response.status_code == 200, response.text
    scope = await auth_client.get(
        "/api/v1/annotation_projects/detail/tag_scope/",
        params={"annotation_project_id": project["id"]},
    )
    assert scope.json() == {"scope": "all", "group": None, "preset": None}

    invalid = await auth_client.patch(
        "/api/v1/annotation_projects/detail/",
        params={"annotation_project_id": project["id"]},
        json={"tag_scope": "preset", "tag_preset_id": None},
    )
    assert invalid.status_code == 422


@pytest.mark.asyncio
async def test_preset_crud_and_project_scope(auth_client: AsyncClient):
    key = _unique("species")
    groups = await _groups(auth_client)
    for value in ["Myotis myotis", "Myotis daubentonii", "Rousettus aegyptiacus"]:
        await _create_tag(auth_client, key, value)
    details = {t["value"]: t["id"] for t in await _tag_detail(auth_client, key)}
    await auth_client.post(
        "/api/v1/tags/assign_group/",
        json={"tag_ids": list(details.values()), "group_id": groups["Bat"]["id"]},
    )

    name = _unique("German Bats")
    response = await auth_client.post(
        "/api/v1/tags/presets/",
        json={
            "name": name,
            "description": "Bats native to Germany",
            "group_id": groups["Bat"]["id"],
            "tag_ids": [details["Myotis myotis"], details["Myotis daubentonii"]],
        },
    )
    assert response.status_code == 200, response.text
    preset = response.json()
    assert [t["value"] for t in preset["tags"]] == ["Myotis daubentonii", "Myotis myotis"]

    project = await _create_project(auth_client, _unique("bat survey"))
    response = await auth_client.patch(
        "/api/v1/annotation_projects/detail/",
        params={"annotation_project_id": project["id"]},
        json={"tag_scope": "preset", "tag_preset_id": preset["id"]},
    )
    assert response.status_code == 200, response.text

    response = await auth_client.get(
        "/api/v1/tags/",
        params={"key__eq": key, "annotation_project_id": project["id"]},
    )
    assert {t["value"] for t in response.json()["items"]} == {"Myotis myotis", "Myotis daubentonii"}

    response = await auth_client.patch(
        "/api/v1/tags/presets/detail/",
        params={"tag_preset_id": preset["id"]},
        json={"tag_ids": [details["Rousettus aegyptiacus"]]},
    )
    assert response.status_code == 200, response.text
    assert [t["value"] for t in response.json()["tags"]] == ["Rousettus aegyptiacus"]

    response = await auth_client.delete("/api/v1/tags/presets/detail/", params={"tag_preset_id": preset["id"]})
    assert response.status_code == 200, response.text

    # The project falls back to auto detection once its preset is gone.
    scope = await auth_client.get(
        "/api/v1/annotation_projects/detail/tag_scope/",
        params={"annotation_project_id": project["id"]},
    )
    assert scope.json()["scope"] == "auto"
    assert scope.json()["group"]["name"] == "Bat"


@pytest.mark.asyncio
async def test_merge_tags_moves_annotations_and_removes_duplicates(
    auth_client: AsyncClient,
    db_session,
    test_annotation_project: schemas.AnnotationProject,
    test_annotation_task: schemas.AnnotationTask,
):
    key = _unique("species")
    target = {"key": key, "value": "Pipistrellus pipistrellus"}
    typo = {"key": key, "value": "Pipistrelus pipistrellus"}
    other = {"key": key, "value": "Pip. pipistrellus"}

    for tag in (target, typo, other):
        await _create_tag(auth_client, tag["key"], tag["value"])

    # SEA 1 has only the typo; SEA 2 has both the target and the typo.
    for tags in ([typo], [target, typo], [other]):
        response = await auth_client.post(
            "/api/v1/sound_event_annotations/",
            params={"annotation_task_id": test_annotation_task.id},
            json={"geometry": {"type": "TimeInterval", "coordinates": [0.1, 0.2]}, "tags": tags},
        )
        assert response.status_code in [200, 201], response.text

    response = await auth_client.post(
        "/api/v1/annotation_tasks/detail/tags/",
        params={"annotation_task_id": test_annotation_task.id},
        json=other,
    )
    assert response.status_code in [200, 201], response.text

    details = {t["value"]: t for t in await _tag_detail(auth_client, key)}
    assert details[target["value"]]["sound_event_count"] == 1
    assert details[typo["value"]]["sound_event_count"] == 2
    assert details[other["value"]]["task_count"] == 1

    preset = (
        await auth_client.post(
            "/api/v1/tags/presets/",
            json={"name": _unique("preset"), "tag_ids": [details[typo["value"]]["id"]]},
        )
    ).json()

    response = await auth_client.post(
        "/api/v1/tags/merge/",
        json={
            "source_tag_ids": [details[typo["value"]]["id"], details[other["value"]]["id"]],
            "target_tag_id": details[target["value"]]["id"],
        },
    )
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["merged_tags"] == 2
    assert result["duplicates_removed"] == 1
    assert result["sound_event_tags_moved"] == 2
    assert result["task_tags_moved"] == 1
    assert result["target"]["sound_event_count"] == 3
    assert result["target"]["task_count"] == 1

    remaining = await _tag_detail(auth_client, key)
    assert [t["value"] for t in remaining] == [target["value"]]

    response = await auth_client.get("/api/v1/tags/presets/")
    merged_preset = next(p for p in response.json() if p["id"] == preset["id"])
    assert [t["value"] for t in merged_preset["tags"]] == [target["value"]]

    # The cached tag lookup no longer returns the deleted tag.
    with pytest.raises(Exception):
        await api.tags.get(db_session, (typo["key"], typo["value"]))


@pytest.mark.asyncio
async def test_merge_requires_a_distinct_source(auth_client: AsyncClient):
    key = _unique("species")
    await _create_tag(auth_client, key, "a")
    [tag] = await _tag_detail(auth_client, key)
    response = await auth_client.post(
        "/api/v1/tags/merge/",
        json={"source_tag_ids": [tag["id"]], "target_tag_id": tag["id"]},
    )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_non_superuser_can_manage_tags_but_not_merge(auth_client: AsyncClient, test_user):
    key = _unique("species")
    await _create_tag(auth_client, key, "a")
    await _create_tag(auth_client, key, "b")
    tags = await _tag_detail(auth_client, key)

    test_user.is_superuser = False
    try:
        response = await auth_client.post(
            "/api/v1/tags/merge/",
            json={"source_tag_ids": [tags[0]["id"]], "target_tag_id": tags[1]["id"]},
        )
        assert response.status_code == 403
        assert len(await _tag_detail(auth_client, key)) == 2

        group = await auth_client.post("/api/v1/tags/groups/", json={"name": _unique("Moth")})
        assert group.status_code == 200, group.text
        response = await auth_client.post(
            "/api/v1/tags/assign_group/",
            json={"tag_ids": [tags[0]["id"]], "group_id": group.json()["id"]},
        )
        assert response.status_code == 200, response.text
        response = await auth_client.post("/api/v1/tags/presets/", json={"name": _unique("mine")})
        assert response.status_code == 200, response.text
    finally:
        test_user.is_superuser = True


@pytest.mark.asyncio
async def test_create_tag_in_group_from_tags_page(auth_client: AsyncClient):
    key = _unique("species")
    groups = await _groups(auth_client)

    created = await _create_tag(auth_client, key, "Unknown moth", group_id=groups["Cricket"]["id"])
    assert created["group_id"] == groups["Cricket"]["id"]

    missing = await auth_client.post("/api/v1/tags/", json={"key": key, "value": "x"}, params={"group_id": 999999})
    assert missing.status_code == 404

    duplicate = await auth_client.post("/api/v1/tags/", json={"key": key, "value": "Unknown moth"})
    assert duplicate.status_code == 409


# ---------------------------------------------------------------------------
# Species catalog


@pytest.fixture
async def species_catalog(db_session):
    """Load the species catalog (the app lifespan, which does this, does not run in tests)."""
    await api.species_catalog.sync_species_catalog(db_session)
    await db_session.commit()


def test_catalog_names_are_unique_and_cover_ecohub_aliases():
    entries = api.species_catalog.load_catalog()
    by_scientific = {e["scientific"]: e for e in entries}
    assert by_scientific["Turdus merula"]["de"] == "Amsel"
    assert by_scientific["Turdus merula"]["group"] == "Bird"
    # YOLOBat short codes and ecohub's misspellings resolve to the right taxon.
    assert "Mbart" in by_scientific["Myotis mystacinus/brandtii"]["aliases"]
    assert "Eptesicus nilsonii" in by_scientific["Eptesicus nilssonii"]["aliases"]
    assert {e["group"] for e in entries} == {"Bat", "Bird", "Amphibian", "Cricket"}


@pytest.mark.asyncio
async def test_created_tag_is_linked_to_species_and_group(auth_client: AsyncClient, species_catalog):
    key = _unique("species")
    groups = await _groups(auth_client)
    project = await _create_project(auth_client, _unique("bat survey"))

    # The catalog group wins over the project's group.
    created = await _create_tag(auth_client, key, "amsel", annotation_project_id=project["id"])
    assert created["group_id"] == groups["Bird"]["id"]
    assert created["species_id"] is not None

    await _create_tag(auth_client, key, "Turdus merula")
    await _create_tag(auth_client, key, "Mbart")

    # Searching by German name finds the Latin tag too.
    response = await auth_client.get("/api/v1/tags/manage/", params={"search": "Amsel", "limit": 100})
    values = {t["value"]: t for t in response.json()["items"] if t["key"] == key}
    assert set(values) == {"amsel", "Turdus merula"}
    assert values["Turdus merula"]["species"]["name_de"] == "Amsel"

    [mbart] = [t for t in await _tag_detail(auth_client, key) if t["value"] == "Mbart"]
    assert mbart["species"]["scientific_name"] == "Myotis mystacinus/brandtii"
    assert mbart["group_id"] == groups["Bat"]["id"]

    response = await auth_client.get("/api/v1/tags/species/duplicates/")
    assert response.status_code == 200, response.text
    blackbird = next(d for d in response.json() if d["species"]["scientific_name"] == "Turdus merula")
    assert {t["value"] for t in blackbird["tags"] if t["key"] == key} == {"amsel", "Turdus merula"}


@pytest.mark.asyncio
async def test_sync_links_existing_tags_but_keeps_manual_groups(
    auth_client: AsyncClient,
    db_session,
    test_user,
    species_catalog,
):
    from sqlalchemy import update

    from sonari import models

    key = _unique("species")
    # Tags created before the catalog existed: no species, no group.
    for value in ["Zilpzalp", "Rana temporaria", "not a species"]:
        db_session.add(models.Tag(key=key, value=value, created_by_id=test_user.id))
    await db_session.commit()
    groups = await _groups(auth_client)
    # A group chosen by hand is kept.
    await db_session.execute(
        update(models.Tag)
        .where(models.Tag.key == key, models.Tag.value == "Rana temporaria")
        .values(group_id=groups["Cricket"]["id"])
    )
    await db_session.commit()

    # What the server runs on startup.
    tags_linked, _ = await api.species_catalog.sync_species_catalog(db_session)
    await db_session.commit()
    assert tags_linked >= 2

    details = {t["value"]: t for t in await _tag_detail(auth_client, key)}
    assert details["Zilpzalp"]["group_id"] == groups["Bird"]["id"]
    assert details["Zilpzalp"]["species"]["scientific_name"] == "Phylloscopus collybita"
    assert details["Rana temporaria"]["group_id"] == groups["Cricket"]["id"]
    assert details["Rana temporaria"]["species"]["name_de"] == "Grasfrosch"
    assert details["not a species"]["species"] is None

    # Running it again changes nothing.
    assert await api.species_catalog.sync_species_catalog(db_session) == (0, 0)


@pytest.mark.asyncio
async def test_preset_tags_skip_usage_counts(auth_client: AsyncClient, test_annotation_task):
    key = _unique("species")
    tag = await _create_tag(auth_client, key, "Parus major")
    await auth_client.post(
        "/api/v1/annotation_tasks/detail/tags/",
        params={"annotation_task_id": test_annotation_task.id},
        json=tag,
    )
    [detail] = await _tag_detail(auth_client, key)
    assert detail["task_count"] == 1

    preset = (
        await auth_client.post("/api/v1/tags/presets/", json={"name": _unique("p"), "tag_ids": [detail["id"]]})
    ).json()
    assert [t["value"] for t in preset["tags"]] == ["Parus major"]
    assert preset["tags"][0]["task_count"] == 0


# ---------------------------------------------------------------------------
# Keyboard shortcuts


async def _set_shortcut(auth_client: AsyncClient, shortcut: str, tag_id: int | None):
    response = await auth_client.put("/api/v1/tags/shortcuts/", json={"shortcut": shortcut, "tag_id": tag_id})
    assert response.status_code == 200, response.text
    return {t["shortcut"]: t for t in response.json()}


@pytest.mark.asyncio
async def test_shortcuts_are_unique_and_movable(auth_client: AsyncClient):
    key = _unique("species")
    for value in ["Ppip", "Nnoc"]:
        await _create_tag(auth_client, key, value)
    ids = {t["value"]: t["id"] for t in await _tag_detail(auth_client, key)}

    shortcuts = await _set_shortcut(auth_client, "1", ids["Ppip"])
    assert shortcuts["1"]["value"] == "Ppip"

    # Giving key 1 to another tag takes it away from the first.
    shortcuts = await _set_shortcut(auth_client, "1", ids["Nnoc"])
    assert shortcuts["1"]["value"] == "Nnoc"
    details = {t["value"]: t for t in await _tag_detail(auth_client, key)}
    assert details["Ppip"]["shortcut"] is None
    assert details["Nnoc"]["shortcut"] == "1"

    # Moving a tag to another key frees its old key.
    shortcuts = await _set_shortcut(auth_client, "0", ids["Nnoc"])
    assert "1" not in shortcuts and shortcuts["0"]["value"] == "Nnoc"

    # The tag search returns the key too.
    response = await auth_client.get("/api/v1/tags/", params={"key__eq": key})
    assert {t["value"]: t["shortcut"] for t in response.json()["items"]} == {"Ppip": None, "Nnoc": "0"}

    shortcuts = await _set_shortcut(auth_client, "0", None)
    assert "0" not in shortcuts

    invalid = await auth_client.put("/api/v1/tags/shortcuts/", json={"shortcut": "a", "tag_id": ids["Ppip"]})
    assert invalid.status_code == 422


@pytest.mark.asyncio
async def test_merge_keeps_source_shortcut(auth_client: AsyncClient):
    key = _unique("species")
    for value in ["Myotis", "Myotis spec"]:
        await _create_tag(auth_client, key, value)
    ids = {t["value"]: t["id"] for t in await _tag_detail(auth_client, key)}
    await _set_shortcut(auth_client, "7", ids["Myotis spec"])

    response = await auth_client.post(
        "/api/v1/tags/merge/",
        json={"source_tag_ids": [ids["Myotis spec"]], "target_tag_id": ids["Myotis"]},
    )
    assert response.status_code == 200, response.text
    assert response.json()["target"]["shortcut"] == "7"

"""Tests for api/common/utils.py - low-level CRUD and utility functions."""

import uuid

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from sonari import api, exceptions, models, schemas
from sonari.api.common.utils import (
    add_feature_to_object,
    create_object,
    create_objects,
    create_objects_without_duplicates,
    delete_object,
    get_count,
    get_object,
    get_objects,
    get_objects_from_query,
    get_or_create_object,
    get_sort_by_col_from_str,
    remove_feature_from_object,
    update_feature_on_object,
    update_object,
)

# ---------------------------------------------------------------------------
# get_object
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_object_success(db_session: AsyncSession, test_tag: schemas.Tag):
    """Test get_object returns object when found."""
    obj = await get_object(db_session, models.Tag, models.Tag.id == test_tag.id)
    assert obj is not None
    assert obj.id == test_tag.id
    assert obj.key == test_tag.key
    assert obj.value == test_tag.value


@pytest.mark.asyncio
async def test_get_object_not_found(db_session: AsyncSession):
    """Test get_object raises NotFoundError when object does not exist."""
    with pytest.raises(exceptions.NotFoundError, match="Tag.*was not found"):
        await get_object(db_session, models.Tag, models.Tag.id == 999999)


# ---------------------------------------------------------------------------
# find_object
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_find_object_with_condition(db_session: AsyncSession, test_tag: schemas.Tag):
    """Test find_object with column condition."""
    obj = await api.common.utils.find_object(
        db_session, models.Tag, [models.Tag.key == test_tag.key, models.Tag.value == test_tag.value]
    )
    assert obj is not None
    assert obj.id == test_tag.id


@pytest.mark.asyncio
async def test_find_object_not_found(db_session: AsyncSession):
    """Test find_object raises NotFoundError when no match."""
    with pytest.raises(exceptions.NotFoundError, match="Tag.*was not found"):
        await api.common.utils.find_object(
            db_session, models.Tag, [models.Tag.key == "nonexistent", models.Tag.value == "x"]
        )


# ---------------------------------------------------------------------------
# get_objects
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_objects_empty_model(db_session: AsyncSession):
    """Test get_objects returns empty list for model with no rows (e.g. fresh Dataset)."""
    # Use a filter that matches nothing to get empty result
    items, count = await get_objects(
        db_session, models.Tag, limit=10, filters=[models.Tag.key == "impossible_key_xyz"]
    )
    assert items == []
    assert count == 0


@pytest.mark.asyncio
async def test_get_objects_with_limit_offset(db_session: AsyncSession, test_tag: schemas.Tag):
    """Test get_objects respects limit and offset."""
    items, count = await get_objects(db_session, models.Tag, limit=5, offset=0)
    assert len(items) <= 5
    assert count >= 0

    items_offset, _ = await get_objects(db_session, models.Tag, limit=5, offset=1)
    # With offset 1, we may get different items
    assert len(items_offset) <= 5


@pytest.mark.asyncio
async def test_get_objects_with_filters(db_session: AsyncSession, test_tag: schemas.Tag):
    """Test get_objects with filters."""
    items, count = await get_objects(
        db_session, models.Tag, limit=100, filters=[models.Tag.key == test_tag.key]
    )
    assert all(t.key == test_tag.key for t in items)
    assert count >= 1


@pytest.mark.asyncio
async def test_get_objects_with_sort_by(db_session: AsyncSession):
    """Test get_objects with sort_by (asc and desc)."""
    items_asc, _ = await get_objects(db_session, models.Tag, limit=10, sort_by="key")
    items_desc, _ = await get_objects(db_session, models.Tag, limit=10, sort_by="-key")
    if len(items_asc) >= 2 and len(items_desc) >= 2:
        assert items_asc[0].key <= items_asc[-1].key
        assert items_desc[0].key >= items_desc[-1].key


# ---------------------------------------------------------------------------
# get_objects_from_query
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_objects_from_query_custom_query(db_session: AsyncSession, test_tag: schemas.Tag):
    """Test get_objects_from_query with custom query."""
    query = select(models.Tag).where(models.Tag.id == test_tag.id)
    result, count = await get_objects_from_query(db_session, models.Tag, query, limit=10)
    rows = result.unique().scalars().all()
    assert len(rows) == 1
    assert rows[0].id == test_tag.id
    assert count == 1


@pytest.mark.asyncio
async def test_get_objects_from_query_annotation_task_sort(
    db_session: AsyncSession,
    test_annotation_task: schemas.AnnotationTask,
):
    """Test get_objects_from_query with recording_datetime and duration sort (AnnotationTask)."""
    query = select(models.AnnotationTask).where(
        models.AnnotationTask.id == test_annotation_task.id
    )
    result, count = await get_objects_from_query(
        db_session, models.AnnotationTask, query, sort_by="recording_datetime", limit=10
    )
    rows = result.unique().scalars().all()
    assert len(rows) >= 1
    assert count >= 1

    result2, _ = await get_objects_from_query(
        db_session, models.AnnotationTask, query, sort_by="duration", limit=10
    )
    rows2 = result2.unique().scalars().all()
    assert len(rows2) >= 1


# ---------------------------------------------------------------------------
# get_count
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_count(db_session: AsyncSession, test_tag: schemas.Tag):
    """Test get_count returns correct count."""
    query = select(models.Tag).where(models.Tag.key == test_tag.key)
    count = await get_count(db_session, models.Tag, query)
    assert count >= 1
    assert isinstance(count, int)


# ---------------------------------------------------------------------------
# create_object
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_object_success(db_session: AsyncSession, test_user):
    """Test create_object creates and returns object."""
    tag_key = f"create_test_{uuid.uuid4().hex[:8]}"
    tag_value = "value"
    created_by = schemas.SimpleUser.model_validate(test_user)
    obj = await create_object(
        db_session,
        models.Tag,
        key=tag_key,
        value=tag_value,
        created_by_id=created_by.id,
    )
    assert obj is not None
    assert obj.key == tag_key
    assert obj.value == tag_value
    await db_session.commit()


@pytest.mark.asyncio
async def test_create_object_duplicate_error(db_session: AsyncSession, test_tag: schemas.Tag):
    """Test create_object raises DuplicateObjectError on unique violation."""
    created_by_id = test_tag.created_by_id if hasattr(test_tag, "created_by_id") else None
    with pytest.raises(exceptions.DuplicateObjectError, match="duplicate"):
        await create_object(
            db_session,
            models.Tag,
            key=test_tag.key,
            value=test_tag.value,
            created_by_id=created_by_id,
        )


# ---------------------------------------------------------------------------
# create_objects
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_objects_batch(db_session: AsyncSession, test_user):
    """Test create_objects inserts multiple objects."""
    created_by_id = test_user.id
    data = [
        {"key": f"batch_a_{uuid.uuid4().hex[:8]}", "value": "v1", "created_by_id": created_by_id},
        {"key": f"batch_b_{uuid.uuid4().hex[:8]}", "value": "v2", "created_by_id": created_by_id},
    ]
    await create_objects(db_session, models.Tag, data)
    await db_session.commit()
    # Verify by querying
    items, count = await get_objects(
        db_session, models.Tag, filters=[models.Tag.key.like("batch_%")], limit=10
    )
    assert count >= 2


# ---------------------------------------------------------------------------
# create_objects_without_duplicates
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_objects_without_duplicates_skips_existing(
    db_session: AsyncSession, test_tag: schemas.Tag, test_user
):
    """Test create_objects_without_duplicates skips existing, returns only created."""
    from sqlalchemy import tuple_

    created_by_id = test_user.id
    new_key = f"nodup_{uuid.uuid4().hex[:8]}"
    data = [
        {"key": test_tag.key, "value": test_tag.value, "created_by_id": created_by_id},
        {"key": new_key, "value": "newval", "created_by_id": created_by_id},
    ]

    def key_fn(d):
        return (d["key"], d["value"])

    created = await create_objects_without_duplicates(
        db_session,
        models.Tag,
        data,
        key=key_fn,
        key_column=tuple_(models.Tag.key, models.Tag.value),
        return_all=False,
    )
    await db_session.commit()
    # Should only create the new one
    assert len(created) == 1
    assert created[0].key == new_key


@pytest.mark.asyncio
async def test_create_objects_without_duplicates_return_all(
    db_session: AsyncSession, test_tag: schemas.Tag, test_user
):
    """Test create_objects_without_duplicates with return_all returns all matching."""
    from sqlalchemy import tuple_

    created_by_id = test_user.id
    new_key = f"returnall_{uuid.uuid4().hex[:8]}"
    data = [
        {"key": test_tag.key, "value": test_tag.value, "created_by_id": created_by_id},
        {"key": new_key, "value": "newval", "created_by_id": created_by_id},
    ]

    def key_fn(d):
        return (d["key"], d["value"])

    created = await create_objects_without_duplicates(
        db_session,
        models.Tag,
        data,
        key=key_fn,
        key_column=tuple_(models.Tag.key, models.Tag.value),
        return_all=True,
    )
    await db_session.commit()
    assert len(created) == 2


# ---------------------------------------------------------------------------
# update_object
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_update_object_partial(db_session: AsyncSession, test_tag: schemas.Tag):
    """Test update_object with partial update."""
    new_value = f"updated_{uuid.uuid4().hex[:8]}"
    updated = await update_object(
        db_session, models.Tag, models.Tag.id == test_tag.id, value=new_value
    )
    assert updated.value == new_value
    await db_session.commit()


# ---------------------------------------------------------------------------
# delete_object
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_delete_object_success(db_session: AsyncSession, test_user):
    """Test delete_object removes object."""
    tag = await api.tags.create(
        db_session,
        key=f"del_{uuid.uuid4().hex[:8]}",
        value="delval",
        created_by=schemas.SimpleUser.model_validate(test_user),
    )
    await db_session.commit()
    deleted = await delete_object(db_session, models.Tag, models.Tag.id == tag.id)
    assert deleted.id == tag.id
    await db_session.commit()
    with pytest.raises(exceptions.NotFoundError):
        await get_object(db_session, models.Tag, models.Tag.id == tag.id)


@pytest.mark.asyncio
async def test_delete_object_not_found(db_session: AsyncSession):
    """Test delete_object raises NotFoundError when object does not exist."""
    with pytest.raises(exceptions.NotFoundError):
        await delete_object(db_session, models.Tag, models.Tag.id == 999999)


# ---------------------------------------------------------------------------
# get_or_create_object
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_or_create_object_returns_existing(
    db_session: AsyncSession, test_tag: schemas.Tag
):
    """Test get_or_create_object returns existing when found."""
    from sonari.schemas.tags import TagCreate

    obj = await get_or_create_object(
        db_session,
        models.Tag,
        models.Tag.key == test_tag.key,
        TagCreate(key=test_tag.key, value=test_tag.value),
    )
    assert obj.id == test_tag.id


@pytest.mark.asyncio
async def test_get_or_create_object_creates_new(db_session: AsyncSession, test_user):
    """Test get_or_create_object creates when not found."""
    from sonari.schemas.tags import TagCreate

    key = f"goc_{uuid.uuid4().hex[:8]}"
    obj = await get_or_create_object(
        db_session,
        models.Tag,
        models.Tag.key == key,
        TagCreate(key=key, value="goc_value"),
    )
    assert obj.key == key
    await db_session.commit()


# ---------------------------------------------------------------------------
# add_feature_to_object / update_feature_on_object / remove_feature_from_object (Recording)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_add_feature_to_recording(
    db_session: AsyncSession, test_recording_id: int
):
    """Test add_feature_to_object adds feature to recording."""
    feat_name = f"test_feat_{uuid.uuid4().hex[:8]}"
    await add_feature_to_object(
        db_session,
        models.Recording,
        models.Recording.id == test_recording_id,
        feat_name,
        42.5,
    )
    await db_session.commit()
    rec = await get_object(
        db_session,
        models.Recording,
        models.Recording.id == test_recording_id,
        options=[selectinload(models.Recording.features)],
    )
    feat = next((f for f in rec.features if f.name == feat_name), None)
    assert feat is not None
    assert feat.value == 42.5


@pytest.mark.asyncio
async def test_update_feature_on_recording(
    db_session: AsyncSession, test_recording_id: int
):
    """Test update_feature_on_object updates existing feature."""
    feat_name = f"upd_feat_{uuid.uuid4().hex[:8]}"
    await add_feature_to_object(
        db_session,
        models.Recording,
        models.Recording.id == test_recording_id,
        feat_name,
        10.0,
    )
    await db_session.commit()
    await update_feature_on_object(
        db_session,
        models.Recording,
        models.Recording.id == test_recording_id,
        feat_name,
        99.0,
    )
    await db_session.commit()
    rec = await get_object(
        db_session,
        models.Recording,
        models.Recording.id == test_recording_id,
        options=[selectinload(models.Recording.features)],
    )
    feat = next((f for f in rec.features if f.name == feat_name), None)
    assert feat is not None
    assert feat.value == 99.0


@pytest.mark.asyncio
async def test_remove_feature_from_recording(
    db_session: AsyncSession, test_recording_id: int
):
    """Test remove_feature_from_object removes feature."""
    feat_name = f"rm_feat_{uuid.uuid4().hex[:8]}"
    await add_feature_to_object(
        db_session,
        models.Recording,
        models.Recording.id == test_recording_id,
        feat_name,
        1.0,
    )
    await db_session.commit()
    await remove_feature_from_object(
        db_session,
        models.Recording,
        models.Recording.id == test_recording_id,
        feat_name,
    )
    await db_session.commit()
    rec = await get_object(
        db_session,
        models.Recording,
        models.Recording.id == test_recording_id,
        options=[selectinload(models.Recording.features)],
    )
    feat = next((f for f in rec.features if f.name == feat_name), None)
    assert feat is None


# ---------------------------------------------------------------------------
# get_sort_by_col_from_str
# ---------------------------------------------------------------------------


def test_get_sort_by_col_from_str_valid_asc():
    """Test get_sort_by_col_from_str with valid column ascending."""
    col = get_sort_by_col_from_str(models.Tag, "key")
    assert col is not None


def test_get_sort_by_col_from_str_valid_desc():
    """Test get_sort_by_col_from_str with valid column descending."""
    col = get_sort_by_col_from_str(models.Tag, "-key")
    assert col is not None


def test_get_sort_by_col_from_str_invalid_raises():
    """Test get_sort_by_col_from_str raises for invalid column."""
    with pytest.raises(ValueError, match="does not have a column named"):
        get_sort_by_col_from_str(models.Tag, "nonexistent_column")

"""Tests for BaseAPI via TagAPI (composite PK implementation)."""

import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from sonari import api, exceptions, schemas

# ---------------------------------------------------------------------------
# get
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_tag_api_get_by_composite_pk(db_session: AsyncSession, test_tag: schemas.Tag):
    """Test TagAPI.get returns tag by composite (key, value) PK."""
    obj = await api.tags.get(db_session, (test_tag.key, test_tag.value))
    assert obj is not None
    assert obj.id == test_tag.id
    assert obj.key == test_tag.key
    assert obj.value == test_tag.value


@pytest.mark.asyncio
async def test_tag_api_get_not_found(db_session: AsyncSession):
    """Test TagAPI.get raises NotFoundError for non-existent tag."""
    with pytest.raises(exceptions.NotFoundError):
        await api.tags.get(db_session, ("nonexistent_key", "nonexistent_value"))


# ---------------------------------------------------------------------------
# get_many
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_tag_api_get_many_pagination(db_session: AsyncSession):
    """Test TagAPI.get_many with limit and offset."""
    items, count = await api.tags.get_many(db_session, limit=5, offset=0)
    assert len(items) <= 5
    assert count >= 0


@pytest.mark.asyncio
async def test_tag_api_get_many_with_filters(db_session: AsyncSession, test_tag: schemas.Tag):
    """Test TagAPI.get_many with filters."""
    from sonari import models

    items, count = await api.tags.get_many(
        db_session,
        limit=100,
        filters=[models.Tag.key == test_tag.key],
    )
    assert all(t.key == test_tag.key for t in items)
    assert count >= 1


@pytest.mark.asyncio
async def test_tag_api_get_many_with_sort_by(db_session: AsyncSession):
    """Test TagAPI.get_many with sort_by."""
    items_asc, _ = await api.tags.get_many(db_session, limit=10, sort_by="key")
    items_desc, _ = await api.tags.get_many(db_session, limit=10, sort_by="-key")
    if len(items_asc) >= 2 and len(items_desc) >= 2:
        assert items_asc[0].key <= items_asc[-1].key
        assert items_desc[0].key >= items_desc[-1].key


# ---------------------------------------------------------------------------
# create_from_data
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_tag_api_create_from_data(db_session: AsyncSession, test_user):
    """Test TagAPI.create_from_data returns schema."""
    created_by = schemas.SimpleUser.model_validate(test_user)
    obj = await api.tags.create(
        db_session,
        key=f"base_create_{uuid.uuid4().hex[:8]}",
        value="base_value",
        created_by=created_by,
    )
    assert obj is not None
    assert isinstance(obj, schemas.Tag)
    assert obj.key is not None
    assert obj.value == "base_value"
    await db_session.commit()


# ---------------------------------------------------------------------------
# create_many_without_duplicates
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_tag_api_create_many_without_duplicates_skips_existing(
    db_session: AsyncSession, test_tag: schemas.Tag, test_user
):
    """Test create_many_without_duplicates skips existing, returns only created."""
    created_by = schemas.SimpleUser.model_validate(test_user)
    new_key = f"nodup_{uuid.uuid4().hex[:8]}"
    data = [
        {"key": test_tag.key, "value": test_tag.value, "created_by_id": created_by.id},
        {"key": new_key, "value": "newval", "created_by_id": created_by.id},
    ]
    created = await api.tags.create_many_without_duplicates(db_session, data, return_all=False)
    await db_session.commit()
    assert len(created) == 1
    assert created[0].key == new_key


@pytest.mark.asyncio
async def test_tag_api_create_many_without_duplicates_return_all(
    db_session: AsyncSession, test_tag: schemas.Tag, test_user
):
    """Test create_many_without_duplicates with return_all returns all matching."""
    created_by = schemas.SimpleUser.model_validate(test_user)
    new_key = f"returnall_{uuid.uuid4().hex[:8]}"
    data = [
        {"key": test_tag.key, "value": test_tag.value, "created_by_id": created_by.id},
        {"key": new_key, "value": "newval", "created_by_id": created_by.id},
    ]
    created = await api.tags.create_many_without_duplicates(db_session, data, return_all=True)
    await db_session.commit()
    assert len(created) == 2


# ---------------------------------------------------------------------------
# update
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_tag_api_update_partial(db_session: AsyncSession, test_tag: schemas.Tag):
    """Test TagAPI.update with partial schema update."""
    new_value = f"updated_{uuid.uuid4().hex[:8]}"
    updated = await api.tags.update(
        db_session,
        test_tag,
        schemas.TagUpdate(value=new_value),
    )
    assert updated.value == new_value
    await db_session.commit()


# ---------------------------------------------------------------------------
# delete
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_tag_api_delete_removes_and_returns(db_session: AsyncSession, test_user):
    """Test TagAPI.delete removes object and returns schema."""
    tag = await api.tags.create(
        db_session,
        key=f"del_{uuid.uuid4().hex[:8]}",
        value="delval",
        created_by=schemas.SimpleUser.model_validate(test_user),
    )
    await db_session.commit()
    deleted = await api.tags.delete(db_session, tag)
    assert deleted.id == tag.id
    assert deleted.key == tag.key
    await db_session.commit()
    with pytest.raises(exceptions.NotFoundError):
        await api.tags.get(db_session, (tag.key, tag.value))

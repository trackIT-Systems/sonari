"""Tests for Sonari app tokens."""

from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from sonari import models
from sonari.system.app_token_auth import (
    format_app_token,
    generate_app_token_secret,
    hash_app_token_secret,
)
from sonari.system.oidc import get_current_user, get_current_user_oidc


async def _insert_app_token(
    session,
    user: models.User,
    *,
    title: str = "ci-token",
    expires_at=None,
    can_read: bool = True,
    can_write: bool = True,
) -> tuple[str, models.AppToken]:
    token_id = uuid4()
    secret = generate_app_token_secret()
    plaintext = format_app_token(token_id, secret)
    row = models.AppToken(
        user_id=user.id,
        title=title,
        secret_hash=hash_app_token_secret(secret),
        id=token_id,
        expires_at=expires_at,
        can_read=can_read,
        can_write=can_write,
    )
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return plaintext, row


@asynccontextmanager
async def _without_auth_overrides(app):
    saved = {}
    for dep in (get_current_user, get_current_user_oidc):
        if dep in app.dependency_overrides:
            saved[dep] = app.dependency_overrides.pop(dep)
    try:
        yield
    finally:
        app.dependency_overrides.update(saved)


@pytest.mark.asyncio
async def test_list_app_tokens_empty(auth_client: AsyncClient):
    r = await auth_client.get("/api/v1/auth/app-tokens")
    assert r.status_code == 200
    assert r.json() == []


@pytest.mark.asyncio
async def test_create_list_revoke_app_token(auth_client: AsyncClient):
    r = await auth_client.post(
        "/api/v1/auth/app-tokens",
        json={"title": "My integration", "expires_at": None},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["title"] == "My integration"
    assert "token" in data
    assert data["token"].startswith("snr.")
    assert data["can_read"] is True
    assert data["can_write"] is True
    assert data["permissions"] == "read_write"
    token_id = data["id"]

    r2 = await auth_client.get("/api/v1/auth/app-tokens")
    assert r2.status_code == 200
    listed = r2.json()
    assert len(listed) == 1
    assert listed[0]["id"] == token_id
    assert "token" not in listed[0]
    assert listed[0]["permissions"] == "read_write"

    r3 = await auth_client.delete(f"/api/v1/auth/app-tokens/{token_id}")
    assert r3.status_code == 204

    r4 = await auth_client.get("/api/v1/auth/app-tokens")
    assert len(r4.json()) == 1
    assert r4.json()[0]["revoked_at"] is not None


@pytest.mark.asyncio
async def test_purge_revoked_token_removes_row(auth_client: AsyncClient):
    r = await auth_client.post("/api/v1/auth/app-tokens", json={"title": "to-purge"})
    assert r.status_code == 200
    token_id = r.json()["id"]
    r_rev = await auth_client.delete(f"/api/v1/auth/app-tokens/{token_id}")
    assert r_rev.status_code == 204
    r_purge = await auth_client.post(f"/api/v1/auth/app-tokens/{token_id}/purge")
    assert r_purge.status_code == 204
    r_list = await auth_client.get("/api/v1/auth/app-tokens")
    assert r_list.json() == []


@pytest.mark.asyncio
async def test_purge_active_token_rejected(auth_client: AsyncClient):
    r = await auth_client.post("/api/v1/auth/app-tokens", json={"title": "active"})
    assert r.status_code == 200
    token_id = r.json()["id"]
    r_purge = await auth_client.post(f"/api/v1/auth/app-tokens/{token_id}/purge")
    assert r_purge.status_code == 400
    assert r_purge.json()["detail"] == "Revoke the token before removing it"


@pytest.mark.asyncio
async def test_purge_foreign_token_not_found(auth_client: AsyncClient, db_session):
    other = models.User(
        username="other_purge_user",
        email="other_purge_user@trackit.de",
        hashed_password="",
        name="Other",
        is_active=True,
        is_superuser=False,
        is_verified=True,
    )
    db_session.add(other)
    await db_session.commit()
    await db_session.refresh(other)
    _, row = await _insert_app_token(db_session, other, title="foreign")
    row.revoked_at = datetime.now(timezone.utc)
    await db_session.commit()

    r = await auth_client.post(f"/api/v1/auth/app-tokens/{row.id}/purge")
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_inactive_user_app_token_forbidden(app, db_session):
    uid = uuid4().hex[:10]
    inactive = models.User(
        username=f"inactive_{uid}",
        email=f"inactive_{uid}@trackit.de",
        hashed_password="",
        name="Inactive",
        is_active=False,
        is_superuser=False,
        is_verified=True,
    )
    db_session.add(inactive)
    await db_session.commit()
    await db_session.refresh(inactive)

    plaintext, _ = await _insert_app_token(db_session, inactive)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://localhost:5000") as client:
        async with _without_auth_overrides(app):
            r = await client.get(
                "/api/v1/features/",
                headers={"Authorization": f"Bearer {plaintext}"},
            )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_app_token_authenticates_api(app, test_user, db_session):
    plaintext, _ = await _insert_app_token(db_session, test_user)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://localhost:5000") as client:
        async with _without_auth_overrides(app):
            r = await client.get(
                "/api/v1/features/",
                headers={"Authorization": f"Bearer {plaintext}"},
            )
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_revoked_app_token_unauthorized(app, test_user, db_session):
    plaintext, row = await _insert_app_token(db_session, test_user)
    row.revoked_at = datetime.now(timezone.utc)
    await db_session.commit()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://localhost:5000") as client:
        async with _without_auth_overrides(app):
            r = await client.get(
                "/api/v1/features/",
                headers={"Authorization": f"Bearer {plaintext}"},
            )
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_expired_app_token_unauthorized(app, test_user, db_session):
    past = datetime.now(timezone.utc) - timedelta(hours=1)
    plaintext, _ = await _insert_app_token(db_session, test_user, expires_at=past)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://localhost:5000") as client:
        async with _without_auth_overrides(app):
            r = await client.get(
                "/api/v1/features/",
                headers={"Authorization": f"Bearer {plaintext}"},
            )
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_app_token_cannot_call_oidc_only_endpoints(app, test_user, db_session, auth_client):
    r = await auth_client.post("/api/v1/auth/app-tokens", json={"title": "x"})
    assert r.status_code == 200
    plaintext = r.json()["token"]

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://localhost:5000") as client:
        async with _without_auth_overrides(app):
            me = await client.get(
                "/api/v1/auth/me",
                headers={"Authorization": f"Bearer {plaintext}"},
            )
            assert me.status_code == 403

            create_again = await client.post(
                "/api/v1/auth/app-tokens",
                headers={"Authorization": f"Bearer {plaintext}"},
                json={"title": "nested"},
            )
            assert create_again.status_code == 403


@pytest.mark.asyncio
async def test_create_app_token_rejects_whitespace_only_title(auth_client: AsyncClient):
    r = await auth_client.post(
        "/api/v1/auth/app-tokens",
        json={"title": "   "},
    )
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_create_app_token_rejects_past_expiry(auth_client: AsyncClient):
    past = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    r = await auth_client.post(
        "/api/v1/auth/app-tokens",
        json={"title": "bad", "expires_at": past},
    )
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_delete_foreign_token_not_found(auth_client: AsyncClient, db_session):
    """Another user's token id returns 404 for revoke."""
    other = models.User(
        username="other_token_user",
        email="other_token_user@trackit.de",
        hashed_password="",
        name="Other",
        is_active=True,
        is_superuser=False,
        is_verified=True,
    )
    db_session.add(other)
    await db_session.commit()
    await db_session.refresh(other)

    _, row = await _insert_app_token(db_session, other, title="foreign")

    r = await auth_client.delete(f"/api/v1/auth/app-tokens/{row.id}")
    assert r.status_code == 404

    result = await db_session.execute(select(models.AppToken).where(models.AppToken.id == row.id))
    assert result.scalar_one().revoked_at is None


@pytest.mark.asyncio
async def test_read_only_app_token_allows_get_forbids_post(app, test_user, db_session):
    plaintext, _ = await _insert_app_token(db_session, test_user, can_read=True, can_write=False)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://localhost:5000") as client:
        async with _without_auth_overrides(app):
            ok = await client.get(
                "/api/v1/features/",
                headers={"Authorization": f"Bearer {plaintext}"},
            )
            denied = await client.post(
                "/api/v1/tags/",
                headers={"Authorization": f"Bearer {plaintext}"},
                json={"key": f"ro_{uuid4().hex[:8]}", "value": "v"},
            )
    assert ok.status_code == 200
    assert denied.status_code == 403
    assert denied.json()["detail"] == "App token does not allow write access"


@pytest.mark.asyncio
async def test_write_only_app_token_forbids_get_allows_post(app, test_user, db_session):
    plaintext, _ = await _insert_app_token(db_session, test_user, can_read=False, can_write=True)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://localhost:5000") as client:
        async with _without_auth_overrides(app):
            denied = await client.get(
                "/api/v1/features/",
                headers={"Authorization": f"Bearer {plaintext}"},
            )
            ok = await client.post(
                "/api/v1/tags/",
                headers={"Authorization": f"Bearer {plaintext}"},
                json={"key": f"wo_{uuid4().hex[:8]}", "value": "v"},
            )
    assert denied.status_code == 403
    assert denied.json()["detail"] == "App token does not allow read access"
    assert ok.status_code == 200


@pytest.mark.parametrize(
    ("perm", "can_read", "can_write"),
    [
        ("read", True, False),
        ("write", False, True),
        ("read_write", True, True),
    ],
)
@pytest.mark.asyncio
async def test_create_app_token_permissions(
    auth_client: AsyncClient, perm: str, can_read: bool, can_write: bool
):
    r = await auth_client.post(
        "/api/v1/auth/app-tokens",
        json={"title": f"perm-{perm}", "permissions": perm},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["permissions"] == perm
    assert data["can_read"] is can_read
    assert data["can_write"] is can_write

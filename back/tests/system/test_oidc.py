"""Tests for OIDC token verification."""

from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

from sonari.system.oidc import verify_oidc_token_credentials
from sonari.system.settings import Settings


@pytest.mark.asyncio
async def test_verify_oidc_token_uses_client_id_audience_only():
    """Access tokens must be intended for this Sonari client, not generic account audience."""
    settings = Settings(domain="localhost", dev=False, db_name="test.db")
    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials="header.payload.sig")

    with (
        patch("sonari.system.oidc.get_settings", return_value=settings),
        patch("sonari.system.oidc._get_jwks_client") as mock_jwks,
        patch("sonari.system.oidc.jwt.decode") as mock_decode,
    ):
        signing_key = MagicMock()
        signing_key.key = "secret"
        mock_jwks.return_value.get_signing_key_from_jwt.return_value = signing_key
        mock_decode.return_value = {
            "sub": "user-1",
            "preferred_username": "alice",
            "azp": settings.oidc_client_id,
        }

        await verify_oidc_token_credentials(credentials)

        mock_decode.assert_called_once()
        assert mock_decode.call_args.kwargs["audience"] == [settings.oidc_client_id]


@pytest.mark.asyncio
async def test_verify_oidc_token_rejects_missing_azp():
    """Tokens without azp matching client_id must be rejected."""
    settings = Settings(domain="localhost", dev=False, db_name="test.db")
    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials="header.payload.sig")

    with (
        patch("sonari.system.oidc.get_settings", return_value=settings),
        patch("sonari.system.oidc._get_jwks_client") as mock_jwks,
        patch("sonari.system.oidc.jwt.decode") as mock_decode,
    ):
        signing_key = MagicMock()
        signing_key.key = "secret"
        mock_jwks.return_value.get_signing_key_from_jwt.return_value = signing_key
        mock_decode.return_value = {
            "sub": "user-1",
            "preferred_username": "alice",
        }

        with pytest.raises(HTTPException) as exc_info:
            await verify_oidc_token_credentials(credentials)

        assert exc_info.value.status_code == 401


def test_settings_domain_none_oidc_fields():
    """Computed OIDC fields must not crash when domain is None (test harness)."""
    settings = Settings(domain=None, dev=False, db_name="test.db")
    assert settings.oidc_client_id == "localhost/sonari"
    assert settings.oidc_application == "localhost-sonari"

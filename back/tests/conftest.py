"""Pytest configuration and fixtures for API endpoint tests."""

import asyncio
import uuid
from pathlib import Path
from typing import AsyncGenerator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from sonari import api, schemas
from sonari.system import create_app
from sonari.system.database import (
    create_alembic_config,
    create_async_db_engine,
    create_or_update_db,
    get_async_session,
    get_database_url,
)
from sonari.system.settings import Settings

# Test database path
TEST_DB_PATH = Path(__file__).parent.parent / "sonari.db"


@pytest.fixture(scope="session")
def event_loop():
    """Create an event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="session")
def test_settings():
    """Create test settings with a test database."""
    # Clean up test database if it exists
    # if TEST_DB_PATH.exists():
    #     TEST_DB_PATH.unlink()

    settings = Settings(
        db_name=str(TEST_DB_PATH),
        db_dialect="sqlite",
        dev=True,
        log_to_stdout=True,
        log_to_file=False,
        open_on_startup=False,
        domain=None,  # Set to None for proper cookie handling in tests
    )
    return settings


@pytest.fixture(scope="session")
async def setup_test_db(test_settings):
    """Initialize the test database."""
    db_url = get_database_url(test_settings)
    engine = create_async_db_engine(db_url)

    # Create database tables
    async with engine.begin() as conn:
        cfg = create_alembic_config(db_url, is_async=False)
        await conn.run_sync(create_or_update_db, cfg)

    yield engine

    # Cleanup: close engine and remove test database
    # await engine.dispose()
    # if TEST_DB_PATH.exists():
    #     TEST_DB_PATH.unlink()


@pytest.fixture(scope="session")
async def app(test_settings, setup_test_db):
    """Create a test FastAPI application."""
    test_app = create_app(test_settings)
    return test_app


@pytest.fixture(scope="session")
async def admin_user(test_settings, setup_test_db) -> dict:
    """Create an admin user for testing."""
    db_url = get_database_url(test_settings)
    engine = create_async_db_engine(db_url)

    async with get_async_session(engine) as session:
        # Import here to avoid circular imports
        from sonari.models.user import User
        from sonari.system.users import UserDatabase, UserManager

        user_db = UserDatabase(session, User)
        user_manager = UserManager(user_db)

        # Check if admin user already exists
        try:
            existing_user = await user_manager.get_by_email("admin@trackit.de")
            if existing_user:
                return {
                    "username": "admin",
                    "password": "admin",
                }
        except Exception:
            pass

        # Create admin user
        from sonari.schemas.users import UserCreate

        user_create = UserCreate(
            username="admin",
            password="admin",
            is_superuser=True,
            is_verified=True,
        )

        await user_manager.create(user_create)
        await session.commit()

    return {
        "username": "admin",
        "password": "admin",
    }


@pytest.fixture(scope="function")
async def client(app) -> AsyncGenerator[AsyncClient, None]:
    """Create an HTTP client for testing."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://localhost:5000") as ac:
        yield ac


@pytest.fixture(scope="function")
async def auth_client(client: AsyncClient, admin_user: dict) -> AsyncClient:
    """Create an authenticated HTTP client.

    The backend uses cookie-based authentication, so the client will
    automatically handle the authentication cookie after login.
    """
    response = await client.post(
        "/api/v1/auth/login",
        data={
            "username": admin_user["username"],
            "password": admin_user["password"],
        },
    )
    # CookieTransport returns 204 No Content on successful login
    assert response.status_code == 204, f"Login failed with status {response.status_code}: {response.text}"
    # The login response sets a cookie that AsyncClient automatically handles
    # No need to manually extract tokens or set headers
    return client


@pytest.fixture(scope="function")
async def db_session(test_settings, setup_test_db) -> AsyncGenerator[AsyncSession, None]:
    """Provide a database session for direct database operations in tests.

    Note: For HTTP-based tests, transaction rollback won't work because the
    HTTP client creates its own sessions. Tests should use unique identifiers
    to ensure independence instead of relying on rollback.
    """
    db_url = get_database_url(test_settings)
    engine = create_async_db_engine(db_url)

    async with get_async_session(engine) as session:
        yield session


# ============================================================================
# Test Data Fixtures
# ============================================================================


@pytest.fixture
def test_recording_id() -> int:
    """Return the hardcoded recording ID for tests that need existing recordings with files.

    This recording should have physical audio files on disk for spectrogram/waveform tests.
    """
    return 1


@pytest.fixture
async def test_dataset(db_session: AsyncSession, test_settings: Settings) -> schemas.Dataset:
    """Create a test dataset for use in tests.

    Creates a unique dataset with its own directory for each test.
    """
    # Generate unique dataset name to avoid conflicts
    dataset_name = f"test_dataset_{uuid.uuid4().hex[:8]}"
    dataset_dir = test_settings.audio_dir / dataset_name
    dataset_dir.mkdir(parents=True, exist_ok=True)

    dataset = await api.datasets.create(
        db_session,
        name=dataset_name,
        dataset_dir=dataset_dir,
        description="Test dataset for testing",
    )

    # Commit so HTTP tests can see this data
    await db_session.commit()

    return dataset


@pytest.fixture
async def test_annotation_project(db_session: AsyncSession) -> schemas.AnnotationProject:
    """Create a test annotation project for use in tests.

    Creates a unique project for each test.
    """
    # Generate unique project name to avoid conflicts
    project_name = f"test_project_{uuid.uuid4().hex[:8]}"

    project = await api.annotation_projects.create(
        db_session,
        name=project_name,
        description="Test annotation project for testing",
        annotation_instructions="Test instructions",
    )

    # Commit so HTTP tests can see this data
    await db_session.commit()

    return project


@pytest.fixture
async def test_annotation_task(
    db_session: AsyncSession,
    test_annotation_project: schemas.AnnotationProject,
    test_recording_id: int,
) -> schemas.AnnotationTask:
    """Create a test annotation task for use in tests.

    Creates a task linked to the test project and test recording.
    """
    # Get the recording
    recording = await api.recordings.get(db_session, test_recording_id)

    # Create annotation task
    task = await api.annotation_tasks.create(
        db_session,
        annotation_project=test_annotation_project,
        recording=recording,
        start_time=0.0,
        end_time=min(5.0, recording.duration),  # Use first 5 seconds or full duration
    )

    # Commit so HTTP tests can see this data
    await db_session.commit()

    return task


@pytest.fixture
async def test_recording(
    db_session: AsyncSession,
    test_dataset: schemas.Dataset,
    test_settings: Settings,
) -> schemas.Recording:
    """Create a temporary test recording for tests that modify recordings.

    This should be used for UPDATE/DELETE operations, not for READ operations.
    For READ operations, use test_recording_id fixture with the hardcoded ID.

    Note: This creates a copy of an existing audio file with a slight modification
    to ensure a different MD5 hash (since the backend checks for unique recordings).
    """
    import shutil

    # Get the existing test recording to copy its file
    existing_recording = await api.recordings.get(db_session, 1)

    # Get the absolute path of the existing recording
    # The recording.path is relative to audio_dir, so we need to make it absolute
    source_path = test_settings.audio_dir / existing_recording.path

    # Create a new recording entry with a unique path in the test dataset
    # Dataset audio_dir is stored as relative path, so we need to make it absolute
    dataset_abs_path = test_settings.audio_dir / test_dataset.audio_dir
    temp_path = dataset_abs_path / f"temp_{uuid.uuid4().hex[:8]}.wav"

    # Copy the file instead of symlinking
    if not temp_path.exists():
        shutil.copy2(source_path, temp_path)

        # Modify the file slightly to change its MD5 hash
        # We'll append a few random bytes at the end of the file
        # Most audio formats are tolerant of trailing garbage data
        with open(temp_path, "ab") as f:
            f.write(uuid.uuid4().bytes)

    recording = await api.recordings.create(
        db_session,
        path=temp_path,
    )

    # Commit so HTTP tests can see this data
    await db_session.commit()

    return recording


@pytest.fixture
async def test_tag(db_session: AsyncSession) -> schemas.Tag:
    """Create a test tag for use in tests.

    Creates a unique tag for each test.
    """
    # Generate unique project name to avoid conflicts
    tag_key = f"test_tag_{uuid.uuid4().hex[:8]}"
    tag_value = "bat"

    user = await api.users.get_by_username(db_session, username="admin")

    tag = await api.tags.create(db_session, key=tag_key, value=tag_value, created_by=user)

    # Commit so HTTP tests can see this data
    await db_session.commit()

    return tag

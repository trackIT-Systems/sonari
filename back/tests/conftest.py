"""Pytest configuration and fixtures for API endpoint tests."""

import tempfile
import tomllib
import uuid
from pathlib import Path
from typing import Any, AsyncGenerator

import pytest
from httpx import ASGITransport, AsyncClient
from passlib.context import CryptContext
from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL
from sqlalchemy.ext.asyncio import AsyncSession

from sonari import api, schemas
from sonari.models.user import User
from sonari.system import create_app
from sonari.system.database import (
    create_alembic_config,
    create_async_db_engine,
    create_or_update_db,
    dispose_async_engine,
    get_async_session,
    get_database_url,
    validate_database_url,
)
from sonari.system.oidc import get_current_user
from sonari.system.settings import Settings, get_settings

# Config file path (tests/pytest_config.toml)
TEST_CONFIG_PATH = Path(__file__).parent / "pytest_config.toml"


def _load_test_config() -> dict[str, Any]:
    """Load test configuration from pytest_config.toml."""
    if not TEST_CONFIG_PATH.exists():
        return {}
    with open(TEST_CONFIG_PATH, "rb") as f:
        return tomllib.load(f)


def _is_postgres_test() -> bool:
    """Check if tests should run against PostgreSQL."""
    config = _load_test_config()
    db = config.get("test", {}).get("database", "sqlite")
    return str(db).lower() == "postgres"


def _get_postgres_config() -> dict[str, Any] | None:
    """Get PostgreSQL config from separate fields. Returns None if not configured."""
    config = _load_test_config().get("test", {})
    host = config.get("postgres_host")
    user = config.get("postgres_user")
    database = config.get("postgres_database")
    if host is not None and user is not None and database is not None:
        return {
            "host": host,
            "port": config.get("postgres_port", 5432),
            "user": user,
            "password": config.get("postgres_password") or "",
            "database": database,
        }
    return None


def _build_postgres_url(database: str, use_async: bool = True) -> URL:
    """Build PostgreSQL URL using SQLAlchemy URL.create() - handles special chars in password.

    URL.create() passes credentials directly to the driver without string round-tripping,
    avoiding encoding issues with passwords containing # or %.
    """
    cfg = _get_postgres_config()
    if cfg is None:
        from sqlalchemy.engine import make_url

        base = _load_test_config().get("test", {}).get("postgres_url", "postgresql://localhost/postgres")
        url = make_url(base)
        return url.set(database=database)

    drivername = "postgresql+asyncpg" if use_async else "postgresql+psycopg2"
    return URL.create(
        drivername=drivername,
        username=cfg["user"],
        password=cfg["password"],
        host=cfg["host"],
        port=cfg["port"],
        database=database,
    )


def _get_test_db_path() -> Path:
    """Get test database path - unique per run for SQLite idempotency."""
    return Path(tempfile.gettempdir()) / f"sonari_test_{uuid.uuid4().hex}.db"


def _get_test_db_name() -> str:
    """Get unique test database name for PostgreSQL idempotency."""
    return f"sonari_test_{uuid.uuid4().hex}"


def _get_test_settings_sqlite(db_path: Path) -> Settings:
    """Create test settings for SQLite. Uses dev=False so db_name is respected."""
    return Settings(
        db_name=str(db_path),
        db_dialect="sqlite",
        dev=False,
        log_to_stdout=True,
        log_to_file=False,
        open_on_startup=False,
        domain="localhost",
        audio_dir=Path.home(),
    )


def _get_test_settings_postgres(db_name: str) -> Settings:
    """Create test settings for PostgreSQL. Uses URL.create() when separate fields set."""
    url = _build_postgres_url(db_name, use_async=True)
    # Settings expects db_url as string; URL.create() produces correct encoding
    db_url_str = url.render_as_string(hide_password=False)

    return Settings(
        db_url=db_url_str,
        dev=False,
        log_to_stdout=True,
        log_to_file=False,
        open_on_startup=False,
        domain="localhost",
        audio_dir=Path.home(),
    )


@pytest.fixture(scope="session")
def test_db_path():
    """Unique test database path for this session (SQLite only)."""
    return _get_test_db_path()


@pytest.fixture(scope="session")
def test_db_name():
    """Unique test database name for this session (PostgreSQL only)."""
    return _get_test_db_name()


@pytest.fixture(scope="session")
def test_settings(test_db_path, test_db_name):
    """Create test settings with a test database (SQLite or PostgreSQL)."""
    if _is_postgres_test():
        return _get_test_settings_postgres(test_db_name)
    return _get_test_settings_sqlite(test_db_path)


@pytest.fixture(scope="session")
async def setup_test_db(test_settings, test_db_path, test_db_name):
    """Initialize the test database. Cleans up at session end.

    For SQLite: creates a unique file per run, deletes it at teardown.
    For PostgreSQL: creates a unique database per run, drops it at teardown.
    Both approaches ensure idempotency.
    """
    use_postgres = _is_postgres_test()

    if use_postgres:
        # PostgreSQL: create unique database. Connect to existing DB (e.g. sonari) to run CREATE.
        # URL.create() when separate fields configured - passes raw password to driver.
        cfg = _get_postgres_config()
        admin_db = cfg["database"] if cfg else "postgres"
        admin_url = _build_postgres_url(admin_db, use_async=True)
        admin_url = validate_database_url(admin_url, is_async=False)
        admin_engine = create_engine(admin_url, isolation_level="AUTOCOMMIT")
        with admin_engine.connect() as conn:
            conn.execute(text(f"CREATE DATABASE {test_db_name}"))
        admin_engine.dispose()

    else:
        # SQLite: clean up any existing file from previous failed runs
        if test_db_path.exists():
            test_db_path.unlink()

    db_url = get_database_url(test_settings)
    engine = create_async_db_engine(db_url)

    # Create database tables (run migrations)
    async with engine.begin() as conn:
        cfg = create_alembic_config(db_url, is_async=False)
        await conn.run_sync(create_or_update_db, cfg)

    yield engine

    # Cleanup: dispose engine and remove test database
    await engine.dispose()
    await dispose_async_engine()

    if use_postgres:
        cfg = _get_postgres_config()
        admin_db = cfg["database"] if cfg else "postgres"
        admin_url = _build_postgres_url(admin_db, use_async=True)
        admin_url = validate_database_url(admin_url, is_async=False)
        admin_engine = create_engine(admin_url, isolation_level="AUTOCOMMIT")
        with admin_engine.connect() as conn:
            # Terminate all connections to the test database before dropping.
            # Required because async engine pool may leave connections open.
            conn.execute(
                text(
                    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
                    "WHERE datname = :dbname AND pid <> pg_backend_pid()"
                ),
                {"dbname": test_db_name},
            )
            conn.execute(text(f"DROP DATABASE IF EXISTS {test_db_name}"))
        admin_engine.dispose()
    else:
        if test_db_path.exists():
            test_db_path.unlink(missing_ok=True)


@pytest.fixture(scope="session")
async def test_user(test_settings, setup_test_db):
    """Create a test admin user for testing. Uses direct model insert (no UserManager)."""
    db_url = get_database_url(test_settings)
    engine = create_async_db_engine(db_url)

    async with get_async_session(engine) as session:
        # Create admin user directly via model
        user = User(
            username="admin",
            email="admin@trackit.de",
            hashed_password="",  # Not used with OIDC; tests use auth override
            name="Admin",
            is_active=True,
            is_superuser=True,
            is_verified=True,
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)

    await engine.dispose()
    return user


@pytest.fixture(scope="session")
async def admin_user(test_user, test_settings, setup_test_db) -> dict[str, str]:
    """Admin user credentials for login tests (username/password auth).

    Creates/updates the admin user with a known password so login tests can authenticate.
    Returns dict with 'username' and 'password' keys.
    """
    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
    password = "admin"
    hashed = pwd_context.hash(password)

    db_url = get_database_url(test_settings)
    engine = create_async_db_engine(db_url)
    async with get_async_session(engine) as session:
        test_user.hashed_password = hashed
        session.add(test_user)
        await session.commit()
    await engine.dispose()

    return {"username": test_user.username, "password": password}


@pytest.fixture(scope="session")
async def app(test_settings, setup_test_db, test_user):
    """Create a test FastAPI application with dependency overrides."""
    test_app = create_app(test_settings)

    # Override get_settings so routes use test database
    test_app.dependency_overrides[get_settings] = lambda: test_settings

    # Override get_current_user to bypass OIDC and return test user
    async def override_get_current_user():
        return test_user

    test_app.dependency_overrides[get_current_user] = override_get_current_user

    return test_app


@pytest.fixture(scope="function")
async def client(app) -> AsyncGenerator[AsyncClient, None]:
    """Create an HTTP client for testing."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://localhost:5000") as ac:
        yield ac


@pytest.fixture(scope="function")
async def auth_client(client: AsyncClient) -> AsyncClient:
    """Create an authenticated HTTP client.

    Authentication is provided via dependency override (get_current_user),
    so no login request is needed. All requests are automatically authenticated.
    """
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
async def test_recording_id(db_session, test_dataset, test_settings) -> int:
    """Return a recording ID for tests that need existing recordings with files.

    Creates a minimal recording in test_dataset if none exist, or returns the
    first available recording ID. For spectrogram/waveform tests, a seed
    recording with physical audio files may be required - see README.
    """
    # Try to get or create a recording
    recordings, count = await api.recordings.get_many(db_session, limit=1, offset=0, filters=[])
    if recordings:
        return recordings[0].id

    # Create minimal recording - need a WAV file with actual audio data
    import os
    import struct

    dataset_abs_path = test_settings.audio_dir / test_dataset.audio_dir
    dataset_abs_path.mkdir(parents=True, exist_ok=True)
    wav_path = dataset_abs_path / f"seed_{uuid.uuid4().hex[:8]}.wav"

    # Create minimal valid WAV file (44 bytes header + 1 second of random audio)
    sample_rate = 44100
    duration_seconds = 1
    num_samples = sample_rate * duration_seconds
    data_size = num_samples * 2  # 16-bit samples = 2 bytes per sample

    with open(wav_path, "wb") as f:
        f.write(b"RIFF")
        f.write(struct.pack("<I", 36 + data_size))  # file size - 8
        f.write(b"WAVEfmt ")
        f.write(struct.pack("<I", 16))  # fmt chunk size
        f.write(struct.pack("<H", 1))  # PCM
        f.write(struct.pack("<H", 1))  # mono
        f.write(struct.pack("<I", sample_rate))  # sample rate
        f.write(struct.pack("<I", sample_rate * 2))  # byte rate (sample_rate * channels * bytes_per_sample)
        f.write(struct.pack("<H", 2))  # block align (channels * bytes_per_sample)
        f.write(struct.pack("<H", 16))  # bits per sample
        f.write(b"data")
        f.write(struct.pack("<I", data_size))  # data size
        f.write(os.urandom(data_size))

    recording = await api.recordings.create(db_session, path=wav_path)
    await db_session.commit()
    return recording.id


@pytest.fixture
async def test_dataset(db_session: AsyncSession, test_settings: Settings) -> schemas.Dataset:
    """Create a test dataset for use in tests.

    Creates a unique dataset with its own directory for each test.
    """
    dataset_name = f"test_dataset_{uuid.uuid4().hex[:8]}"
    dataset_dir = test_settings.audio_dir / dataset_name
    dataset_dir.mkdir(parents=True, exist_ok=True)

    dataset = await api.datasets.create(
        db_session,
        name=dataset_name,
        dataset_dir=dataset_dir,
        description="Test dataset for testing",
    )

    await db_session.commit()
    return dataset


@pytest.fixture
async def test_annotation_project(db_session: AsyncSession) -> schemas.AnnotationProject:
    """Create a test annotation project for use in tests."""
    project_name = f"test_project_{uuid.uuid4().hex[:8]}"

    project = await api.annotation_projects.create(
        db_session,
        name=project_name,
        description="Test annotation project for testing",
        annotation_instructions="Test instructions",
    )

    await db_session.commit()
    return project


@pytest.fixture
async def test_annotation_task(
    db_session: AsyncSession,
    test_annotation_project: schemas.AnnotationProject,
    test_recording_id: int,
) -> schemas.AnnotationTask:
    """Create a test annotation task for use in tests."""
    recording = await api.recordings.get(db_session, test_recording_id)

    task = await api.annotation_tasks.create(
        db_session,
        annotation_project=test_annotation_project,
        recording=recording,
        start_time=0.0,
        end_time=min(5.0, recording.duration) if recording.duration else 5.0,
    )

    await db_session.commit()
    return task


@pytest.fixture
async def test_recording(
    db_session: AsyncSession,
    test_dataset: schemas.Dataset,
    test_settings: Settings,
    test_recording_id: int,
) -> schemas.Recording:
    """Create a temporary test recording for tests that modify recordings.

    This should be used for UPDATE/DELETE operations, not for READ operations.
    """
    import shutil

    existing_recording = await api.recordings.get(db_session, test_recording_id)
    source_path = test_settings.audio_dir / existing_recording.path

    dataset_abs_path = test_settings.audio_dir / test_dataset.audio_dir
    temp_path = dataset_abs_path / f"temp_{uuid.uuid4().hex[:8]}.wav"

    if not temp_path.exists():
        shutil.copy2(source_path, temp_path)
        with open(temp_path, "ab") as f:
            f.write(uuid.uuid4().bytes)

    recording = await api.recordings.create(db_session, path=temp_path)
    await db_session.commit()
    return recording


@pytest.fixture
async def test_tag(db_session: AsyncSession, test_user: User) -> schemas.Tag:
    """Create a test tag for use in tests."""
    tag_key = f"test_tag_{uuid.uuid4().hex[:8]}"
    tag_value = "bat"
    created_by = schemas.SimpleUser.model_validate(test_user)

    tag = await api.tags.create(db_session, key=tag_key, value=tag_value, created_by=created_by)

    await db_session.commit()
    return tag


@pytest.fixture
async def test_note(
    db_session: AsyncSession,
    test_annotation_task: schemas.AnnotationTask,
    test_user: User,
) -> schemas.Note:
    """Create a test note for use in tests."""
    created_by = schemas.SimpleUser.model_validate(test_user)
    note = await api.notes.create(
        db_session,
        message=f"Test note {uuid.uuid4().hex[:8]}",
        is_issue=False,
        created_by=created_by,
        annotation_task_id=test_annotation_task.id,
    )
    await db_session.commit()
    return note


@pytest.fixture
async def test_sound_event_annotation(
    db_session: AsyncSession,
    test_annotation_task: schemas.AnnotationTask,
    test_user: User,
) -> schemas.SoundEventAnnotation:
    """Create a test sound event annotation for use in tests."""
    from sonari.schemas.sound_event_annotations import SoundEventAnnotationCreate

    created_by = schemas.SimpleUser.model_validate(test_user)
    create_data = SoundEventAnnotationCreate(
        geometry={"type": "BoundingBox", "coordinates": [0.5, 100.0, 1.5, 500.0]},
        tags=[],
    )
    annotation = await api.sound_event_annotations.create(
        db_session,
        annotation_task=test_annotation_task,
        geometry=create_data.geometry,
        created_by=created_by,
    )
    await db_session.commit()
    return annotation

# Sonari Tests

This directory contains comprehensive tests for the Sonari backend: HTTP route tests, database API tests, and export layer tests.

## Overview

The tests use:

- **Test Database**: SQLite by default (unique temp file per run); PostgreSQL optional via `tests/pytest_config.toml`
- **Authentication**: Mocked via dependency override (OIDC bypassed in tests)
- **Testing Framework**: pytest with pytest-asyncio
- **Test Coverage**: ~95% of active API endpoints, plus database API and export layer

## Running Tests

### Run all tests

```bash
# From the back/ directory
pytest tests/
```

### Run tests by category

```bash
pytest tests/routes/      # HTTP endpoint tests only
pytest tests/api/         # Database API tests only
pytest tests/exports/     # Export layer tests only
```

### Run specific test file

```bash
pytest tests/routes/test_psd.py
```

### Run specific test

```bash
pytest tests/routes/test_psd.py::test_get_psd
```

### Run with more verbose output

```bash
pytest tests/ -vv
```

### Run with coverage report

```bash
pytest tests/ --cov=sonari --cov-report=html
```

## Test Structure

Tests are organized into three directories:

### `tests/routes/` – HTTP endpoint tests

Integration tests against API endpoints via `auth_client`.

- `test_users.py` - User authentication endpoints (`/api/v1/auth/me`)
- `test_datasets.py` - Dataset listing and filtering
- `test_recordings.py` - Recording CRUD operations and feature management
- `test_tags.py` - Tag creation, listing, and duplicate handling
- `test_features.py` - Feature name listing
- `test_notes.py` - Note CRUD operations
- `test_annotation_projects.py` - Annotation project CRUD and progress tracking
- `test_annotation_tasks.py` - Annotation task management, stats, and indexing
- `test_sound_event_annotations.py` - Sound event annotation CRUD with tags and geometry
- `test_audio.py` - Audio streaming and download endpoints
- `test_waveforms.py` - Waveform image generation
- `test_spectrograms.py` - Spectrogram image generation
- `test_psd.py` - Power Spectral Density plot generation
- `test_export.py` - Data export endpoints (multibase, dump, passes, stats, time, yearly activity)

### `tests/api/` – Database API tests

Direct tests of the database layer (no HTTP).

- `test_utils.py` - Low-level CRUD utilities (`api/common/utils.py`)
- `test_base.py` - BaseAPI via TagAPI
- `test_api_datasets.py` - DatasetAPI
- `test_api_recordings.py` - RecordingAPI
- `test_api_annotation_tasks.py` - AnnotationTaskAPI

### `tests/exports/` – Export layer tests

- `test_query_builder.py` - Query construction for exports
- `test_extractors.py` - Data extraction utilities

## Fixtures

The `conftest.py` file provides the following fixtures:

### Database & Application Fixtures
- `test_settings` - Test application settings (session scope)
- `setup_test_db` - Initializes and cleans up test database (session scope)
- `app` - FastAPI test application with dependency overrides (session scope)
- `db_session` - Direct database session for test data manipulation (function scope)

### Authentication Fixtures
- `test_user` - Pre-created admin user (session scope)
- `admin_user` - Admin credentials for login tests (session scope)
- `client` - Unauthenticated HTTP client (function scope)
- `auth_client` - Authenticated HTTP client via dependency override (function scope)

### Test Data Fixtures
- `test_dataset` - Test dataset with unique directory (function scope)
- `test_recording_id` - Recording ID for read-only tests (session scope)
- `test_recording` - Temporary recording for destructive tests (function scope)
- `test_annotation_project` - Test annotation project (function scope)
- `test_annotation_task` - Test annotation task (function scope)
- `test_tag` - Test tag (function scope)
- `test_note` - Test note attached to annotation task (function scope)
- `test_sound_event_annotation` - Test sound event annotation (function scope)

## Configuration

Test settings are read from `tests/pytest_config.toml`. Options:

| Option            | Description                          | Default                    |
| ----------------- | ------------------------------------ | -------------------------- |
| `database`        | `"sqlite"` or `"postgres"`           | `"sqlite"`                 |
| `postgres_host`   | Host (use with separate fields)      | -                          |
| `postgres_port`   | Port                                 | 5432                       |
| `postgres_user`   | Username                             | -                          |
| `postgres_password` | Password (raw; # and % work)       | -                          |
| `postgres_database` | Database to connect to             | -                          |
| `postgres_url`    | Alternative: full URL                | `"postgresql://localhost/postgres"` |

## Dependencies

Required packages (already in `pyproject.toml`):

- pytest>=8.0.0
- pytest-asyncio>=0.23.0
- httpx>=0.28.1

Install dev dependencies:

```bash
pip install -e ".[dev]"
```

or with pdm:

```bash
pdm install --dev
```

## Test Database and Idempotency

Tests are **idempotent**: running them multiple times produces the same results.

### SQLite (default)

- A unique database file is created per test session: `sonari_test_<uuid>.db` in the temp directory
- The file is deleted after tests complete
- No leftover state between runs
- Test recordings include 1 second of audio data for proper testing

### PostgreSQL

To run tests against PostgreSQL, edit `tests/pytest_config.toml`:

```toml
[test]
database = "postgres"
postgres_url = "postgresql://user:password@localhost:5432/postgres"
```

Then run:

```bash
pytest tests/
```

- A **unique database** is created per test session: `sonari_test_<uuid>`
- The database is dropped after tests complete
- Same idempotency guarantee as SQLite

Install PostgreSQL dependencies first:

```bash
pdm install -G postgres
```

## Authentication

The app uses OIDC in production. For tests, authentication is **mocked** via a dependency override: `get_current_user` returns a pre-created test user. No login request or Bearer token is needed; `auth_client` is automatically authenticated.

## Test Quality & Coverage

### Coverage Statistics
- **80+ tests** covering all major API endpoints
- **~95% endpoint coverage** of active routes
- Both success and error cases tested
- Proper fixture isolation ensures test independence

### Test Types
- **Smoke tests**: Verify endpoints respond without errors
- **Error handling**: Test 404, 422, 500 responses for invalid inputs
- **Data validation**: Check response structure and content
- **CRUD operations**: Full create, read, update, delete flows
- **Feature tests**: Complex operations like tag management, geometry updates

### Best Practices
- Tests use unique identifiers (`uuid.uuid4().hex[:8]`) to avoid conflicts
- Fixtures distinguish between read-only (`test_recording_id`) and mutable (`test_recording`) resources
- Each test is independent and can run in any order
- Minimal test data created automatically (1-second WAV files)
- Tests clean up resources automatically

## Notes

- Tests verify endpoints respond with expected status codes and data structures
- Some tests write output files (e.g., `test_waveform.png`, `test_spectrogram.webp`) for manual verification
- Tests use the actual application code paths through HTTP requests
- Database operations are real, not mocked (tests against actual SQLite/PostgreSQL)
- Audio processing tests require minimal but valid WAV files (auto-generated by fixtures)


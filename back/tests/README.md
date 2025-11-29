# API Endpoint Tests

This directory contains integration tests for all Sonari API endpoints.

## Overview

These tests perform basic smoke tests on all API endpoints to ensure they respond without errors. The tests use:

- **Test Database**: `test_sonari.db` in the `back/` directory
- **Authentication**: Admin user with credentials `admin:admin`
- **Testing Framework**: pytest with pytest-asyncio

## Running Tests

### Run all tests

```bash
# From the back/ directory
python test_endpoints.py
```

Or using pytest directly:

```bash
pytest tests/
```

### Run specific test file

```bash
pytest tests/test_auth.py
```

### Run specific test

```bash
pytest tests/test_auth.py::test_login_success
```

### Run with more verbose output

```bash
pytest tests/ -vv
```

## Test Structure

Each route module has its own test file:

- `test_auth.py` - Authentication endpoints
- `test_users.py` - User management endpoints
- `test_annotation_projects.py` - Annotation project CRUD operations
- `test_datasets.py` - Dataset operations
- `test_recordings.py` - Recording operations
- `test_tags.py` - Tag operations
- `test_features.py` - Feature endpoints
- `test_notes.py` - Note operations
- `test_annotation_tasks.py` - Annotation task operations
- `test_sound_event_annotations.py` - Sound event annotation operations

## Fixtures

The `conftest.py` file provides the following fixtures:

- `test_settings` - Test application settings
- `setup_test_db` - Initializes and cleans up test database
- `app` - FastAPI test application
- `admin_user` - Admin user credentials dictionary
- `client` - Unauthenticated HTTP client
- `auth_client` - Authenticated HTTP client (uses cookie-based authentication)
- `db_session` - Direct database session for test data manipulation

**Note**: The application uses cookie-based authentication. After login, the `AsyncClient` automatically handles the authentication cookie (`sonariauth`) for subsequent requests.

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

## Test Database

The test database is automatically:

1. Created before tests run
2. Initialized with migrations
3. Seeded with an admin user
4. Cleaned up after tests complete

The database file `test_sonari.db` is automatically deleted after test runs.

## Notes

- Tests are basic smoke tests - they verify endpoints respond with expected status codes
- Some tests check for error cases (404, 422, 500) when resources don't exist
- Tests run in isolation and don't depend on each other
- Each test function gets a fresh authenticated client


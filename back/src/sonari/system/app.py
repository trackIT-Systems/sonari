"""System module for Sonari."""

import functools
import os
from contextlib import asynccontextmanager
from multiprocessing import Manager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware

from sonari import exceptions
from sonari.plugins import add_plugin_pages, add_plugin_routes, load_plugins
from sonari.shared_cache_global import set_shared_cache
from sonari.system.boot import sonari_init
from sonari.system.database import dispose_async_engine
from sonari.system.settings import Settings
from sonari.system.shared_cache import SharedTTLCache

ROOT_DIR = Path(__file__).parent.parent


class TrailingSlashNormalizationMiddleware(BaseHTTPMiddleware):
    """Middleware to handle trailing slash inconsistencies between routes.

    FastAPI has inconsistent trailing slash usage:
    - fastapi-users routes (auth, most users) don't use trailing slashes
    - Custom routes use trailing slashes

    This middleware normalizes trailing slashes based on route conventions.
    """

    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        # Only handle API routes
        if path.startswith("/api/v1/"):
            # fastapi-users routes don't use trailing slashes
            # These include: /auth/* and /users/* (except /users/first/)
            if path.startswith("/api/v1/auth/") or (
                path.startswith("/api/v1/users/") and not path.startswith("/api/v1/users/first")
            ):
                # Remove trailing slash if present
                if path.endswith("/") and path not in ("/api/v1/auth/", "/api/v1/users/"):
                    request.scope["path"] = path.rstrip("/")
            # All other API routes use trailing slashes (custom convention)
            elif not path.endswith("/"):
                # Add trailing slash to custom API routes
                request.scope["path"] = path + "/"

        return await call_next(request)


@asynccontextmanager
async def lifespan(settings: Settings, app: FastAPI):
    """Context manager to run startup and shutdown events."""
    # Create per-worker cache (uvicorn workers are separate processes, so true sharing requires external services)
    cache_manager = Manager()
    shared_cache = SharedTTLCache(
        manager=cache_manager,
        maxsize=2000,  # Small but reasonable size
        ttl=300,  # 5 minutes TTL
    )
    app.state.shared_cache = shared_cache
    app.state.cache_manager = cache_manager

    set_shared_cache(shared_cache)

    await sonari_init(settings, app)
    yield

    # Cleanup on shutdown
    await dispose_async_engine()
    cache_manager.shutdown()


def create_app(settings: Settings) -> FastAPI:
    # NOTE: Import the routes here to avoid circular imports
    from sonari.routes import get_main_router

    app = FastAPI(root_path=os.getenv("SONARI_FOLDER", ""), lifespan=functools.partial(lifespan, settings))

    allowed_origins = [
        f"http://{settings.host}:{settings.port}",
        *settings.cors_origins,
    ]

    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["Content-Disposition"],
    )

    # Add middleware to normalize trailing slashes across different route conventions
    app.add_middleware(TrailingSlashNormalizationMiddleware)

    # Add default routes.
    main_router = get_main_router(settings)
    app.include_router(main_router)

    # Load plugins.
    for name, plugin in load_plugins():
        add_plugin_routes(app, name, plugin)
        add_plugin_pages(app, name, plugin)

    statics_dir = ROOT_DIR / "statics"
    if not statics_dir.exists():
        statics_dir.mkdir(parents=True, exist_ok=True)

    # NOTE: It is important that the static files are mounted after the
    # plugin routes, otherwise the plugin routes will not be found.
    app.mount(
        "/",
        StaticFiles(packages=["sonari"], html=True),
        name="static",
    )

    @app.exception_handler(exceptions.NotFoundError)
    async def not_found_error_handler(_, exc: exceptions.NotFoundError):
        return JSONResponse(
            status_code=404,
            content={"message": str(exc)},
        )

    @app.exception_handler(exceptions.DuplicateObjectError)
    async def duplicate_object_error_handled(_, exc: exceptions.DuplicateObjectError):
        return JSONResponse(
            status_code=409,
            content={"message": str(exc)},
        )

    return app

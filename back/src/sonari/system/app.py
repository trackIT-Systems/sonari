"""System module for Sonari."""

import functools
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from sonari import exceptions
from sonari.plugins import add_plugin_pages, add_plugin_routes, load_plugins
from sonari.system.boot import sonari_init
from sonari.system.settings import Settings

ROOT_DIR = Path(__file__).parent.parent


@asynccontextmanager
async def lifespan(settings: Settings, app: FastAPI):
    """Context manager to run startup and shutdown events."""
    await sonari_init(settings, app)
    yield


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

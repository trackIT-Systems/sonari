"""Sonari entry point.

This script starts the Sonari application. It is used in conjunction with the
pyinstaller package to create a standalone executable.
"""

import multiprocessing

import asyncpg
import uvicorn

from sonari.system import create_app, get_logging_config, get_settings

settings = get_settings()
config = get_logging_config(settings)
app = create_app(settings)

if __name__ == "__main__":
    print(
        r"""
    Welcome to:
        ███████  ██████  ███    ██  █████  ██████  ██ 
        ██      ██    ██ ████   ██ ██   ██ ██   ██ ██ 
        ███████ ██    ██ ██ ██  ██ ███████ ██████  ██ 
             ██ ██    ██ ██  ██ ██ ██   ██ ██   ██ ██ 
        ███████  ██████  ██   ████ ██   ██ ██   ██ ██ 

    An ML-focused audio annotation tool.

    Please wait while Sonari starts up...
    """
    )

    multiprocessing.freeze_support()
    uvicorn.run(
        "app:app",
        host=settings.host,
        log_level=settings.log_level,
        log_config=config,
        port=settings.port,
        reload=settings.dev,
        workers=settings.workers,
    )

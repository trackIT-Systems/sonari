"""Main entry point for sonari.

This module is used to run the app using uvicorn.
"""

import uvicorn

from sonari.system import get_logging_config, get_settings

if __name__ == "__main__":
    settings = get_settings()
    config = get_logging_config(settings)
    uvicorn.run(
        "sonari.app:app",
        host=settings.host,
        port=settings.port,
        log_level=settings.log_level,
        reload=settings.dev,
        log_config=config,
    )

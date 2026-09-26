"""FastAPI app factory."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.api.routes import analyses, health, scene
from app.core.config import get_settings
from app.core.errors import register_exception_handlers
from app.core.logging import configure_logging


def create_app() -> FastAPI:
    """Build the application with routes, CORS and error handlers."""
    settings = get_settings()
    configure_logging(settings.log_level)

    app = FastAPI(title="SENTINEL API", version=__version__)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    register_exception_handlers(app)
    app.include_router(health.router, prefix="/api")
    app.include_router(scene.router, prefix="/api")
    app.include_router(analyses.router, prefix="/api")
    return app


app = create_app()

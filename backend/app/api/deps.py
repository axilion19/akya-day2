"""Shared FastAPI dependencies (singletons built once per process)."""

from functools import lru_cache

from app.agent.llm_client import ChatLLM, build_llm
from app.agent.store import AnalysisStore
from app.agent.watch.store import WatchRunStore
from app.core.config import get_settings
from app.data.repository import Repository
from app.services.detection import Detector, build_detector, build_fallback_detector


@lru_cache
def get_detector() -> Detector:
    """Detector singleton; model weights load once."""
    return build_detector(get_settings())


@lru_cache
def get_fallback_detector() -> Detector:
    """Precomputed detections used when the live detector fails mid-analysis."""
    return build_fallback_detector(get_settings())


@lru_cache
def get_repository() -> Repository:
    """Data pool loaded once; raises DataUnavailableError (503) while files are missing."""
    return Repository(get_settings().data_dir)


@lru_cache
def get_store() -> AnalysisStore:
    """In-memory analysis store."""
    return AnalysisStore()


@lru_cache
def get_llm() -> ChatLLM | None:
    """GLM client singleton, or None without an API key (agents then use their fallbacks)."""
    return build_llm(get_settings())


@lru_cache
def get_watch_store() -> WatchRunStore:
    """In-memory watch runs."""
    return WatchRunStore()

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.agent.store import AnalysisStore
from app.api.deps import get_detector, get_fallback_detector, get_repository, get_store
from app.core.config import Settings, get_settings
from app.data.repository import Repository
from app.main import create_app
from app.services.detection import PrecomputedDetector

GOLDEN_DIR = Path(__file__).parent / "fixtures" / "golden"


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    """Settings isolated from the developer's .env; data dir does not exist."""
    return Settings(
        _env_file=None,
        data_dir=tmp_path / "data",
        cache_dir=tmp_path / "cache",
        detections_file=tmp_path / "detections.json",
    )


@pytest.fixture
def golden_settings() -> Settings:
    """Settings pointing at the committed img_000860 fixture (AGENT_DESIGN §9)."""
    return Settings(
        _env_file=None,
        data_dir=GOLDEN_DIR,
        detections_file=GOLDEN_DIR / "detections.json",
        brief_language="tr",
    )


@pytest.fixture
def golden_repo(golden_settings: Settings) -> Repository:
    return Repository(golden_settings.data_dir)


@pytest.fixture
def golden_detector(golden_settings: Settings) -> PrecomputedDetector:
    return PrecomputedDetector(golden_settings.detections_file, golden_settings.detect_conf_min)


def _client(settings: Settings, repo: Repository | None) -> Iterator[TestClient]:
    app = create_app()
    app.dependency_overrides[get_settings] = lambda: settings
    app.dependency_overrides[get_detector] = lambda: PrecomputedDetector(
        settings.detections_file, settings.detect_conf_min
    )
    app.dependency_overrides[get_fallback_detector] = lambda: PrecomputedDetector(
        settings.detections_file, settings.detect_conf_min
    )
    store = AnalysisStore()
    app.dependency_overrides[get_store] = lambda: store
    if repo is not None:
        app.dependency_overrides[get_repository] = lambda: repo
    else:
        app.dependency_overrides[get_repository] = lambda: Repository(settings.data_dir)
    with TestClient(app) as c:
        yield c


@pytest.fixture
def client(settings: Settings) -> Iterator[TestClient]:
    """App with no data on disk."""
    yield from _client(settings, None)


@pytest.fixture
def golden_client(golden_settings: Settings, golden_repo: Repository) -> Iterator[TestClient]:
    """App serving the golden fixture."""
    yield from _client(golden_settings, golden_repo)

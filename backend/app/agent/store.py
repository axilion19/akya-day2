"""In-memory store of finished analyses, keyed by analysis id.

TODO(P2): back with the disk cache keyed by (image_id, config_hash) and per-analysis event buffers.
"""

import uuid

from app.domain.analysis import Analysis


class AnalysisStore:
    """Holds analyses for the process lifetime; latest per image for quick reuse."""

    def __init__(self) -> None:
        self._by_id: dict[str, Analysis] = {}
        self._latest_by_image: dict[str, str] = {}

    @staticmethod
    def new_id() -> str:
        """Short random analysis id."""
        return uuid.uuid4().hex[:12]

    def put(self, analysis: Analysis) -> None:
        """Store an analysis and mark it as the latest for its image."""
        self._by_id[analysis.id] = analysis
        self._latest_by_image[analysis.image_id] = analysis.id

    def get(self, analysis_id: str) -> Analysis | None:
        """Analysis by id, if present."""
        return self._by_id.get(analysis_id)

    def latest_for(self, image_id: str) -> Analysis | None:
        """Most recent analysis of `image_id`, if any."""
        aid = self._latest_by_image.get(image_id)
        return self._by_id.get(aid) if aid else None

"""Admin tuning: override file I/O and how a snapshot is applied to a run (spec §3.2)."""

from app.core.config import Settings
from app.domain.tuning import AgentTuning


def with_agent_knobs(settings: Settings, tuning: AgentTuning) -> Settings:
    """`settings` with every non-None agent knob of `tuning` applied (names match Settings)."""
    update = {k: v for k, v in tuning.agents.model_dump().items() if v is not None}
    return settings.model_copy(update=update) if update else settings

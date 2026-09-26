"""LLM client abstraction. The real OpenAI-compatible (GLM) client arrives in P2.

TODO(P2): OpenAICompatibleClient (openai SDK, base_url), timeout + retries, JSON extraction,
disk cache keyed by sha256(prompt_version + model + input_json), token/latency logging.
"""

from typing import Protocol

from app.core.config import Settings


class LLMClient(Protocol):
    """Minimal chat-completion interface used by the agent."""

    model: str

    def complete_json(self, system: str, user: str, temperature: float) -> str:
        """Return the raw model text; callers validate it against a Pydantic model."""
        ...


def llm_status(settings: Settings) -> tuple[bool, str]:
    """Report whether an LLM endpoint is configured (no network call)."""
    if not settings.llm_enabled:
        return False, "no API key configured; fallback brief will be used"
    return True, f"{settings.llm_model} @ {settings.llm_base_url}"

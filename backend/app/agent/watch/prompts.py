"""Load versioned prompt files from app/agent/prompts/ and fill {{variables}}."""

import re
from functools import cache
from pathlib import Path

PROMPTS_DIR = Path(__file__).resolve().parents[1] / "prompts"
_VAR = re.compile(r"\{\{(\w+)\}\}")


@cache
def _read(name: str) -> str:
    return (PROMPTS_DIR / f"{name}.md").read_text(encoding="utf-8")


def render(name: str, **values: object) -> str:
    """Prompt `name` (e.g. "watcher_v1") with {{vars}} filled; a missing var raises KeyError."""
    text = _read(name)
    missing = sorted({m for m in _VAR.findall(text) if m not in values})
    if missing:
        raise KeyError(f"prompt {name} needs {missing}")
    return _VAR.sub(lambda m: str(values[m.group(1)]), text)

"""v8 prompts: same text as v7 with default thresholds; variables follow the tuning."""

from app.agent.watch.prompts import (
    PROMPT_FILES,
    prompt_problems,
    render,
    render_with_fallback,
    required_vars,
    threshold_vars,
)
from app.services.tuning import DEFAULT_TUNING

WATCHER_BASE = dict(
    watcher_id="W1",
    sector_names="A, B",
    base_name="Base",
    base_lat=39.9,
    base_lon=32.8,
    max_tool_calls=3,
    output_language="Turkish",
)
SUPERVISOR_BASE = dict(
    base_name="Base",
    base_lat=39.9,
    base_lon=32.8,
    n_watchers=4,
    watcher_layout="W1: A",
    tracker_rules="3. none",
    max_tool_calls=6,
    output_language="Turkish",
)


def test_v8_with_defaults_equals_v7() -> None:
    tv = threshold_vars(DEFAULT_TUNING)
    assert render("watcher_v8", **WATCHER_BASE, **tv) == render("watcher_v7", **WATCHER_BASE)
    assert render("supervisor_v8", **SUPERVISOR_BASE, **tv) == render(
        "supervisor_v7", **SUPERVISOR_BASE
    )


def test_thresholds_show_up_in_the_prompt() -> None:
    ceiling = DEFAULT_TUNING.ceiling.model_copy(update={"approach_medium_m": 2500.0})
    groups = DEFAULT_TUNING.groups.model_copy(update={"large_group": 3})
    tuned = DEFAULT_TUNING.model_copy(update={"ceiling": ceiling, "groups": groups})
    text = render("watcher_v8", **WATCHER_BASE, **threshold_vars(tuned))
    assert "within 2.5 km or 12 minutes may be MEDIUM" in text
    assert "three or more together may be MEDIUM" in text


def test_required_vars_come_from_the_file() -> None:
    assert "approach_high_km" in required_vars(PROMPT_FILES["watcher"])
    assert "watcher_id" in required_vars(PROMPT_FILES["watcher"])
    assert "tracker_rules" in required_vars(PROMPT_FILES["supervisor"])


def test_prompt_problems_names_missing_and_unknown_vars() -> None:
    from app.agent.watch.prompts import file_text

    text = file_text(PROMPT_FILES["watcher"]).replace("{{at_base_km}}", "{{at_base_miles}}")
    assert prompt_problems("watcher", text) == [
        "prompts.watcher: missing_vars at_base_km",
        "prompts.watcher: unknown_vars at_base_miles",
    ]
    assert prompt_problems("watcher", file_text(PROMPT_FILES["watcher"])) == []


def test_broken_override_falls_back_to_the_file() -> None:
    values = {**WATCHER_BASE, **threshold_vars(DEFAULT_TUNING)}
    text, warnings = render_with_fallback("watcher_v8", "Hello {{nope}}", values)
    assert text == render("watcher_v8", **values)
    assert warnings and "file prompt used" in warnings[0]
    text, warnings = render_with_fallback("watcher_v8", "Hi {{watcher_id}}", values)
    assert (text, warnings) == ("Hi W1", [])

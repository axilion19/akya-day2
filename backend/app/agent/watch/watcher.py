"""Sector watcher: one LLM turn per watcher per tick (docs/AGENT_PROMPTS_AND_TOOLS.md §4).

The tick message carries code-computed rows; the model returns levels and reasons through
`submit_watch_report`. Code then enforces the level rules; on any failure the track-only rubric
decides (fallback) and the event says so.
"""

import json
from dataclasses import dataclass, field
from typing import Any

from app.agent.llm_client import ChatLLM
from app.agent.watch import tools as t
from app.agent.watch.loop import SubmitError, fill_pattern_track_ids, run_tool_loop
from app.agent.watch.prompts import render
from app.agent.watch.registry import level_index
from app.domain.report import ReportClaim
from app.domain.watch import (
    WATCH_LEVELS,
    GeneratedBy,
    Note,
    VehicleRow,
    VehicleVerdict,
    WatcherReport,
    WatchLevel,
)
from app.services.watch import watch_level_of

PROMPT = "watcher_v3"
MAX_TOKENS = 12000
LANGUAGE_NAMES = {"tr": "Turkish", "en": "English"}


@dataclass
class WatcherInput:
    """Everything one watcher sees at one tick."""

    watcher_id: str
    area: list[str]  # every sector this watcher is responsible for
    sectors: list[str]  # the sector(s) it checks this tick
    last_checked: str | None  # when it last checked them, HH:MM
    tick: str
    rows: list[VehicleRow]
    new_arrivals: list[dict[str, Any]]
    notes: list[Note]
    frames: list[dict[str, Any]]
    reports: list[ReportClaim]
    spot_checks: list[str] = field(default_factory=list)  # quiet vehicles sampled at random


@dataclass
class WatcherOutcome:
    """A watcher's report for one tick, after code-side checks."""

    report: WatcherReport
    generated_by: GeneratedBy
    duration_ms: int = 0
    tool_calls: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    system: str = ""
    user: str = ""
    trace: list[dict[str, Any]] = field(default_factory=list)


def needs_judgment(row: VehicleRow) -> bool:
    """Rows sent in full and required in the answer; the rest are one-liners treated as LOW."""
    return (
        watch_level_of(row.rubric.level) != "LOW"
        or row.registry_level != "LOW"
        or row.pending_level is not None
        or row.notes_count > 0
        or (row.status == "new_in_sector" and row.moving)
        or row.closing_last5_m_per_min > 100
    )


def judged_rows(inp: WatcherInput) -> list[VehicleRow]:
    """Rows sent in full and required in the answer: by condition, plus the random spot checks."""
    return [r for r in inp.rows if needs_judgment(r) or r.track_id in inp.spot_checks]


def _row_json(row: VehicleRow, multi_sector: bool) -> dict[str, Any]:
    data = row.model_dump(mode="json", exclude={"one_liner", "position", "status"})
    data["rubric"] = {"score": row.rubric.score, "level": row.rubric.level}
    data["status"] = row.status
    if not multi_sector:
        data.pop("sector")
    return data


def build_user_message(inp: WatcherInput) -> str:
    """The per-tick user turn (all volatile data; the system prompt stays fixed)."""
    detailed = judged_rows(inp)
    quiet = [r for r in inp.rows if r not in detailed]
    moving = sum(r.moving for r in inp.rows)
    multi = len(inp.sectors) > 1
    note_view = [n.model_dump(mode="json") | {"track_id": n.id.split("-")[1]} for n in inp.notes]
    reports = [
        {"report_id": c.report_id, "time": c.time, "source": c.source, "text": c.text}
        for c in inp.reports
    ]

    def block(tag: str, value: object) -> str:
        return f"<{tag}>\n{json.dumps(value, ensure_ascii=False)}\n</{tag}>"

    last = f"last checked at {inp.last_checked}" if inp.last_checked else "first check"
    return "\n\n".join(
        [
            f"Tick {inp.tick}. You check: {', '.join(inp.sectors)} ({last}). "
            f"{len(inp.rows)} vehicles ({moving} moving, {len(inp.rows) - moving} stationary).",
            block(
                "vehicles",
                [
                    _row_json(r, multi)
                    | ({"spot_check": True} if r.track_id in inp.spot_checks else {})
                    for r in detailed
                ],
            ),
            block("quiet_vehicles", [r.one_liner for r in quiet]),
            block("new_arrivals", inp.new_arrivals),
            block("registry_notes", note_view),
            block("frames", inp.frames),
            block("untrusted_reports", reports),
        ]
    )


def system_prompt(ctx: t.WatchContext, watcher_id: str, area: list[str]) -> str:
    """The watcher's fixed system prompt for its area (stable across ticks)."""
    base = ctx.repo.scene.base
    return render(
        PROMPT,
        watcher_id=watcher_id,
        sector_names=", ".join(area),
        base_name=base.name,
        base_lat=base.position.lat,
        base_lon=base.position.lon,
        max_tool_calls=ctx.settings.watcher_max_tool_calls,
        output_language=LANGUAGE_NAMES[ctx.settings.brief_language],
    )


def _checker(ctx: t.WatchContext, inp: WatcherInput) -> Any:
    known = {r.track_id for r in inp.rows}
    required = {r.track_id for r in judged_rows(inp)}

    def parse(args: dict[str, Any]) -> WatcherReport:
        report = WatcherReport.model_validate({**fill_pattern_track_ids(args), "tick": inp.tick})
        ids = [v.track_id for v in report.vehicles]
        problems = []
        if unknown := sorted(set(ids) - known):
            problems.append(f"not in your sectors: {unknown}")
        if dupes := sorted({i for i in ids if ids.count(i) > 1}):
            problems.append(f"listed twice: {dupes}")
        if missing := sorted(required - set(ids)):
            problems.append(f"missing vehicles from <vehicles>: {missing}")
        evidence = [e for v in report.vehicles for e in v.evidence_ids]
        evidence += [e for p in report.patterns for e in p.evidence_ids]
        if bad := ctx.unknown_evidence(evidence):
            problems.append(f"unknown evidence ids: {sorted(set(bad))}")
        if problems:
            raise SubmitError("; ".join(problems))
        return report

    return parse


def enforce_rules(report: WatcherReport, rows: list[VehicleRow]) -> tuple[WatcherReport, list[str]]:
    """Clamp levels: never below the registry level, at most one step from the rubric."""
    by_id = {r.track_id: r for r in rows}
    warnings: list[str] = []
    fixed: list[VehicleVerdict] = []
    for v in report.vehicles:
        row = by_id[v.track_id]
        rubric = level_index(watch_level_of(row.rubric.level))
        lo = max(level_index(row.registry_level), rubric - 1)
        hi = max(rubric + 1, level_index(row.registry_level))
        idx = min(max(level_index(v.level), lo), hi)
        if idx != level_index(v.level):
            warnings.append(f"{v.track_id}: level {v.level} clamped to {WATCH_LEVELS[idx]}")
            v = v.model_copy(update={"level": WATCH_LEVELS[idx]})
        fixed.append(v)
    return report.model_copy(update={"vehicles": fixed}), warnings


def fallback_report(inp: WatcherInput) -> WatcherReport:
    """Rubric levels with templated reasons (used when the LLM is off or fails)."""
    verdicts = []
    for row in judged_rows(inp):
        level: WatchLevel = max(
            watch_level_of(row.rubric.level), row.registry_level, key=level_index
        )
        top = [f.detail for f in row.rubric.factors if f.points > 0][:3]
        verdicts.append(
            VehicleVerdict(
                track_id=row.track_id,
                level=level,
                reason=f"Rubric {row.rubric.score}: " + ("; ".join(top) or "no risk factors"),
                evidence_ids=[f"TRK-{row.track_id}"],
                note=None,
            )
        )
    moving = sum(r.moving for r in inp.rows)
    return WatcherReport(
        tick=inp.tick,
        street_state=f"{len(inp.rows)} vehicles, {moving} moving.",
        vehicles=verdicts,
        patterns=[],
    )


async def run_watcher(
    llm: ChatLLM | None, ctx: t.WatchContext, inp: WatcherInput
) -> WatcherOutcome:
    """One watcher turn; never raises for LLM problems."""
    if llm is None:
        return WatcherOutcome(fallback_report(inp), "fallback", warnings=["LLM disabled"])
    handlers = {
        "get_route": lambda a: t.get_route(ctx, a),
        "get_notes": lambda a: t.get_notes(ctx, a),
        "get_reports": lambda a: t.get_reports(ctx, a),
    }
    system, user = system_prompt(ctx, inp.watcher_id, inp.area), build_user_message(inp)
    loop = await run_tool_loop(
        llm,
        system=system,
        user=user,
        tools=[t.GET_ROUTE, t.GET_NOTES, t.GET_REPORTS, t.SUBMIT_WATCH_REPORT],
        handlers=handlers,
        submit_name="submit_watch_report",
        parse_submit=_checker(ctx, inp),
        model=ctx.settings.watcher_model,
        reasoning_effort=ctx.settings.watcher_reasoning_effort,
        max_tokens=MAX_TOKENS,
        max_lookups=ctx.settings.watcher_max_tool_calls,
        lookup_tools=t.LOOKUP_TOOLS,
    )
    generated_by: GeneratedBy
    if loop.output is None:
        report, generated_by = fallback_report(inp), "fallback"
        warnings = [*loop.warnings, "rubric fallback used"]
    else:
        report, clamps = enforce_rules(loop.output, inp.rows)
        generated_by, warnings = "llm", loop.warnings + clamps
    return WatcherOutcome(
        report,
        generated_by,
        loop.duration_ms,
        loop.tool_calls,
        warnings,
        system=system,
        user=user,
        trace=loop.trace,
    )

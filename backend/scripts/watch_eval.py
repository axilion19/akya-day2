"""Evaluate a recorded watch run against a code-computed ground truth (no LLM calls).

    uv run python -m scripts.watch_eval recordings/watch_1010-1110.jsonl [--out eval.md]

Ground truth, from the raw tracks at every tick of the run (independent of what the agents saw
or wrote): a vehicle is **must-catch** while it
- loops around or orbits the base within PATTERN_HIGH_M (the main danger), or
- approaches fast and close enough that the level ceiling allows HIGH (`level_ceiling`).

Measured from the agents' events: which must-catch vehicles were rated HIGH and named in an
operator alert, how many minutes after code could first see it, HIGH ratings and alerts that no
code rule backs, how the field reports were judged, and how often code had to step in.
"""

import argparse
import json
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
from statistics import median
from typing import Any

from app.core.config import Settings
from app.core.timefmt import to_hhmm, to_minutes
from app.data.repository import Repository
from app.domain.watch import VehicleRow
from app.services import watch as watch_svc
from app.services.behavior import DANGER_PATTERNS
from app.services.risk import AT_BASE_M, PATTERN_HIGH_M, level_ceiling

Event = dict[str, Any]


@dataclass
class Truth:
    """Why and since when code considers a vehicle must-catch."""

    kind: str  # "pattern" or "approach"
    first_min: int
    detail: str
    minutes: set[int] = field(default_factory=set)


@dataclass
class Result:
    """Everything the report prints."""

    ticks: list[int]
    truth: dict[str, Truth]
    high_at: dict[str, int]  # first minute a vehicle got HIGH (pending or confirmed)
    alert_at: dict[str, int]  # first operator alert naming it
    unbacked_high: list[tuple[str, str, str]]  # (track, tick, why code did not back it)
    unbacked_alerts: list[tuple[str, str]]  # (tick, headline)
    alerts: int
    report_verdicts: Counter[str]
    deception: int
    turns: Counter[str]  # llm / fallback
    repairs: int
    clamps: int


def fast_close_approach(row: VehicleRow) -> bool:
    """The ceiling's approach rule alone (HIGH), without its 'within 1 km' or pattern rules."""
    closing_now = row.moving and row.closing_last5_m_per_min > 0
    rule_only = level_ceiling(
        max(row.dist_to_base_m, AT_BASE_M + 1),  # skip the proximity rule, keep the approach one
        row.speed_last10_ms,
        closing_now,
        row.heading_vs_base_deg,
        row.eta_to_base_min,
        "unknown",
    )
    return rule_only == "HIGH"


def ground_truth(repo: Repository, settings: Settings, ticks: list[int]) -> dict[str, Truth]:
    """Must-catch vehicles per the code rules, with the first tick each rule held."""
    base, zones = repo.scene.base.position, repo.scene.zones
    truth: dict[str, Truth] = {}
    for minute in ticks:
        for tid, track in repo.tracks.items():
            upto = watch_svc.track_until(track, minute)
            if upto is None:
                continue
            row = watch_svc.vehicle_row(
                upto,
                minute,
                base,
                zones,
                stop_speed_ms=settings.stop_speed_ms,
                zone_radius_m=settings.zone_radius_m,
                prev_sector=None,
                registry_level="LOW",
                pending_level=None,
                notes_count=0,
                lang="en",
            )
            dist = row.dist_to_base_m
            if row.behavior_class in DANGER_PATTERNS and dist <= PATTERN_HIGH_M:
                kind, detail = "pattern", f"{row.behavior_class} at {dist / 1000:.1f} km"
            elif fast_close_approach(row):
                eta = f", ETA {row.eta_to_base_min:.0f} min" if row.eta_to_base_min else ""
                kind, detail = "approach", f"fast approach at {dist / 1000:.1f} km{eta}"
            else:
                continue
            t = truth.setdefault(tid, Truth(kind, minute, detail))
            t.minutes.add(minute)
            if kind == "pattern" and t.kind != "pattern":  # a pattern outranks an approach
                t.kind, t.detail = kind, detail
    return truth


def run_ticks(events: list[Event]) -> list[int]:
    """Tick minutes of a run."""
    return [to_minutes(e["tick"]) for e in events if e["type"] == "tick_started"]


def evaluate(events: list[Event], truth: dict[str, Truth]) -> Result:
    """Compare a run's events with the ground truth (`ground_truth` for the real data)."""
    ticks = run_ticks(events)
    high_at: dict[str, int] = {}
    alert_at: dict[str, int] = {}
    unbacked_high: list[tuple[str, str, str]] = []
    unbacked_alerts: list[tuple[str, str]] = []
    alerts = repairs = clamps = deception = 0
    verdicts: Counter[str] = Counter()
    turns: Counter[str] = Counter()
    for e in events:
        kind = e["type"]
        minute = to_minutes(e["tick"]) if "tick" in e else 0
        if kind == "level_changed" and e["to_level"] == "HIGH" and e["track_id"] not in high_at:
            tid = e["track_id"]
            high_at[tid] = minute
            if minute not in truth.get(tid, Truth("", 0, "")).minutes:
                unbacked_high.append((tid, e["tick"], "within 1 km of the base only"))
        elif kind == "operator_alert":
            alerts += 1
            alert = e["alert"]
            for tid in alert["track_ids"]:
                alert_at.setdefault(tid, minute)
            if not any(
                minute in truth.get(t, Truth("", 0, "")).minutes for t in alert["track_ids"]
            ):
                unbacked_alerts.append((e["tick"], alert["headline"]))
        elif kind in ("watcher_report", "supervisor_decision"):
            turns[e["generated_by"]] += 1
            checks = (e.get("report") or e.get("decision") or {}).get("report_checks", [])
            for c in checks:
                verdicts[c["verdict"]] += 1
                deception += bool(c.get("deception"))
        elif kind == "warning":
            msg = e["message"]
            repairs += msg.startswith("invalid submit")
            clamps += "clamped" in msg or "may be at most" in msg
    return Result(
        ticks, truth, high_at, alert_at, unbacked_high, unbacked_alerts, alerts, verdicts,
        deception, turns, repairs, clamps,
    )  # fmt: skip


def _latency(first: int, at: int | None) -> str:
    return "–" if at is None else f"{max(0, at - first)} min"


def headline(r: Result) -> list[str]:
    """The numbers for a slide."""
    lines = []
    for kind, label in (
        ("pattern", "Looping/orbiting vehicles within 5 km"),
        ("approach", "Fast close approaches"),
    ):
        ids = [t for t, v in r.truth.items() if v.kind == kind]
        if not ids:
            lines.append(f"{label}: none in this run.")
            continue
        high = [t for t in ids if t in r.high_at]
        alerted = [t for t in ids if t in r.alert_at]
        lat = [max(0, r.high_at[t] - r.truth[t].first_min) for t in high]
        med = f", median {median(lat):.0f} min after code could see it" if lat else ""
        lines.append(
            f"{label}: {len(high)}/{len(ids)} rated HIGH{med}; {len(alerted)}/{len(ids)} named in "
            "an operator alert."
        )
    lines.append(
        f"HIGH ratings not backed by a code rule: {len(r.unbacked_high)} of {len(r.high_at)}; "
        f"operator alerts not backed: {len(r.unbacked_alerts)} of {r.alerts}."
    )
    lines.append(
        f"Agent turns: {sum(r.turns.values())} ({r.turns['fallback']} rules fallbacks); "
        f"code sent {r.repairs} invalid answers back for repair and capped {r.clamps} levels."
    )
    judged = sum(r.report_verdicts.values())
    if judged:
        parts = ", ".join(
            f"{r.report_verdicts[v]} {v.lower()}"
            for v in ("CONTRADICTED", "UNVERIFIABLE", "CONSISTENT", "IRRELEVANT")
        )
        lines.append(
            f"Field-report judgments: {judged} ({parts}); "
            f"{r.deception} flagged as possible deception."
        )
    return lines


def markdown(r: Result, name: str) -> str:
    """Full report: headline, per-vehicle table, unbacked decisions, method."""
    span = f"{to_hhmm(r.ticks[0])}-{to_hhmm(r.ticks[-1])}" if r.ticks else "-"
    out = [f"# Watch run evaluation: {name} ({span}, {len(r.ticks)} ticks)", "", "## Headline", ""]
    out += [f"- {line}" for line in headline(r)]
    out += ["", "## Must-catch vehicles (code ground truth)", "",
            "| Vehicle | Why (code) | Visible from | Rated HIGH | Delay | In an alert | Delay |",
            "|---|---|---|---|---|---|---|"]  # fmt: skip
    for tid, t in sorted(
        r.truth.items(), key=lambda kv: (kv[1].kind != "pattern", kv[1].first_min)
    ):
        high, alert = r.high_at.get(tid), r.alert_at.get(tid)
        out.append(
            f"| {tid} | {t.detail} | {to_hhmm(t.first_min)} | "
            f"{to_hhmm(high) if high is not None else 'no'} | {_latency(t.first_min, high)} | "
            f"{to_hhmm(alert) if alert is not None else 'no'} | {_latency(t.first_min, alert)} |"
        )
    out += ["", "## Decisions no code rule backs", ""]
    out += [f"- HIGH {tid} at {tick}: {why}" for tid, tick, why in r.unbacked_high] or [
        "- HIGH: none"
    ]
    out += [f"- Alert at {tick}: {h}" for tick, h in r.unbacked_alerts] or ["- Alerts: none"]
    out += [
        "",
        "## Method",
        "",
        "Ground truth is recomputed from the raw tracks at every tick with the same deterministic "
        "code the system uses (`behavior_class`, `level_ceiling`), not from anything the agents "
        "wrote. A vehicle is must-catch while it loops around or orbits the base within 5 km, or "
        "approaches fast enough that the ceiling's approach rule allows HIGH. 'Rated HIGH' is the "
        "first HIGH an agent gave (a watcher's raise still waiting for its confirming check "
        "counts: it is on the map). Delay = first HIGH (or alert) minus the first tick the rule "
        "held; watchers take turns over sectors, so a vehicle can wait a tick before its sector is "
        "checked. Vehicles within 1 km of the base may be HIGH by the ceiling but are not "
        "must-catch unless they approach fast (most are parked cars), so a HIGH for them alone "
        "counts as not backed.",
    ]
    return "\n".join(out) + "\n"


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("run", type=Path, help="recording or traced run (JSONL events)")
    ap.add_argument("--out", type=Path, help="write the Markdown report here")
    args = ap.parse_args()
    events = [
        json.loads(line) for line in args.run.read_text(encoding="utf-8").splitlines() if line
    ]
    settings = Settings()
    truth = ground_truth(Repository(settings.data_dir), settings, run_ticks(events))
    result = evaluate(events, truth)
    print("\n".join(headline(result)))
    if args.out:
        args.out.write_text(markdown(result, args.run.stem), encoding="utf-8")
        print(f"wrote {args.out}")


if __name__ == "__main__":
    main()

"""Watch mode tick loop (docs/AGENT_FLOW.md §3).

Each tick: run the detector on any drone frame captured now and match its boxes to tracks (vehicle
types go into the registry), let every watcher check one sector of its area (they take turns when
there are fewer watchers than sectors; a frame's sector gets priority), apply their levels and notes
under the registry rules, run the supervisor on the whole board, and emit events. One `WatchRunner`
holds the state of one replayed day.
"""

import asyncio
import logging
import random
import time
from collections.abc import Callable
from typing import Any

from app.agent.llm_client import ChatLLM
from app.agent.watch import supervisor as supervisor_mod
from app.agent.watch import watcher as watcher_mod
from app.agent.watch.boards import AlertBoard, TrackerBoard
from app.agent.watch.registry import CarRegistry, LevelChange, level_index
from app.agent.watch.supervisor import SupervisorInput, SupervisorOutcome, run_supervisor
from app.agent.watch.tools import WatchContext
from app.agent.watch.watcher import WatcherInput, WatcherOutcome, needs_judgment, run_watcher
from app.core.config import Settings
from app.core.errors import DetectorError, NotFoundError
from app.core.timefmt import to_hhmm
from app.data.repository import Repository
from app.domain.image import ImageMeta
from app.domain.report import ReportClaim
from app.domain.watch import (
    AgentTraceEvent,
    FrameAnalyzedEvent,
    LevelChangedEvent,
    OperatorAlertEvent,
    SupervisorDecisionEvent,
    TickCompletedEvent,
    TickStartedEvent,
    TrackerUpdateEvent,
    VehicleRow,
    WarningEvent,
    WatcherReport,
    WatcherReportEvent,
)
from app.services import watch as watch_svc
from app.services.detection import Detector
from app.services.reports import extract_claim
from app.services.tracks import tracks_at

logger = logging.getLogger(__name__)
EventSink = Callable[[Any], None]
RECENT_EVENTS_KEPT = 15


class WatchRunner:
    """State and tick loop of one watch run."""

    def __init__(
        self,
        repo: Repository,
        settings: Settings,
        llm: ChatLLM | None,
        on_event: EventSink,
        detector: Detector | None = None,
    ) -> None:
        self.repo, self.settings, self.llm, self.emit = repo, settings, llm, on_event
        self.detector = detector
        self.registry = CarRegistry()
        self.trackers = TrackerBoard(settings.tracker_slots)
        self.alerts = AlertBoard()
        self.claims: list[ReportClaim] = [extract_claim(r, repo.scene.zones) for r in repo.reports]
        self.groups = watch_svc.watcher_groups(
            repo.scene.zones, repo.scene.base.position, settings.watcher_count
        )
        self._next: dict[str, int] = {w: 0 for w in self.groups}
        self._last_checked: dict[str, int] = {}
        self._prev_sector: dict[str, str] = {}
        self._recent: list[dict[str, Any]] = []

    async def run(self, start_min: int, end_min: int) -> None:
        """Replay every tick from start to end (inclusive)."""
        for minute in watch_svc.ticks(start_min, end_min):
            await self.tick(minute)

    # ---- one tick ----

    async def tick(self, minute: int) -> None:
        """Run one 5-minute tick end to end."""
        started = time.perf_counter()
        tick = to_hhmm(minute)
        frames = [m for m in self.repo.list_images() if m.capture_min == minute]
        checks = self._schedule(frames)
        active = sum(1 for t in self.repo.tracks.values() if watch_svc.track_until(t, minute))
        self.emit(
            TickStartedEvent(
                tick=tick,
                active_vehicles=active,
                frames=[f.image_id for f in frames],
                checks=checks,
            )
        )
        frame_events = [await self._analyze_frame(f, minute) for f in frames]
        for fe in frame_events:
            self.emit(fe)
        rows = self._rows(minute)
        ctx = WatchContext(
            repo=self.repo,
            settings=self.settings,
            tick_min=minute,
            claims=self.claims,
            registry=self.registry,
            trackers=self.trackers,
            alerts=self.alerts,
            rows={r.track_id: r for r in rows},
        )
        new_claims = watch_svc.claims_between(self.claims, minute - watch_svc.TICK_MIN, minute)

        inputs = [
            self._watcher_input(w, sector, tick, minute, rows, frame_events, new_claims)
            for w, sector in checks.items()
        ]
        for inp in inputs:
            if not inp.rows:
                self.emit(self._empty_report_event(tick, inp))
        busy = [i for i in inputs if i.rows]
        outcomes = await asyncio.gather(*(run_watcher(self.llm, ctx, i) for i in busy))
        for inp, outcome in zip(busy, outcomes, strict=True):
            self._apply_watcher(tick, inp, outcome)
        for sector in checks.values():
            self._last_checked[sector] = minute

        sup_input = SupervisorInput(
            tick=tick,
            watcher_messages=[
                self._watcher_message(i, o) for i, o in zip(busy, outcomes, strict=True)
            ],
            unchecked=self._unchecked(set(checks.values()), rows),
            frames=[self._frame_block(fe) for fe in frame_events],
            recent_events=list(self._recent),
            area_reports=[
                {"report_id": c.report_id, "time": c.time, "source": c.source, "text": c.text}
                for c in watch_svc.area_claims(new_claims)
            ],
            layout=self.groups,
        )
        sup = await run_supervisor(self.llm, ctx, sup_input)
        self._apply_supervisor(tick, sup)

        if self.settings.trackers_enabled:
            for tracker in self.trackers.update(minute, self.repo.tracks, ctx.base):
                self.emit(TrackerUpdateEvent(tick=tick, tracker=tracker))
                if tracker.state == "LOST":
                    self.registry.get(tracker.track_id).tracker_id = None

        for r in rows:
            self._prev_sector[r.track_id] = r.sector
        counts = {lvl: 0 for lvl in ("LOW", "MEDIUM", "HIGH")}
        for r in rows:
            counts[self.registry.effective_level(r.track_id)] += 1
        self.emit(
            TickCompletedEvent(
                tick=tick, duration_ms=round((time.perf_counter() - started) * 1000), levels=counts
            )
        )

    # ---- scheduling and frames ----

    def _schedule(self, frames: list[ImageMeta]) -> dict[str, str]:
        """Watcher -> sector to check: a frame's sector first, else the next in its rotation."""
        frame_sectors = [f.zone for f in frames if f.zone]
        checks: dict[str, str] = {}
        for wid, area in self.groups.items():
            with_frame = [s for s in frame_sectors if s in area]
            idx = area.index(with_frame[0]) if with_frame else self._next[wid] % len(area)
            checks[wid] = area[idx]
            self._next[wid] = idx + 1
        return checks

    async def _analyze_frame(self, meta: ImageMeta, minute: int) -> FrameAnalyzedEvent:
        """Detect vehicles in a frame and match them to the tracks at capture time."""
        positions = tracks_at(list(self.repo.tracks.values()), minute)
        inside = sorted(t for t, p in positions.items() if watch_svc.in_frame(meta, p))
        tick, sector = to_hhmm(minute), meta.zone or ""
        if self.detector is None:
            return FrameAnalyzedEvent(
                tick=tick,
                image_id=meta.image_id,
                sector=sector,
                status="detector_unavailable",
                detections=[],
                tracks_in_frame=inside,
                note="no detector configured",
            )
        try:
            path = self.repo.image_path(meta.image_id)
        except NotFoundError:
            path = None  # precomputed detections need no file; YOLO raises DetectorError
        try:
            raw = await asyncio.to_thread(self.detector.detect, meta.image_id, path)
        except DetectorError as exc:
            return FrameAnalyzedEvent(
                tick=tick,
                image_id=meta.image_id,
                sector=sector,
                status="detector_unavailable",
                detections=[],
                tracks_in_frame=inside,
                note=exc.detail,
            )
        dets = watch_svc.frame_detections(raw, meta, positions, self.settings.match_max_m)
        for d in dets:
            if d.track_id:
                self.registry.get(d.track_id).vehicle_type = d.label
        matched = sum(1 for d in dets if d.track_id)
        return FrameAnalyzedEvent(
            tick=tick,
            image_id=meta.image_id,
            sector=sector,
            status="ok",
            detections=dets,
            tracks_in_frame=inside,
            note=f"{len(dets)} detections, {matched} matched to tracks",
        )

    @staticmethod
    def _frame_block(fe: FrameAnalyzedEvent) -> dict[str, Any]:
        matched = {d.track_id for d in fe.detections if d.track_id}
        return {
            "image_id": fe.image_id,
            "evidence_id": f"FRAME-{fe.image_id}",
            "sector": fe.sector,
            "status": fe.status,
            "detections": [d.model_dump(mode="json", exclude={"position"}) for d in fe.detections],
            "tracked_vehicles_without_detection": [
                t for t in fe.tracks_in_frame if t not in matched
            ],
        }

    # ---- rows, inputs and messages ----

    def _rows(self, minute: int) -> list[VehicleRow]:
        zones, base = self.repo.scene.zones, self.repo.scene.base.position
        rows: list[VehicleRow] = []
        for tid, track in self.repo.tracks.items():
            upto = watch_svc.track_until(track, minute)
            if upto is None:
                continue
            entry = self.registry.get(tid)
            rows.append(
                watch_svc.vehicle_row(
                    upto,
                    minute,
                    base,
                    zones,
                    stop_speed_ms=self.settings.stop_speed_ms,
                    zone_radius_m=self.settings.zone_radius_m,
                    prev_sector=self._prev_sector.get(tid),
                    registry_level=entry.level,
                    pending_level=entry.pending.level if entry.pending else None,
                    notes_count=len(entry.notes),
                    lang=self.settings.brief_language,
                    vehicle_type=entry.vehicle_type,
                )
            )
        return rows

    def _sector_at(self, track_id: str, minute: int) -> str | None:
        point = next((p for p in self.repo.tracks[track_id].points if p.time_min == minute), None)
        return watch_svc.sector_of(point.position, self.repo.scene.zones) if point else None

    def _watcher_input(
        self,
        wid: str,
        sector: str,
        tick: str,
        minute: int,
        rows: list[VehicleRow],
        frame_events: list[FrameAnalyzedEvent],
        new_claims: list[ReportClaim],
    ) -> WatcherInput:
        mine = [r for r in rows if r.sector == sector]
        last = self._last_checked.get(sector)
        ref = last if last is not None else minute - watch_svc.TICK_MIN
        arrivals = []
        for r in mine:
            before = self._sector_at(r.track_id, ref)
            if before == sector:
                continue
            pts = [p for p in self.repo.tracks[r.track_id].points if p.time_min <= minute]
            arrivals.append(
                {
                    "track_id": r.track_id,
                    "came_from": before,
                    "route_so_far": [
                        [p.time, round(p.position.lat, 6), round(p.position.lon, 6)] for p in pts
                    ],
                }
            )
        quiet = [r.track_id for r in mine if not needs_judgment(r)]
        rng = random.Random(f"{tick}|{sector}")  # seeded: the same run samples the same vehicles
        spot = sorted(rng.sample(quiet, min(self.settings.watcher_spot_checks, len(quiet))))
        return WatcherInput(
            spot_checks=spot,
            watcher_id=wid,
            area=self.groups[wid],
            sectors=[sector],
            last_checked=to_hhmm(last) if last is not None else None,
            tick=tick,
            rows=mine,
            new_arrivals=arrivals,
            notes=[n for r in mine for n in self.registry.get(r.track_id).notes],
            frames=[self._frame_block(fe) for fe in frame_events if fe.sector == sector],
            reports=watch_svc.claims_for_sectors(new_claims, [sector], self.repo.scene.zones),
        )

    @staticmethod
    def _empty_report_event(tick: str, inp: WatcherInput) -> WatcherReportEvent:
        report = WatcherReport(tick=tick, street_state="No vehicles.", vehicles=[], patterns=[])
        return WatcherReportEvent(
            tick=tick,
            watcher=inp.watcher_id,
            sectors=inp.sectors,
            generated_by="fallback",
            duration_ms=0,
            rows=[],
            report=report,
            tool_calls=[],
            warnings=[],
        )

    def _apply_watcher(self, tick: str, inp: WatcherInput, outcome: WatcherOutcome) -> None:
        by = f"watcher:{inp.watcher_id}"
        for v in outcome.report.vehicles:
            change = self.registry.propose(v.track_id, v.level, tick, by, v.reason)
            if change:
                self._emit_change(tick, change)
            if v.note:
                self.registry.add_note(v.track_id, tick, by, v.level, v.note, v.evidence_ids)
        for w in outcome.warnings:
            self.emit(WarningEvent(tick=tick, scope=by, message=w))
        if outcome.system:
            self.emit(
                AgentTraceEvent(
                    tick=tick,
                    agent=by,
                    prompt_file=watcher_mod.PROMPT,
                    system_prompt=outcome.system,
                    user_message=outcome.user,
                    steps=outcome.trace,
                    output=outcome.report.model_dump(mode="json"),
                    generated_by=outcome.generated_by,
                    duration_ms=outcome.duration_ms,
                )
            )
        self.emit(
            WatcherReportEvent(
                tick=tick,
                watcher=inp.watcher_id,
                sectors=inp.sectors,
                generated_by=outcome.generated_by,
                duration_ms=outcome.duration_ms,
                rows=inp.rows,
                report=outcome.report,
                tool_calls=outcome.tool_calls,
                warnings=outcome.warnings,
            )
        )
        for a in inp.new_arrivals:
            if self.registry.effective_level(a["track_id"]) != "LOW":
                detail = f"from {a['came_from']} into {inp.sectors[0]}"
                self._remember(tick, "handoff", a["track_id"], detail)

    def _suspicious(self, rows: list[VehicleRow], verdicts: dict[str, Any]) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        for row in rows:
            level = self.registry.effective_level(row.track_id)
            if level == "LOW":
                continue
            entry = self.registry.get(row.track_id)
            v = verdicts.get(row.track_id)
            out.append(
                {
                    "track_id": row.track_id,
                    "vehicle_type": row.vehicle_type,
                    "level": level,
                    "pending": entry.pending is not None,
                    "dist_to_base_m": row.dist_to_base_m,
                    "closing_last5_m_per_min": row.closing_last5_m_per_min,
                    "eta_to_base_min": row.eta_to_base_min,
                    "alerted": bool(entry.alert_ids),
                    "reason": v.reason if v else "(level from an earlier check)",
                    "evidence_ids": v.evidence_ids if v else [f"TRK-{row.track_id}"],
                }
            )
        out.sort(key=lambda s: (-level_index(s["level"]), s["dist_to_base_m"]))
        return out

    def _watcher_message(self, inp: WatcherInput, outcome: WatcherOutcome) -> dict[str, Any]:
        verdicts = {v.track_id: v for v in outcome.report.vehicles}
        return {
            "watcher": inp.watcher_id,
            "sector": inp.sectors[0],
            "generated_by": outcome.generated_by,
            "street_state": outcome.report.street_state,
            "suspicious": self._suspicious(inp.rows, verdicts),
            "patterns": [p.model_dump(mode="json") for p in outcome.report.patterns],
        }

    def _unchecked(self, checked: set[str], rows: list[VehicleRow]) -> list[dict[str, Any]]:
        out = []
        for area in self.groups.values():
            for sector in area:
                if sector in checked:
                    continue
                last = self._last_checked.get(sector)
                out.append(
                    {
                        "sector": sector,
                        "last_checked": to_hhmm(last) if last is not None else None,
                        "vehicles": self._suspicious([r for r in rows if r.sector == sector], {}),
                    }
                )
        return out

    def _apply_supervisor(self, tick: str, sup: SupervisorOutcome) -> None:
        for change in sup.level_changes:
            self._emit_change(tick, change)
        for tracker in sup.trackers:
            self.emit(TrackerUpdateEvent(tick=tick, tracker=tracker))
        for alert in sup.alerts:
            self.emit(OperatorAlertEvent(tick=tick, alert=alert))
            detail = f"{alert.alert_id}: {alert.headline}"
            self._remember(tick, "operator_alert", ",".join(alert.track_ids), detail)
        for w in sup.warnings:
            self.emit(WarningEvent(tick=tick, scope="supervisor", message=w))
        if sup.system:
            self.emit(
                AgentTraceEvent(
                    tick=tick,
                    agent="supervisor",
                    prompt_file=supervisor_mod.PROMPT,
                    system_prompt=sup.system,
                    user_message=sup.user,
                    steps=sup.trace,
                    output=sup.decision.model_dump(mode="json"),
                    generated_by=sup.generated_by,
                    duration_ms=sup.duration_ms,
                )
            )
        self.emit(
            SupervisorDecisionEvent(
                tick=tick,
                generated_by=sup.generated_by,
                duration_ms=sup.duration_ms,
                decision=sup.decision,
                actions=sup.actions,
                tool_calls=sup.tool_calls,
                warnings=sup.warnings,
            )
        )

    def _emit_change(self, tick: str, change: LevelChange) -> None:
        self.emit(
            LevelChangedEvent(
                tick=tick,
                track_id=change.track_id,
                from_level=change.from_level,
                to_level=change.to_level,
                by=change.by,
                pending=change.pending,
                reason=change.reason,
            )
        )
        if not change.pending:
            detail = f"{change.from_level} -> {change.to_level} by {change.by}"
            self._remember(tick, "level_changed", change.track_id, detail)

    def _remember(self, tick: str, kind: str, track_id: str, detail: str) -> None:
        self._recent.append({"tick": tick, "event": kind, "track_id": track_id, "detail": detail})
        del self._recent[:-RECENT_EVENTS_KEPT]

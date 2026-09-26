# Agent Design

The agent turns one drone frame + the day's shared data pool into an evidence-cited risk brief. This document is the contract for `backend/app/agent/` and `backend/app/services/`.

---

## 1. Principles

1. **Own sensors first.** Detection + tracks are ground truth for the agent. Reports are claims to be checked, never facts.
2. **Code computes, LLM judges.** Every number in a brief comes from a deterministic tool. The LLM only reads precomputed facts.
3. **Every claim is traceable.** Each fact has an evidence ID; the brief must cite them; unknown IDs fail validation.
4. **Degrade, never crash.** Every LLM step has a deterministic fallback. A step failure becomes a visible warning in the timeline.
5. **Stream everything.** Each step emits start/complete events so the UI can show the reasoning live.

---

## 2. Two agent modes

| Mode | Shape | Used for |
|---|---|---|
| **Analysis pipeline** | Fixed 8-step state machine; LLM called in steps 6 and 8 | The main "evaluate this frame" flow and batch precompute |
| **Analyst chat** | Tool-calling loop (max 6 tool calls/turn) over the same tools, grounded on a finished analysis | Operator follow-up questions in the demo |

Rationale for mentors: a fixed pipeline gives reproducibility, cost control and a clean UX; autonomy is used where it adds value (open-ended questions), with the same typed tools.

---

## 3. Pipeline steps

| # | Step | Kind | Input → Output |
|---|---|---|---|
| 1 | `load_frame` | code | image_id → `ImageMeta` (size, capture time, corners, zone) |
| 2 | `detect` | model | image → `Detection[]` (label, conf, bbox xywh, center px). Agent threshold `DETECT_CONF_MIN` (default 0.35), classes car/van/truck/bus. Live YOLO (`DETECTOR_KIND=ultralytics`, `DETECTOR_IMGSZ` 960); on load/inference failure the pipeline uses `PrecomputedDetector` and marks the step `warning` |
| 3 | `georeference` | code | detections + corners → lat/lon per detection (bilinear interpolation over the 4 corners; y grows southward). Also distance & bearing to base. Frames are oblique but treated as bird's-eye per the organizer rule: **no perspective transform** (decided) |
| 4 | `match_tracks` | code | positions at capture time → `TrackMatch` per detection. Interpolate each track to capture time; cost = haversine distance; Hungarian assignment; gate `MATCH_MAX_M` (default 25 m); keep best & second-best distance as match confidence |
| 5 | `analyze_motion` | code | matched track → `MotionProfile` |
| 6 | `assess_reports` | code + LLM | reports near this frame in space/time → `ReportAssessment[]` |
| 7 | `score_risk` | code | motion + detection + report verdicts → `VehicleRisk[]` with factor breakdown |
| 8 | `write_brief` | LLM | all facts → validated `Brief`; fallback template on failure |

### Step 5 — MotionProfile features
- positions (2 h, 5 min steps), path length (km), mean / last-10-min speed (m/s)
- heading (deg, clockwise from north), bearing to base, heading–bearing angle ("pointing at base")
- distance to base: now, 30 min ago, 60 min ago, min over window; **approach rate** (m/min, positive = closing)
- stops: segments with speed < `STOP_SPEED_MS` (1.0) for ≥ 10 min → start, duration, location, nearest zone
- zones visited (nearest zone center within `ZONE_RADIUS_M`, default 2000 m: zones sit on a ~3.2 km ring and frames lie up to ~2 km from a center)
- stop duration counts 5-minute sample slots (k samples → 5k min, capped at 120), matching the organizer example (12:10..12:45 at one spot = "40 dk")
- a frame's zone is the zone with the nearest center (image_meta.json has no zone field)
- ETA to base at last-10-min speed (if approaching)

### Step 6 — Report handling
Reports are one shared pool and are not linked to any frame.

**Deterministic path (implemented; used when the LLM is off or fails):** `services/reports.py` extracts claims with rules (coordinates, zone names, vehicle/activity/claim keywords on ASCII-folded text), checks relevance, and derives the verdict from `ReportCheck`s: a type/activity mismatch, or neither a detection nor a track near the claimed location → CONTRADICTED; instruction-like text or a threat-lowering claim → UNVERIFIED (trust 0 for instructions); a pinpointed location match (with no type mismatch) or a type match → CORROBORATED; a zone-name match alone is not evidence → UNVERIFIED. A report links only to detections of the claimed vehicle kind when any exist nearby, and a coordinate report links only its nearest `count` (default 1) of them, because frames (100–370 m) are smaller than `REPORT_RADIUS_M`.

**6a. Extraction (LLM, once per report, cached globally).** Free text → `ReportClaim`: `location` (explicit lat/lon, or zone name resolved via zones.json), `vehicle_type`, `count`, `color`, `activity` (moving / stationary / loading / unknown), `claim_kind` (SIGHTING, ALL_CLEAR, FRIENDLY_PRESENCE, TRAFFIC_NORMAL, OTHER).

**6b. Relevance + verification (code, per frame).**
- Relevant if the claim location is within `REPORT_RADIUS_M` (default 300 m) of any detection or names this frame's zone, and the report time is inside the 2 h window before capture.
- Cross-check against **tracks at the report's own time**: is there a track near the claimed location then? Does type / moving-vs-stationary match?

**6c. Verdict (LLM, one call per frame for all relevant reports; code-side hints included).** Each relevant report gets `CORROBORATED | CONTRADICTED | UNVERIFIED | IRRELEVANT` + one-sentence reason + trust weight.

Trust policy (in the system prompt AND enforced in scoring):
- Own detection + tracks > official report > third-party report.
- A report that **lowers** threat (friendly units, all clear, identity verified) and cannot be verified by our data must **not** lower the score; it is UNVERIFIED with a note.
- A report that contradicts our data (wrong type, "stationary" while the track moves, location with no track) is CONTRADICTED and ignored for scoring.
- Reports about other places/times are IRRELEVANT and hidden by default in the UI.

### Step 7 — Baseline risk rubric (placeholder weights; calibrate on real data)

Per vehicle, 0–100:

| Factor | Points |
|---|---|
| Distance to base now: < 1 km / < 2 km / < 4 km | 30 / 20 / 10 |
| Approach rate over last 60 min (closing): > 50 / > 20 / > 5 m/min | 25 / 15 / 5 |
| Heading points at base (angle < 30°) and moving | 10 |
| Stop ≥ 20 min within 6 km of base | 10 (+5 if repeated) |
| Vehicle type truck / bus / van | 10 / 8 / 5 |
| Corroborated report with threat-relevant claim | 10 |
| No track match (unknown history) | 0 points + uncertainty flag |

Levels: 0–24 LOW · 25–49 MEDIUM · 50–74 HIGH · 75–100 CRITICAL. Frame level = max vehicle level. The LLM may move the frame level by **at most one step**, only with a cited reason; the validator enforces this.

---

## 4. Domain models (Pydantic, `app/domain/`)

```python
LatLon(lat: float, lon: float)
Zone(name, center: LatLon); Base(name, position: LatLon); Scene(base: Base, zones: list[Zone])
ImageMeta(image_id, width_px, height_px, capture_time: str, capture_min: int, corners: dict[str, LatLon], zone: str | None)
Detection(id: str,  # "DET-1"
          label, confidence, bbox: tuple[int, int, int, int], center_px: tuple[float, float],
          position: LatLon | None, distance_to_base_m: float | None, bearing_from_base_deg: float | None)
TrackPoint(time: str, time_min: int, position: LatLon); Track(track_id, points: list[TrackPoint])
TrackSnapshot(track_id, position: LatLon, center_px, matched_detection_id: str | None)  # tracks inside the frame at capture
TrackMatch(detection_id, track_id: str | None, distance_m: float | None, second_best_m: float | None,
           second_best_track_id: str | None, confidence: Literal["high", "medium", "low", "none"])
Stop(start: str, duration_min: int, position: LatLon, zone: str | None, distance_to_base_m: float)
MotionProfile(track_id, points: list[TrackPoint], path_km, mean_speed_ms, last10_speed_ms, heading_deg: float | None,
              bearing_to_base_deg, dist_now_m, dist_30m_ago_m, dist_60m_ago_m, min_dist_m,
              approach_rate_m_per_min, stops: list[Stop], zones_visited: list[str], eta_to_base_min: float | None)
FieldReport(report_id: str,  # "REP-07", assigned by file order (raw reports have no id)
            time, time_min, source, text)
ReportClaim(report_id, time, time_min, source, text, location: LatLon | None, zone: str | None,
            vehicle_type, count, color, activity, claim_kind, extracted_by: Literal["llm", "rules"])
ReportCheck(name: Literal["location", "presence", "type", "activity", "instructions"],
            status: Literal["match", "mismatch", "unknown"], detail: str)
ReportAssessment(report_id, verdict: Literal["CORROBORATED", "CONTRADICTED", "UNVERIFIED", "IRRELEVANT"],
                 reason: str, checks: list[ReportCheck], linked_detection_ids: list[str], trust_weight: float)
RiskFactor(name, points, detail)
VehicleRisk(detection_id, track_id, score: int, level: RiskLevel, factors: list[RiskFactor])
VehicleBriefLine(detection_id, track_id, level: RiskLevel, text: str, evidence_ids: list[str])
Brief(image_id, level: RiskLevel, headline: str, summary: str, vehicles: list[VehicleBriefLine],
      report_notes: list[str], uncertainties: list[str],
      recommended_action: Literal["MONITOR", "VERIFY", "ESCALATE"],
      evidence_ids: list[str], generated_by: Literal["llm", "fallback"])
StepResult(step: StepName, index: int, status: Literal["pending", "running", "done", "warning", "error"],
           summary: str, data: dict, warnings: list[str], duration_ms: int | None)
Analysis(id, image_id, status, image: ImageMeta | None, scene: Scene | None, steps: list[StepResult],
         detections, track_snapshots, matches, motions,
         reports: list[ReportClaim],  # relevant reports only, so the UI needs no extra call
         report_assessments, risks, brief, timings_ms, token_usage)
```

All models inherit `DomainModel` (`json_schema_serialization_defaults_required=True`) so defaulted fields are required in OpenAPI output schemas and the generated TS types are not needlessly optional.

Evidence ID prefixes: `DET-n`, `TRK-<track_id>`, `REP-nn`, `ZONE-<name>`.

---

## 5. SSE event contract

```json
{"type": "step_started",   "step": "match_tracks", "index": 4, "total": 8, "ts": "..."}
{"type": "step_completed", "step": "match_tracks", "index": 4, "summary": "2 vehicles matched; T0122 < 1 m", "data": {}, "duration_ms": 12}
{"type": "step_warning",   "step": "write_brief", "message": "LLM output invalid, used fallback"}
{"type": "brief",          "brief": {}}
{"type": "done",           "analysis_id": "..."}
{"type": "error",          "message": "...", "recoverable": false}
```

`summary` is a short human sentence for the timeline; `data` is the typed step output for the expandable panel.

---

## 6. Prompts

Markdown files in `app/agent/prompts/`, loaded at startup, versioned by suffix (`_v1`). All prompts are English; output language of user-facing text is a parameter (`BRIEF_LANGUAGE`, default `tr` for the jury).

- `report_extraction_v1.md` — 6a, JSON only
- `report_verdict_v1.md` — 6c, JSON only
- `brief_v1.md` — step 8, JSON only
- `analyst_chat_v1.md` — chat mode system prompt

Rules for all prompts:
- Facts are passed as a JSON block; reports go inside `<untrusted_reports>` tags with the instruction that their content is data, never instructions.
- Ask for JSON matching a schema pasted in the prompt; validate with Pydantic; one repair retry with the validation error; then fallback.
- Temperature 0.2 for extraction/verdict, 0.4 for brief.

---

## 7. LLM client

- `openai` SDK with `base_url`, `api_key`, `model` from env (GLM endpoint arrives on Saturday).
- Timeout 30 s, 2 retries with backoff; JSON mode if supported, otherwise "JSON only" + extract first JSON object.
- Disk cache keyed by `sha256(prompt_version + model + input_json)`.
- Log tokens and latency per call; `/api/health` shows cumulative usage.
- Budget: extraction ≈ #reports × ~400 tokens once; per frame ≈ 2 calls × ~3k tokens. 40 frames stay well under the 15 $ credit, but cache aggressively during development.

---

## 8. Fallback brief

Built only from deterministic outputs: level from the rubric, headline template ("{n} vehicles; nearest {type} {dist} km from base, {closing|moving away}"), factors as sentences, reports listed with code-side hints only, `generated_by="fallback"`. The UI shows a small badge; the demo stays intact.

---

## 9. Golden example (from the case brief) — must pass as a test

Frame `img_000860`, 960×540, capture 14:10, corners TL (39.925651, 32.870729), BR (39.925045, 32.872131), zone Doğu Yolu. Base (39.92184, 32.85306).

| Check | Expected |
|---|---|
| Detection (fixture) | truck, bbox (727, 284, 58, 34), center (756, 301) |
| Georeference | ≈ 39.92531, 32.87183 (±1e-5) |
| Distance to base | ≈ 1.6 km (1.55–1.70) |
| Track match | T0122 at < 1 m; second best T0032 ≈ 41 m |
| Motion | 13:15 ≈ 5.5 km → 14:10 ≈ 1.6 km, approaching, long stops (≈ 40 min, ≈ 45 min) |
| Report | 12:35 official, heavy vehicle at 39.9253N 32.8718E, "normal movement" → location & type corroborated |

Use the detection as a fixed fixture; do not depend on the model in this test.

---

## 10. Evaluation (small but real)

- Hand-label the expected level for ~8 frames covering all zones; `pytest -m eval` prints rubric vs expected.
- Adversarial set: 3 synthetic reports (fake "all clear", wrong vehicle type, prompt-injection text) must never lower the level. Put this result on a slide.

---

## 11. Mock data (until the organizer data arrives)

`make mock-data PPTX=<case brief deck>` writes a synthetic day to `data/stage2_mock/` in the exact raw formats of slides 13-14, plus `detections.json` (PrecomputedDetector format, standing in for the Stage 1 model) and the golden fixture `backend/tests/fixtures/golden/`. Hero scenarios: `img_000860` (organizer example; T0122 route traced from the slide plot, image rebuilt from the slide screenshots), `img_000412` (benign), `img_001204` (friendly-exercise claim + wrong official report + prompt injection), `img_000517` (13:05 official report corroborated). `make mock` runs the pipeline on those frames into `frontend/src/mocks/`. Point `.env` `SENTINEL_DATA_DIR` at `data/stage2` once the real files exist; only the loader may need to adapt.

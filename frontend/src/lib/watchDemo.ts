// Groups a recorded watch run's events by tick for the demo player. No domain logic: levels,
// reasons and alerts are exactly what the agents produced; this only indexes them.
import type { FieldReport, VehicleRow, WatchEvent, WatchEventOf, WatchLevel } from '@/api/types'

export interface TickView {
  tick: string
  minute: number
  start: WatchEventOf<'tick_started'>
  frames: WatchEventOf<'frame_analyzed'>[]
  watchers: WatchEventOf<'watcher_report'>[]
  traces: Map<string, WatchEventOf<'agent_trace'>> // agent ("watcher:W1", "supervisor") -> trace
  supervisor: WatchEventOf<'supervisor_decision'> | undefined
  alerts: WatchEventOf<'operator_alert'>[]
  changes: WatchEventOf<'level_changed'>[]
  done: WatchEventOf<'tick_completed'> | undefined
}

export interface VehicleState {
  level: WatchLevel
  pending: boolean
  /** Simulated minute the vehicle became HIGH (its agent finished writing); set while HIGH. */
  highSince?: number
}

/** Simulated minute at which `by` ("watcher:W1" / "supervisor") finished writing in a tick. */
function finishMinute(tv: TickView, by: string): number {
  const i = tv.watchers.findIndex((w) => `watcher:${w.watcher}` === by)
  const span = i >= 0 ? SCHEDULE.watcher(i) : SCHEDULE.supervisor
  return tv.minute - TICK_MIN + span.start + span.dur
}

/** Applies one level change; keeps `highSince` while the vehicle stays HIGH. */
function applyChange(levels: Map<string, VehicleState>, tv: TickView, c: WatchEventOf<'level_changed'>) {
  const prev = levels.get(c.track_id)
  const highSince =
    c.to_level !== 'HIGH' ? undefined : prev?.level === 'HIGH' ? prev.highSince : finishMinute(tv, c.by)
  levels.set(c.track_id, { level: c.to_level, pending: c.pending, highSince })
}

export interface DemoModel {
  ticks: TickView[]
  /** Registry level of every vehicle after each tick (index = tick index). */
  levelsAfter: Map<string, VehicleState>[]
  /** Latest code-computed row per vehicle seen by a watcher up to each tick. */
  rowsUpTo: (index: number) => Map<string, VehicleRow>
}

export const toMinute = (hhmm: string): number => {
  const [h = 0, m = 0] = hhmm.split(':').map(Number)
  return h * 60 + m
}

export function buildDemoModel(events: WatchEvent[]): DemoModel {
  const ticks: TickView[] = []
  let cur: TickView | undefined
  for (const e of events) {
    if (e.type === 'tick_started') {
      cur = {
        tick: e.tick,
        minute: toMinute(e.tick),
        start: e,
        frames: [],
        watchers: [],
        traces: new Map(),
        supervisor: undefined,
        alerts: [],
        changes: [],
        done: undefined,
      }
      ticks.push(cur)
      continue
    }
    if (!cur) continue
    if (e.type === 'frame_analyzed') cur.frames.push(e)
    else if (e.type === 'watcher_report') cur.watchers.push(e)
    else if (e.type === 'agent_trace') cur.traces.set(e.agent, e)
    else if (e.type === 'supervisor_decision') cur.supervisor = e
    else if (e.type === 'operator_alert') cur.alerts.push(e)
    else if (e.type === 'level_changed') cur.changes.push(e)
    else if (e.type === 'tick_completed') cur.done = e
  }

  const levelsAfter: Map<string, VehicleState>[] = []
  let levels = new Map<string, VehicleState>()
  for (const tv of ticks) {
    levels = new Map(levels)
    for (const c of tv.changes) applyChange(levels, tv, c)
    levelsAfter.push(levels)
  }

  const rowsUpTo = (index: number) => {
    const rows = new Map<string, VehicleRow>()
    for (const tv of ticks.slice(0, index + 1)) {
      for (const w of tv.watchers) for (const r of w.rows) rows.set(r.track_id, r)
    }
    return rows
  }

  return { ticks, levelsAfter, rowsUpTo }
}

/** A field report watchers passed to the supervisor in one tick: tied to vehicles, forwarded
 *  with a reason, or both. Older recordings have no `reports`; they yield nothing. */
export interface PassedReport {
  report: FieldReport
  watchers: string[]
  trackIds: string[]
  why: string | null
}

export function passedReports(watchers: WatchEventOf<'watcher_report'>[]): PassedReport[] {
  const out = new Map<string, PassedReport>()
  for (const w of watchers) {
    for (const report of w.reports ?? []) {
      const id = report.report_id
      const item = out.get(id) ?? { report, watchers: [], trackIds: [], why: null }
      if (!item.watchers.includes(w.watcher)) item.watchers.push(w.watcher)
      for (const v of w.report.vehicles) if (v.report_ids?.includes(id) && !item.trackIds.includes(v.track_id)) item.trackIds.push(v.track_id)
      item.why ??= w.report.forwarded_reports?.find((f) => f.report_id === id)?.why ?? null
      out.set(id, item)
    }
  }
  return [...out.values()].sort((a, b) => a.report.time_min - b.report.time_min)
}

/** Every watcher verdict about one vehicle up to a tick, oldest first; on the last tick only
 *  verdicts of agents in `done` (those that finished writing). */
export function verdictHistory(model: DemoModel, trackId: string, index: number, done?: Set<string>) {
  return model.ticks.slice(0, index + 1).flatMap((tv, i) =>
    tv.watchers
      .filter((w) => i < index || !done || done.has(`watcher:${w.watcher}`))
      .flatMap((w) =>
        w.report.vehicles
          .filter((v) => v.track_id === trackId)
          .map((v) => ({
            tick: tv.tick,
            watcher: w.watcher,
            sector: w.sectors[0] ?? '',
            verdict: v,
            reports: (w.reports ?? []).filter((r) => v.report_ids?.includes(r.report_id)),
          })),
      ),
  )
}

// ---- playback: each tick's outputs stream in during the 5 simulated minutes before the tick ----

export const TICK_MIN = 5

/** When each agent "types" inside a tick window, in simulated minutes from the window start.
 *  Watchers overlap (they run in parallel), then the supervisor, then its alert. */
export const SCHEDULE = {
  frame: 0.1,
  watcher: (i: number) => ({ start: 0.3 + i * 0.5, dur: 2.2 }),
  supervisor: { start: 3.0, dur: 1.6 },
  alert: { start: 3.6, dur: 1.3 },
} as const

export const progress = (elapsed: number, span: { start: number; dur: number }): number =>
  Math.max(0, Math.min(1, (elapsed - span.start) / span.dur))

export interface Playhead {
  index: number // tick being worked on (its outputs stream until the clock reaches it)
  elapsed: number // simulated minutes into its window, 0..5
}

/** The tick whose window (tick − 5, tick] contains `minute`. */
export function playheadAt(model: DemoModel, minute: number): Playhead {
  const i = model.ticks.findIndex((tv) => minute <= tv.minute)
  const index = i === -1 ? model.ticks.length - 1 : i
  const tick = model.ticks[index]
  const elapsed = tick ? Math.max(0, Math.min(TICK_MIN, minute - (tick.minute - TICK_MIN))) : TICK_MIN
  return { index, elapsed }
}

/** Agents of the current tick that have finished writing ("watcher:W1", "supervisor"). */
export function finishedAgents(model: DemoModel, head: Playhead): Set<string> {
  const tick = model.ticks[head.index]
  const done = new Set<string>()
  if (!tick) return done
  tick.watchers.forEach((w, i) => {
    if (progress(head.elapsed, SCHEDULE.watcher(i)) >= 1) done.add(`watcher:${w.watcher}`)
  })
  if (progress(head.elapsed, SCHEDULE.supervisor) >= 1) done.add('supervisor')
  return done
}

/** Vehicle levels at the playhead: previous tick's registry plus changes by finished agents. */
export function levelsAt(model: DemoModel, head: Playhead): Map<string, VehicleState> {
  const levels = new Map(head.index > 0 ? model.levelsAfter[head.index - 1] : undefined)
  const done = finishedAgents(model, head)
  const tick = model.ticks[head.index]
  for (const c of tick?.changes ?? []) {
    if (tick && done.has(c.by)) applyChange(levels, tick, c)
  }
  return levels
}

// ---- text helpers ----

/** First sentence of `text`, cut at a word boundary to at most `max` characters. */
export function concise(text: string, max: number): string {
  const first = text.split(/(?<=[.!?;])\s+/)[0] ?? text
  if (first.length <= max) return first
  const cut = first.slice(0, max)
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max * 0.6)).replace(/[\s,;:(–-]+$/, '')}…`
}

/** Splits text into plain parts and vehicle ids (T0xxx) so ids can be rendered as links. */
export function splitVehicleIds(text: string): { text: string; id?: string }[] {
  return text.split(/(\bT\d{4}\b)/).filter(Boolean).map((part) => (/^T\d{4}$/.test(part) ? { text: part, id: part } : { text: part }))
}

/** Vehicles in the latest operator alert at the playhead → simulated minute it was written. */
export function alertFocus(model: DemoModel, head: Playhead): Map<string, number> {
  for (let i = head.index; i >= 0; i--) {
    const tv = model.ticks[i]
    if (!tv || tv.alerts.length === 0) continue
    if (i === head.index && head.elapsed < SCHEDULE.alert.start) continue
    const at = tv.minute - TICK_MIN + SCHEDULE.alert.start
    return new Map(tv.alerts.flatMap((e) => e.alert.track_ids.map((id) => [id, at] as const)))
  }
  return new Map()
}

/** Vehicle types known at the playhead: from drone-frame detections matched to a track, once
 *  the frame has been analysed (a type stays known afterwards). */
export function vehicleTypes(model: DemoModel, head: Playhead): Map<string, string> {
  const types = new Map<string, string>()
  model.ticks.slice(0, head.index + 1).forEach((tv, i) => {
    if (i === head.index && head.elapsed < SCHEDULE.frame) return
    for (const f of tv.frames) for (const d of f.detections) if (d.track_id) types.set(d.track_id, d.label)
  })
  return types
}

// Display helpers for the field map: projection to local meters and time interpolation for drawing.
// No domain math here: motion figures (speed, approach, stops) come from the API.
import type { LatLon, TrackPoint } from '@/api/types'
import { fromLocalM, toLocalM } from './geo'

export interface Pt {
  x: number
  y: number
}

/** A projected track sample: minute of day and SVG position in meters. */
export interface Sample extends Pt {
  t: number
}

/** Minutes of the agent's look-back window; report pins fade out over it. */
export const REPORT_WINDOW_MIN = 120

/** Minutes a track stays on the map after its last sample, fading out. */
export const TRACK_LINGER_MIN = 20

/** SVG coordinates in meters around the base: x east, y south (SVG y grows downward). */
export function project(origin: LatLon, p: LatLon): Pt {
  const { x, y } = toLocalM(origin, p)
  return { x, y: -y }
}

/** Inverse of `project`: SVG meters back to lat/lon. */
export const unproject = (origin: LatLon, p: Pt): LatLon => fromLocalM(origin, p.x, -p.y)

export const toSamples = (origin: LatLon, points: TrackPoint[]): Sample[] =>
  points.map((p) => ({ t: p.time_min, ...project(origin, p.position) }))

export const hhmm = (minute: number): string => {
  const m = Math.floor(minute)
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/** Samples up to `minute` plus the interpolated current position; empty when not active. */
export function pathAt(samples: Sample[], minute: number): Pt[] {
  const first = samples[0]
  const last = samples[samples.length - 1]
  if (!first || !last || minute < first.t || minute > last.t) return []
  const out: Pt[] = []
  for (let i = 0; i < samples.length; i++) {
    const b = samples[i]
    if (!b) break
    if (b.t <= minute) {
      out.push(b)
      continue
    }
    const a = samples[i - 1]
    if (a) {
      const k = (minute - a.t) / (b.t - a.t || 1)
      out.push({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k })
    }
    break
  }
  return out
}

export const toPoints = (pts: Pt[]): string =>
  pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')

/** The last `windowMin` minutes of a track up to `minute` (interpolated at both ends). */
export function trailAt(samples: Sample[], minute: number, windowMin: number): Pt[] {
  const since = minute - windowMin
  const firstIn = samples.findIndex((p) => p.t >= since)
  const from = firstIn > 0 ? samples.slice(firstIn - 1) : samples
  const path = pathAt(from, minute)
  const [a, b] = from
  if (!a || !b || path.length < 2 || a.t >= since) return path
  const k = (since - a.t) / (b.t - a.t || 1)
  return [{ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }, ...path.slice(1)]
}

/** SVG path through `pts` as a smooth curve. Each sample's tangent follows its neighbours
 *  (Catmull-Rom direction) but its handles are at most a third of the shorter adjacent segment,
 *  and the ends have none: the curve passes through every sample and never overshoots one, so
 *  a trail always ends exactly at the vehicle. */
export function smoothPath(pts: Pt[]): string {
  const f = (v: number) => v.toFixed(1)
  const first = pts[0]
  if (!first) return ''
  const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y)
  // Unit tangent and handle length per sample (zero at both ends and at repeated samples).
  const handles = pts.map((p, i) => {
    const prev = pts[i - 1]
    const next = pts[i + 1]
    if (!prev || !next) return { x: 0, y: 0 }
    const dPrev = dist(prev, p)
    const dNext = dist(p, next)
    const chord = dist(prev, next)
    if (dPrev === 0 || dNext === 0 || chord === 0) return { x: 0, y: 0 }
    const k = Math.min(dPrev, dNext) / 3 / chord
    return { x: (next.x - prev.x) * k, y: (next.y - prev.y) * k }
  })
  let d = `M${f(first.x)},${f(first.y)}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p1 = pts[i] as Pt
    const p2 = pts[i + 1] as Pt
    const h1 = handles[i] as Pt
    const h2 = handles[i + 1] as Pt
    d += ` C${f(p1.x + h1.x)},${f(p1.y + h1.y)} ${f(p2.x - h2.x)},${f(p2.y - h2.y)} ${f(p2.x)},${f(p2.y)}`
  }
  return d
}

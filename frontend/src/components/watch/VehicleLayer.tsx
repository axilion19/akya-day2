import type { WatchLevel } from '@/api/types'
import type { TrackMark } from '@/components/map/TrackLayer'
import { pathAt, smoothPath, trailAt } from '@/lib/fieldMap'
import { RISK_STYLES } from '@/lib/risk'
import type { VehicleState } from '@/lib/watchDemo'

interface Props {
  tracks: TrackMark[]
  minute: number
  mpp: number
  levels: Map<string, VehicleState>
  /** Vehicles in the operator alert → simulated minute the alert was written (trail grows in). */
  focus: Map<string, number>
  selectedId: string | null
  onSelect: (id: string) => void
}

const ORDER: Record<WatchLevel, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 }
const FOCUS_TRAIL_MIN = 45 // vehicles in the operator alert
const HIGH_TRAIL_MIN = 120 // HIGH vehicles: the whole route so far (tracks cover 2 h)
const REVEAL_MIN = 1.5 // simulated minutes for a focus trail to draw itself in
const DOT: Record<WatchLevel, number> = { LOW: 2.5, MEDIUM: 4, HIGH: 5 }

/** Every vehicle as a dot colored by its agent level. HIGH vehicles show their whole route so far,
 *  vehicles in the operator alert their last 45 min; the selected one also shows its id. */
export function VehicleLayer({ tracks, minute, mpp, levels, focus, selectedId, onSelect }: Props) {
  const drawn = tracks
    .map((tr) => {
      const full = pathAt(tr.samples, minute)
      const state = levels.get(tr.id)
      const since = focus.get(tr.id)
      // A trail draws itself in from the moment the vehicle entered the alert or became HIGH.
      const grow = (from: number | undefined) =>
        from === undefined ? 0 : Math.max(0, Math.min(1, (minute - from) / REVEAL_MIN))
      const trailMin = Math.max(FOCUS_TRAIL_MIN * grow(since), HIGH_TRAIL_MIN * grow(state?.highSince))
      const path = tr.id === selectedId ? full : trailMin > 0 ? trailAt(tr.samples, minute, trailMin) : []
      return { id: tr.id, path, head: full[full.length - 1], state, focused: since !== undefined }
    })
    .filter((v) => v.head !== undefined)
    .sort(
      (a, b) =>
        ORDER[a.state?.level ?? 'LOW'] - ORDER[b.state?.level ?? 'LOW'] ||
        Number(a.focused) - Number(b.focused) ||
        Number(a.id === selectedId) - Number(b.id === selectedId),
    )

  return (
    <g>
      {drawn.map(({ id, path, head, state, focused }) => {
        if (!head) return null
        const level = state?.level ?? 'LOW'
        const selected = id === selectedId
        const color = selected ? '#0891b2' : RISK_STYLES[level].stroke
        return (
          <g key={id} className="cursor-pointer" onClick={() => onSelect(id)}>
            <title>{`${id} · ${level}`}</title>
            {path.length > 1 && (
              <path
                d={smoothPath(path)}
                fill="none"
                stroke={color}
                strokeOpacity={selected ? 0.9 : 0.7}
                strokeWidth={selected ? 2.5 : 2}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            )}
            <circle cx={head.x} cy={head.y} r={14 * mpp} fill="transparent" />
            <circle
              cx={head.x}
              cy={head.y}
              r={(selected || focused ? 6 : DOT[level]) * mpp}
              fill={color}
              fillOpacity={level === 'LOW' && !selected ? 0.35 : 1}
              stroke={focused || selected ? 'white' : 'none'}
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
            />
            {state?.pending && !focused && (
              <circle cx={head.x} cy={head.y} r={8 * mpp} fill="none" stroke={color} strokeOpacity={0.6} strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
            )}
            {selected && (
              <text x={head.x + 9 * mpp} y={head.y - 8 * mpp} fontSize={11 * mpp} fill={color} className="pointer-events-none font-mono font-semibold">
                {id}
              </text>
            )}
          </g>
        )
      })}
    </g>
  )
}

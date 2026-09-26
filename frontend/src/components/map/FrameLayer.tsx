import { type Pt, toPoints } from '@/lib/fieldMap'
import { cn } from '@/lib/utils'

export interface FrameMark {
  id: string
  captureMin: number
  captureTime: string
  corners: Pt[]
  center: Pt
}

interface Props {
  frames: FrameMark[]
  minute: number
  mpp: number
  onOpen: (id: string) => void
}

/** Minutes around a capture time during which the frame is shown as "being taken". */
const LIVE_MIN = 5

/** Drone frame footprints; the one being captured glows, past ones stay dim. Click = analysis. */
export function FrameLayer({ frames, minute, mpp, onOpen }: Props) {
  return (
    <g>
      {frames.map((f) => {
        const live = Math.abs(minute - f.captureMin) <= LIVE_MIN
        const past = !live && f.captureMin < minute
        const s = (live ? 6 : 4) * mpp
        return (
          <g key={f.id} className="group cursor-pointer" onClick={() => onOpen(f.id)}>
            <title>{`${f.id} · ${f.captureTime}`}</title>
            <polygon
              points={toPoints(f.corners)}
              className={
                live
                  ? 'fill-sky-400/30 stroke-sky-300'
                  : past
                    ? 'fill-sky-400/10 stroke-sky-400/50'
                    : 'fill-none stroke-sky-400/25'
              }
              vectorEffect="non-scaling-stroke"
            />
            {/* Footprints are 100-370 m wide: a constant-size marker keeps them visible and clickable. */}
            <rect
              x={f.center.x - s}
              y={f.center.y - s}
              width={2 * s}
              height={2 * s}
              className={cn(
                'stroke-sky-300 group-hover:fill-sky-300',
                live ? 'fill-sky-300' : past ? 'fill-sky-500/40' : 'fill-transparent opacity-50',
              )}
              vectorEffect="non-scaling-stroke"
            />
            {live && (
              <circle cx={f.center.x} cy={f.center.y} fill="none" className="stroke-sky-300" vectorEffect="non-scaling-stroke">
                <animate attributeName="r" from={10 * mpp} to={26 * mpp} dur="1.2s" repeatCount="indefinite" />
                <animate attributeName="opacity" from="1" to="0" dur="1.2s" repeatCount="indefinite" />
              </circle>
            )}
            {live && (
              <text
                x={f.center.x + 10 * mpp}
                y={f.center.y + 4 * mpp}
                fontSize={10 * mpp}
                className="pointer-events-none fill-sky-200 font-mono"
              >
                {`${f.id} · ${f.captureTime}`}
              </text>
            )}
          </g>
        )
      })}
    </g>
  )
}

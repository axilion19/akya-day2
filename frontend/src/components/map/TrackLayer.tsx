import { type Sample, pathAt, toPoints } from '@/lib/fieldMap'
import { cn } from '@/lib/utils'

export interface TrackMark {
  id: string
  samples: Sample[]
}

interface Props {
  tracks: TrackMark[]
  minute: number
  mpp: number
  selectedId: string | null
  onSelect: (id: string) => void
}

/** Tracks active at `minute`: the whole path so far plus the vehicle's current position. */
export function TrackLayer({ tracks, minute, mpp, selectedId, onSelect }: Props) {
  const drawn = tracks
    .map((tr) => ({ id: tr.id, path: pathAt(tr.samples, minute) }))
    .filter((tr) => tr.path.length > 0)
  // Draw the selected track last so it sits on top.
  drawn.sort((a, b) => Number(a.id === selectedId) - Number(b.id === selectedId))

  return (
    <g>
      {drawn.map(({ id, path }) => {
        const head = path[path.length - 1]
        const selected = id === selectedId
        const points = toPoints(path)
        return (
          <g key={id} className="group cursor-pointer" onClick={() => onSelect(id)}>
            <title>{id}</title>
            <polyline
              points={points}
              fill="none"
              stroke="transparent"
              strokeWidth={10}
              vectorEffect="non-scaling-stroke"
            />
            <polyline
              points={points}
              fill="none"
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeWidth={selected ? 2.5 : 1.25}
              className={cn(
                'transition-colors',
                selected ? 'stroke-cyan-300' : 'stroke-emerald-400/45 group-hover:stroke-emerald-300',
              )}
              vectorEffect="non-scaling-stroke"
            />
            {head && (
              <circle
                cx={head.x}
                cy={head.y}
                r={(selected ? 5 : 3) * mpp}
                className={selected ? 'fill-cyan-300' : 'fill-emerald-300'}
              />
            )}
            {head && selected && (
              <text
                x={head.x + 8 * mpp}
                y={head.y - 8 * mpp}
                fontSize={11 * mpp}
                className="pointer-events-none fill-cyan-200 font-mono"
              >
                {id}
              </text>
            )}
          </g>
        )
      })}
    </g>
  )
}

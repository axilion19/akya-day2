import type { LatLon } from '@/api/types'
import type { Pt } from '@/lib/fieldMap'
import { formatCoord, placeName } from '@/lib/format'
import { cn } from '@/lib/utils'

export interface ZoneMark {
  name: string
  p: Pt
  position: LatLon
}

interface Props {
  zones: ZoneMark[]
  mpp: number
  activeZone: string | null
  flashZone: string | null
  onSelect: (name: string) => void
}

/** Zone centers as violet dots with name and coordinates below; sizes stay constant on zoom.
 *  The filtered zone turns cyan; a selected zone-only report makes its zone ripple. */
export function ZoneLayer({ zones, mpp, activeZone, flashZone, onSelect }: Props) {
  return (
    <g>
      {zones.map((z) => {
        const active = z.name === activeZone
        const flash = z.name === flashZone
        return (
          <g key={z.name} transform={`translate(${z.p.x} ${z.p.y})`} className="group cursor-pointer" onClick={() => onSelect(z.name)}>
            <title>{placeName(z.name)}</title>
            {/* Larger transparent hit area than the dot itself. */}
            <circle r={14 * mpp} fill="transparent" />
            {flash && (
              <circle fill="none" className="stroke-sky-300" vectorEffect="non-scaling-stroke">
                <animate attributeName="r" from={6 * mpp} to={28 * mpp} dur="1.4s" repeatCount="indefinite" />
                <animate attributeName="opacity" from="1" to="0" dur="1.4s" repeatCount="indefinite" />
              </circle>
            )}
            <circle
              r={(active ? 7 : 5.5) * mpp}
              className={cn(
                'transition-colors',
                active ? 'fill-cyan-300 stroke-cyan-950' : 'fill-violet-400 stroke-violet-950 group-hover:fill-violet-300',
              )}
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
            />
            {active && <circle r={12 * mpp} fill="none" className="stroke-cyan-300/70" vectorEffect="non-scaling-stroke" />}
            <text
              y={20 * mpp}
              textAnchor="middle"
              fontSize={11 * mpp}
              className={cn('font-medium select-none', active ? 'fill-cyan-200' : 'fill-violet-200')}
            >
              {placeName(z.name)}
            </text>
            <text
              y={32 * mpp}
              textAnchor="middle"
              fontSize={9 * mpp}
              className={cn('font-mono select-none', active ? 'fill-cyan-400/80' : 'fill-violet-300/60')}
            >
              {`${formatCoord(z.position.lat)}, ${formatCoord(z.position.lon)}`}
            </text>
          </g>
        )
      })}
    </g>
  )
}

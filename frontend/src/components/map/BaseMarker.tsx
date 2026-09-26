import type { LatLon } from '@/api/types'
import { formatCoord } from '@/lib/format'

interface Props {
  name: string
  position: LatLon
  mpp: number
}

/** The protected base at the SVG origin. */
export function BaseMarker({ name, position, mpp }: Props) {
  const s = 7 * mpp
  return (
    <g className="pointer-events-none">
      <circle r={16 * mpp} className="fill-emerald-400/10 stroke-emerald-400/60" vectorEffect="non-scaling-stroke" />
      <rect
        x={-s}
        y={-s}
        width={2 * s}
        height={2 * s}
        transform="rotate(45)"
        className="fill-emerald-400 stroke-emerald-950"
        vectorEffect="non-scaling-stroke"
      />
      <text y={-22 * mpp} textAnchor="middle" fontSize={12 * mpp} className="fill-emerald-300 font-semibold">
        {name}
      </text>
      <text y={30 * mpp} textAnchor="middle" fontSize={9 * mpp} className="fill-emerald-500/80 font-mono">
        {`${formatCoord(position.lat)}, ${formatCoord(position.lon)}`}
      </text>
    </g>
  )
}

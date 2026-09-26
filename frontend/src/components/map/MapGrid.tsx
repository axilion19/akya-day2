const RINGS_M = [1000, 2000, 4000]
const STEP_M = 1000

interface Props {
  extentM: number
  mpp: number
}

/** Background: 1 km grid, 8 bearing spokes and 1/2/4 km range rings around the base. */
export function MapGrid({ extentM, mpp }: Props) {
  const ticks: number[] = []
  for (let v = -extentM; v <= extentM; v += STEP_M) ticks.push(v)
  return (
    <g className="pointer-events-none" vectorEffect="non-scaling-stroke">
      {ticks.map((v) => (
        <g key={v} className="stroke-slate-800/70" strokeWidth={1}>
          <line x1={v} y1={-extentM} x2={v} y2={extentM} vectorEffect="non-scaling-stroke" />
          <line x1={-extentM} y1={v} x2={extentM} y2={v} vectorEffect="non-scaling-stroke" />
        </g>
      ))}
      {[0, 45, 90, 135].map((deg) => {
        const r = (deg * Math.PI) / 180
        const dx = Math.sin(r) * extentM
        const dy = Math.cos(r) * extentM
        return (
          <line
            key={deg}
            x1={-dx}
            y1={dy}
            x2={dx}
            y2={-dy}
            className="stroke-slate-700/50"
            strokeDasharray="2 6"
            vectorEffect="non-scaling-stroke"
          />
        )
      })}
      {RINGS_M.map((r) => (
        <g key={r}>
          <circle
            r={r}
            fill="none"
            className="stroke-cyan-800/60"
            strokeDasharray="4 4"
            vectorEffect="non-scaling-stroke"
          />
          <text
            y={-r - 4 * mpp}
            textAnchor="middle"
            fontSize={10 * mpp}
            className="fill-cyan-700 font-mono"
          >
            {`${r / 1000} km`}
          </text>
        </g>
      ))}
    </g>
  )
}

import { Maximize } from 'lucide-react'
import type { ImageMeta, MapReport, MapTrack, Scene } from '@/api/types'
import { BaseMarker } from '@/components/map/BaseMarker'
import { FrameLayer } from '@/components/map/FrameLayer'
import { MapGrid } from '@/components/map/MapGrid'
import { Button } from '@/components/ui/button'
import { useFieldMapModel } from '@/hooks/useFieldMapModel'
import { useMapViewport } from '@/hooks/useMapViewport'
import { t } from '@/i18n'
import { RISK_STYLES } from '@/lib/risk'
import type { VehicleState } from '@/lib/watchDemo'
import { SectorLayer } from './SectorLayer'
import { VehicleLayer } from './VehicleLayer'

interface Props {
  scene: Scene
  images: ImageMeta[]
  tracks: MapTrack[]
  reports: MapReport[]
  minute: number
  checks: Record<string, string>
  levels: Map<string, VehicleState>
  focus: Map<string, number>
  selectedId: string | null
  onSelect: (id: string | null) => void
  onOpenFrame: (imageId: string) => void
}

/** The field at one tick: checked sectors, this tick's frame, and every vehicle by agent level. */
export function WatchMap(props: Props) {
  const { scene, images, tracks, reports, minute, checks, levels, focus, selectedId, onSelect, onOpenFrame } = props
  const model = useFieldMapModel(scene, images, tracks, reports)
  const { ref, viewBox, bounds, mpp, fit, handlers } = useMapViewport(model.fitRadiusM)
  const frames = model.frames.filter((f) => Math.abs(f.captureMin - minute) <= 5)

  return (
    <div className="relative h-full overflow-hidden rounded-lg border bg-map">
      <svg ref={ref} viewBox={viewBox} className="absolute inset-0 size-full cursor-grab touch-none select-none active:cursor-grabbing" {...handlers}>
        <rect x={-1e5} y={-1e5} width={2e5} height={2e5} fill="transparent" onClick={() => onSelect(null)} />
        <MapGrid bounds={bounds} />
        <SectorLayer zones={model.zones} checks={checks} />
        <FrameLayer frames={frames} minute={minute} mpp={mpp} onOpen={onOpenFrame} />
        <VehicleLayer tracks={model.tracks} minute={minute} mpp={mpp} levels={levels} focus={focus} selectedId={selectedId} onSelect={onSelect} />
        <BaseMarker position={scene.base.position} mpp={mpp} />
      </svg>
      <MapKey />
      <Button size="icon-sm" variant="outline" className="absolute right-3 bottom-3 bg-card/85" onClick={fit} aria-label={t.fieldMap.fit} title={t.fieldMap.fit}>
        <Maximize aria-hidden />
      </Button>
    </div>
  )
}

function MapKey() {
  const l = t.watch.legend
  const dot = (color: string, label: string) => (
    <span className="flex items-center gap-1.5">
      <span className="size-2.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  )
  return (
    <div className="absolute bottom-3 left-3 flex flex-wrap gap-3 rounded-md border bg-card/85 px-3 py-2 text-xs text-muted-foreground backdrop-blur">
      {dot(RISK_STYLES.LOW.stroke, l.low)}
      {dot(RISK_STYLES.MEDIUM.stroke, l.medium)}
      {dot(RISK_STYLES.HIGH.stroke, l.high)}
      <span className="flex items-center gap-1.5">
        <span className="size-3 rounded-full border border-dashed border-amber-600" />
        {l.pending}
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-2.5 w-4 border border-cyan-400/60 bg-cyan-400/10" />
        {l.checked}
      </span>
    </div>
  )
}

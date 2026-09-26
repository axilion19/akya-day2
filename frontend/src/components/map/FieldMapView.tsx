import { Maximize } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import type { ImageMeta, LatLon, MapReport, MapTrack, Scene } from '@/api/types'
import { Button } from '@/components/ui/button'
import { useClock } from '@/hooks/useClock'
import { useTrackMotion } from '@/hooks/useFieldMap'
import { useFieldMapModel } from '@/hooks/useFieldMapModel'
import { useMapViewport } from '@/hooks/useMapViewport'
import { t } from '@/i18n'
import { hhmm, unproject } from '@/lib/fieldMap'
import { BaseMarker } from './BaseMarker'
import { FrameLayer } from './FrameLayer'
import { MapGrid } from './MapGrid'
import { type LegendKey, MapLegend } from './MapLegend'
import { ReportFeed } from './ReportFeed'
import { ReportLayer } from './ReportLayer'
import { TimeBar } from './TimeBar'
import { TrackDetail } from './TrackDetail'
import { TrackLayer } from './TrackLayer'
import { ZonePanel } from './ZonePanel'
import { ZoneLayer } from './ZoneLayer'

interface Props {
  scene: Scene
  images: ImageMeta[]
  tracks: MapTrack[]
  reports: MapReport[]
}

type Selection = { kind: 'track' | 'report'; id: string } | null

/** Field map: every track, frame and report of the day, driven by one simulated clock. */
export function FieldMapView({ scene, images, tracks, reports }: Props) {
  const model = useFieldMapModel(scene, images, tracks, reports)
  const clock = useClock(model.start, model.end)
  const { ref: svgRef, viewBox, mpp, flyTo, fit, handlers } = useMapViewport(model.fitRadiusM)
  const navigate = useNavigate()
  const [visible, setVisible] = useState<Record<LegendKey, boolean>>({ zones: true, tracks: true, frames: true, official: true, third_party: true })
  const [zone, setZone] = useState<string | null>(null)
  const [selection, setSelection] = useState<Selection>(null)
  const [cursor, setCursor] = useState<LatLon | null>(null)

  const minute = clock.minute
  const inZone = (z: string | null) => zone === null || z === zone
  const sourceOn = (s: string) => (s === 'official' || s === 'third_party' ? visible[s] : true)

  const visibleTracks = visible.tracks ? model.tracks.filter((tr) => inZone(tr.zone)) : []
  const visibleFrames = visible.frames ? model.frames.filter((f) => inZone(f.zone)) : []
  const visiblePins = model.reports.filter((r) => sourceOn(r.source) && inZone(r.zone))
  const feed = reports.filter((r) => r.time_min <= minute && sourceOn(r.source) && inZone(r.zone ?? null)).reverse()

  const counts: Record<string, { tracks: number; reports: number }> = {}
  for (const z of scene.zones) counts[z.name] = { tracks: 0, reports: 0 }
  for (const tr of model.tracks) {
    const c = tr.zone ? counts[tr.zone] : undefined
    if (c && tr.startMin <= minute && minute <= tr.endMin) c.tracks++
  }
  for (const r of reports) {
    const c = r.zone ? counts[r.zone] : undefined
    if (c && r.time_min <= minute) c.reports++
  }
  const activeTracks = model.tracks.filter((tr) => tr.startMin <= minute && minute <= tr.endMin).length

  const selectedTrack = selection?.kind === 'track' ? tracks.find((tr) => tr.track_id === selection.id) : undefined
  const selectedReport = selection?.kind === 'report' ? reports.find((r) => r.report_id === selection.id) : undefined
  const motionAt = hhmm(Math.floor(minute / 5) * 5)
  const motion = useTrackMotion(selectedTrack?.track_id ?? null, motionAt)

  const zoneCenter = (name: string) => model.zones.find((z) => z.name === name)?.p
  const selectZone = (name: string | null) => {
    setZone(name)
    const p = name ? zoneCenter(name) : undefined
    if (p) flyTo(p, 5000)
    else fit()
  }
  const selectReport = (r: MapReport) => {
    setSelection({ kind: 'report', id: r.report_id })
    const pin = model.reports.find((m) => m.id === r.report_id)
    const p = pin?.p ?? (r.zone ? zoneCenter(r.zone) : undefined)
    if (p) flyTo(p, Math.min(4000, model.fitRadiusM))
  }

  // Screen → SVG meters via the element's CTM, then back to lat/lon for the hover readout.
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    handlers.onPointerMove(e)
    const ctm = e.currentTarget.getScreenCTM()
    if (!ctm) return
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse())
    setCursor(unproject(model.origin, { x: p.x, y: p.y }))
  }

  return (
    <div className="relative h-full overflow-hidden bg-[#060a0f]">
      <svg ref={svgRef} viewBox={viewBox} className="absolute inset-0 size-full cursor-grab touch-none select-none active:cursor-grabbing"
        {...handlers}
        onPointerMove={onPointerMove}
        onPointerLeave={() => setCursor(null)}
      >
        <rect x={-1e5} y={-1e5} width={2e5} height={2e5} fill="transparent" onClick={() => setSelection(null)} />
        <MapGrid extentM={Math.ceil(model.fitRadiusM / 1000) * 1000 + 3000} mpp={mpp} />
        <ZoneLayer
          zones={visible.zones ? model.zones : []}
          mpp={mpp}
          activeZone={zone}
          flashZone={selectedReport && !selectedReport.location ? (selectedReport.zone ?? null) : null}
          onSelect={(z) => selectZone(zone === z ? null : z)}
        />
        <FrameLayer frames={visibleFrames} minute={minute} mpp={mpp} onOpen={(id) => void navigate(`/analysis/${id}`)} />
        <TrackLayer
          tracks={visibleTracks}
          minute={minute}
          mpp={mpp}
          selectedId={selectedTrack?.track_id ?? null}
          onSelect={(id) => setSelection({ kind: 'track', id })}
        />
        <ReportLayer
          reports={visiblePins}
          minute={minute}
          mpp={mpp}
          selectedId={selectedReport?.report_id ?? null}
          onSelect={(id) => setSelection({ kind: 'report', id })}
        />
        <BaseMarker name={scene.base.name} position={scene.base.position} mpp={mpp} />
      </svg>

      <div className="pointer-events-none absolute inset-x-0 top-3 flex flex-col items-center gap-1 pr-[21.5rem] pl-[15.5rem]">
        <div className="rounded-lg border bg-card/85 px-5 py-1.5 font-mono text-3xl font-semibold tracking-wider text-foreground backdrop-blur" aria-live="off">
          {hhmm(minute)}
        </div>
        <div className="font-mono text-[11px] text-muted-foreground">
          <span className="text-emerald-400">{t.fieldMap.activeTracks(activeTracks)}</span> · <span className="text-sky-400">{t.fieldMap.reportsSoFar(feed.length)}</span>
        </div>
      </div>

      <div className="absolute top-3 bottom-[5.5rem] left-3 flex flex-col justify-between gap-3">
        <ZonePanel
          zones={scene.zones.map((z) => z.name)}
          activeZone={zone}
          counts={counts}
          onZone={selectZone}
        />
        <div className="max-w-md">
          <MapLegend visible={visible} onToggle={(k) => setVisible((v) => ({ ...v, [k]: !v[k] }))} />
        </div>
      </div>

      <div className="absolute top-3 right-3 bottom-3 flex">
        <ReportFeed reports={feed} minute={minute} selectedId={selectedReport?.report_id ?? null} onSelect={selectReport} />
      </div>

      {selectedTrack && (
        <div className="absolute top-3 right-[21.5rem]">
          <TrackDetail
            track={selectedTrack}
            frame={selectedTrack.image_id ? model.imageById.get(selectedTrack.image_id) : undefined}
            at={motionAt}
            motion={motion.data}
            isPending={motion.isPending}
            isError={motion.isError}
            onClose={() => setSelection(null)}
          />
        </div>
      )}

      {cursor && (
        <div className="pointer-events-none absolute right-[24rem] bottom-[5.5rem] rounded-md border bg-card/85 px-2.5 py-1 font-mono text-[11px] text-muted-foreground tabular-nums backdrop-blur">
          {t.fieldMap.cursor.lat} <span className="text-foreground">{cursor.lat.toFixed(6)}</span> · {t.fieldMap.cursor.lon}{' '}
          <span className="text-foreground">{cursor.lon.toFixed(6)}</span>
        </div>
      )}

      <Button size="icon-sm" variant="outline" className="absolute right-[21.5rem] bottom-[5.5rem] bg-card/85" onClick={fit} aria-label={t.fieldMap.fit} title={t.fieldMap.fit}>
        <Maximize />
      </Button>

      <div className="absolute right-[21.5rem] bottom-3 left-3">
        <TimeBar
          start={clock.start}
          end={clock.end}
          minute={minute}
          playing={clock.playing}
          speed={clock.speed}
          ticks={model.ticks}
          onToggle={clock.toggle}
          onSpeed={clock.setSpeed}
          onSeek={clock.seek}
        />
      </div>
    </div>
  )
}

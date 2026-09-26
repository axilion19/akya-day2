import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import type { ImageMeta, MapReport, MapTrack, Scene } from '@/api/types'
import { TimeBar } from '@/components/map/TimeBar'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SupervisorCard } from '@/components/watch/SupervisorCard'
import { TickBar } from '@/components/watch/TickBar'
import { VehiclePanel } from '@/components/watch/VehiclePanel'
import { WatcherCard } from '@/components/watch/WatcherCard'
import { WatchMap } from '@/components/watch/WatchMap'
import { useClock } from '@/hooks/useClock'
import { useFieldMapData } from '@/hooks/useFieldMap'
import { VehicleLinkContext } from '@/hooks/useVehicleLink'
import { useWatchDemo } from '@/hooks/useWatchDemo'
import { t } from '@/i18n'
import { hhmm } from '@/lib/fieldMap'
import {
  type DemoModel,
  alertFocus,
  SCHEDULE,
  TICK_MIN,
  finishedAgents,
  levelsAt,
  playheadAt,
  progress,
  toMinute,
  verdictHistory,
} from '@/lib/watchDemo'

/** Demo mode: replays a recorded multi-agent watch run on the field-map clock (no LLM calls).
 *  Deep links: /watch?recording=<id>&tick=<1-based>&at=<HH:MM>&vehicle=<track_id>&tab=watchers. */
export function WatchPage() {
  const [params] = useSearchParams()
  const [recordingId, setRecordingId] = useState<string | null>(params.get('recording'))
  const demo = useWatchDemo(recordingId)
  const field = useFieldMapData()
  const w = t.watch

  if (demo.isError || field.isError) return <Centered>{w.loadError}</Centered>
  if (demo.isEmpty) return <Centered>{w.empty}</Centered>
  if (demo.isPending || field.isPending || !demo.model?.ticks.length || !field.scene || !field.images || !field.tracks || !field.reports) {
    return <Skeleton className="m-3 h-[calc(100%-1.5rem)]" />
  }
  const tickParam = Number(params.get('tick') ?? 0)
  const at = /^\d{2}:\d{2}$/.test(params.get('at') ?? '') ? toMinute(params.get('at') ?? '') : null
  return (
    <WatchPlayer
      key={demo.recordingId}
      model={demo.model}
      field={{ scene: field.scene, images: field.images, tracks: field.tracks, reports: field.reports }}
      initialTick={tickParam > 0 ? tickParam - 1 : null}
      initialMinute={at}
      initialVehicle={params.get('vehicle')}
      initialTab={params.get('tab') === 'watchers' ? 'watchers' : 'supervisor'}
      recordings={demo.recordings?.map((r) => r.recording_id) ?? []}
      recordingId={demo.recordingId}
      onRecording={setRecordingId}
    />
  )
}

interface PlayerProps {
  model: DemoModel
  field: { scene: Scene; images: ImageMeta[]; tracks: MapTrack[]; reports: MapReport[] }
  initialTick: number | null
  initialMinute: number | null
  initialVehicle: string | null
  initialTab: 'supervisor' | 'watchers'
  recordings: string[]
  recordingId: string | null
  onRecording: (id: string) => void
}

function WatchPlayer({ model, field, initialTick, initialMinute, initialVehicle, initialTab, recordings, recordingId, onRecording }: PlayerProps) {
  const w = t.watch
  const first = model.ticks[0]?.minute ?? 0
  const last = model.ticks[model.ticks.length - 1]?.minute ?? first
  const jump = initialTick !== null ? model.ticks[Math.min(initialTick, model.ticks.length - 1)]?.minute : undefined
  // 1x = one tick (5 simulated minutes) per 20 s, so the streamed text stays readable.
  const clock = useClock(first - TICK_MIN, last, { initialMinute: initialMinute ?? jump ?? first - TICK_MIN, baseMinPerSec: 0.25 })
  const [selected, setSelected] = useState<string | null>(initialVehicle)
  const navigate = useNavigate()

  const head = playheadAt(model, clock.minute)
  const tick = model.ticks[head.index]
  if (!tick) return null
  const done = finishedAgents(model, head)
  const levels = levelsAt(model, head)
  const supProgress = progress(head.elapsed, SCHEDULE.supervisor)
  const complete = supProgress >= 1
  const threat = complete ? tick.supervisor?.decision.threat_level : model.ticks[head.index - 1]?.supervisor?.decision.threat_level
  const rows = model.rowsUpTo(head.index)
  const previous = model.ticks[head.index - 1]
  // Alerts already delivered: earlier ticks, plus this tick's once fully written; newest first.
  const alertDone = progress(head.elapsed, SCHEDULE.alert) >= 1
  const history = model.ticks
    .slice(0, head.index)
    .flatMap((tv) => tv.alerts.map((e) => e.alert))
    .reverse()
  const alertLive = tick.alerts.length > 0 && head.elapsed >= SCHEDULE.alert.start && !alertDone
  const watchersLive = head.elapsed > 0 && !done.has(`watcher:${tick.watchers[tick.watchers.length - 1]?.watcher ?? ''}`)

  return (
    <VehicleLinkContext.Provider value={setSelected}>
      <div className="flex h-full flex-col gap-3 p-3">
        <div className="flex flex-wrap items-center justify-end gap-3">
          <TickBar ticks={model.ticks} current={head.index} complete={complete} threat={threat} onSeek={clock.seek} />
          {recordings.length > 1 && (
            <select aria-label={w.recording} className="rounded-md border bg-card px-2 py-1 font-mono text-sm" value={recordingId ?? ''} onChange={(e) => onRecording(e.target.value)}>
              {recordings.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="flex min-h-0 flex-1 gap-3">
          <div className="relative min-w-0 flex-1">
            <WatchMap
              {...field}
              minute={clock.minute}
              checks={tick.start.checks}
              levels={levels}
              focus={alertFocus(model, head)}
              selectedId={selected}
              onSelect={setSelected}
              onOpenFrame={(id) => void navigate(`/analysis/${id}`)}
            />
            <div className="pointer-events-none absolute top-3 left-3 rounded-md border bg-card/90 px-3 py-1.5 shadow-sm backdrop-blur">
              <p className="font-mono text-2xl font-semibold">{hhmm(clock.minute)}</p>
              <p className="text-[11px] text-muted-foreground">{complete ? w.evaluated(tick.tick) : w.evaluating(tick.tick)}</p>
            </div>
            {selected && (
              <VehiclePanel
                trackId={selected}
                state={levels.get(selected)}
                row={rows.get(selected)}
                history={verdictHistory(model, selected, head.index, done)}
                onClose={() => setSelected(null)}
              />
            )}
          </div>

          <aside className="flex w-[27rem] shrink-0 flex-col">
            <Tabs defaultValue={initialTab} className="flex min-h-0 flex-1 flex-col">
              <TabsList className="w-full">
                <TabsTrigger value="supervisor" className="gap-2">
                  {w.tabSupervisor}
                  {alertLive && <span className="size-2 animate-pulse rounded-full bg-red-600" aria-hidden />}
                </TabsTrigger>
                <TabsTrigger value="watchers" className="gap-2">
                  {w.tabWatchers(tick.watchers.length)}
                  {watchersLive && <span className="size-2 animate-pulse rounded-full bg-primary" aria-hidden />}
                </TabsTrigger>
              </TabsList>
              <TabsContent value="supervisor" className="min-h-0 overflow-y-auto pr-1">
                {head.elapsed === 0 && head.index === 0 ? (
                  <p className="rounded-lg border border-dashed bg-card p-4 text-sm text-muted-foreground">{w.start}</p>
                ) : (
                  <SupervisorCard
                    key={`sup-${tick.tick}`}
                    tick={head.elapsed >= SCHEDULE.supervisor.start ? tick.tick : (previous?.tick ?? tick.tick)}
                    decision={head.elapsed >= SCHEDULE.supervisor.start ? tick.supervisor : previous?.supervisor}
                    alerts={head.elapsed >= SCHEDULE.supervisor.start ? tick.alerts.map((e) => e.alert) : []}
                    history={history}
                    progress={head.elapsed >= SCHEDULE.supervisor.start ? supProgress : previous ? 1 : 0}
                    alertProgress={progress(head.elapsed, SCHEDULE.alert)}
                  />
                )}
              </TabsContent>
              <TabsContent value="watchers" className="flex min-h-0 flex-col gap-3 overflow-y-auto pr-1">
                {head.elapsed === 0 && head.index === 0 && (
                  <p className="rounded-lg border border-dashed bg-card p-4 text-sm text-muted-foreground">{w.start}</p>
                )}
                {tick.watchers.map((report, i) =>
                  head.elapsed > 0 ? (
                    <WatcherCard
                      key={`${tick.tick}-${report.watcher}`}
                      report={report}
                      frames={head.elapsed >= SCHEDULE.frame ? tick.frames : []}
                      trace={tick.traces.get(`watcher:${report.watcher}`)}
                      progress={progress(head.elapsed, SCHEDULE.watcher(i))}
                    />
                  ) : null,
                )}
                <p className="text-[11px] text-muted-foreground">{w.hint}</p>
              </TabsContent>
            </Tabs>
          </aside>
        </div>

        <TimeBar
          start={clock.start}
          end={clock.end}
          minute={clock.minute}
          playing={clock.playing}
          speed={clock.speed}
          ticks={model.ticks.map((tv) => ({ minute: tv.minute, kind: 'frame' as const }))}
          activity={[]}
          onToggle={clock.toggle}
          onSpeed={clock.cycleSpeed}
          onSeek={clock.seek}
        />
      </div>
    </VehicleLinkContext.Provider>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">{children}</div>
}

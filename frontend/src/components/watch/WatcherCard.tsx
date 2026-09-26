import { useState } from 'react'
import type { WatchEventOf } from '@/api/types'
import { RiskBadge } from '@/components/analysis/RiskBadge'
import { t } from '@/i18n'
import { AgentText, LinkedIds } from './AgentText'
import { TraceView } from './TraceView'

interface Props {
  report: WatchEventOf<'watcher_report'>
  frames: WatchEventOf<'frame_analyzed'>[]
  trace: WatchEventOf<'agent_trace'> | undefined
  progress: number // 0 = still thinking, 1 = finished writing
}

const SHOWN = 4
const clamp = (x: number) => Math.max(0, Math.min(1, x))

/** One watcher's check, streamed: sector summary, then flagged vehicles one by one, then groups. */
export function WatcherCard({ report, frames, trace, progress }: Props) {
  const w = t.watch
  const [all, setAll] = useState(false)
  const r = report.report
  const sector = report.sectors[0] ?? ''
  const flagged = [...r.vehicles.filter((v) => v.level === 'HIGH'), ...r.vehicles.filter((v) => v.level === 'MEDIUM')]
  const visible = all ? flagged : flagged.slice(0, SHOWN)
  const llmMs = trace?.steps.reduce((sum, st) => sum + (st.step === 'llm' && typeof st.latency_ms === 'number' ? st.latency_ms : 0), 0)
  const done = progress >= 1
  const myFrames = frames.filter((f) => f.sector === sector)

  return (
    <section className="flex flex-col gap-2 rounded-lg border bg-card p-3 shadow-xs animate-in fade-in duration-300">
      <header className="flex items-center justify-between gap-2">
        <h3 className="font-mono text-sm font-semibold text-primary">{w.watcher(report.watcher, sector)}</h3>
        <span className="text-[11px] text-muted-foreground">
          {progress === 0 ? <span className="animate-pulse">{w.thinking}</span> : `${report.generated_by === 'llm' ? w.llm : w.fallback} · ${w.seconds(llmMs || report.duration_ms)}`}
        </span>
      </header>

      {myFrames.map((f) => (
        <details key={f.image_id} className="rounded-md border border-sky-500/30 bg-sky-500/5 px-2 py-1.5 text-xs">
          <summary className="cursor-pointer font-mono text-sky-700">
            {w.frame(f.image_id)} · {w.detections(f.detections.length, f.detections.filter((d) => d.track_id).length)}
          </summary>
          <p className="mt-1 font-mono text-muted-foreground">
            <LinkedIds text={f.detections.map((d) => `${d.label} ${d.confidence.toFixed(2)} → ${d.track_id ?? w.noTrack}`).join(' · ')} />
          </p>
        </details>
      ))}

      {progress > 0 &&
        (report.rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">{w.noVehicles}</p>
        ) : (
          <AgentText text={r.street_state} max={150} progress={clamp(progress / 0.35)} className="text-sm text-foreground/80" />
        ))}

      {visible.map((v, j) => {
        const start = 0.35 + (0.55 * j) / Math.max(1, visible.length)
        if (progress < start) return null
        return (
          <div key={v.track_id} className="flex items-start gap-2 rounded-md border px-2 py-1.5 animate-in fade-in slide-in-from-bottom-1 duration-200">
            <RiskBadge level={v.level} className="mt-0.5 shrink-0" />
            <div className="min-w-0 text-xs">
              <LinkedIds text={v.track_id} />{' '}
              <AgentText text={v.reason} max={95} progress={clamp((progress - start) / (0.55 / Math.max(1, visible.length)))} className="inline" />
            </div>
          </div>
        )
      })}
      {done && flagged.length > SHOWN && (
        <button type="button" onClick={() => setAll((a) => !a)} className="self-start text-xs font-medium text-primary hover:underline">
          {all ? w.less : w.moreVehicles(flagged.length - SHOWN)}
        </button>
      )}

      {done &&
        r.patterns.map((p, i) => (
          <div key={i} className="rounded-md border border-dashed p-2 text-xs">
            <span className="font-semibold">{w.group}: </span>
            <AgentText text={p.description} max={120} className="inline" />
          </div>
        ))}
      {done && trace && <TraceView trace={trace} />}
    </section>
  )
}

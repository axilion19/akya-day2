import { ExternalLink, X } from 'lucide-react'
import { Link } from 'react-router'
import type { ImageMeta, MapTrack, MotionProfile } from '@/api/types'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { t } from '@/i18n'
import { formatKm, formatSpeed } from '@/lib/format'
import { cn } from '@/lib/utils'

interface Props {
  track: MapTrack
  frame: ImageMeta | undefined
  at: string
  motion: MotionProfile | undefined
  isPending: boolean
  isError: boolean
  onClose: () => void
}

function Row({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className={cn('font-mono text-xs', className)}>{value}</dd>
    </div>
  )
}

/** Floating card for the selected track; figures come from the API's motion analysis. */
export function TrackDetail({ track, frame, at, motion, isPending, isError, onClose }: Props) {
  const tt = t.fieldMap.track
  const first = track.points[0]
  const last = track.points[track.points.length - 1]
  const stopMin = motion?.stops.reduce((sum, s) => sum + s.duration_min, 0) ?? 0
  const rate = motion?.approach_rate_m_per_min ?? 0

  return (
    <aside className="w-72 rounded-lg border border-cyan-500/40 bg-card/90 p-3 shadow-lg backdrop-blur animate-in fade-in slide-in-from-right-2 duration-200">
      <header className="mb-2 flex items-center justify-between">
        <div>
          <h2 className="font-mono text-sm font-semibold text-cyan-200">{tt.title(track.track_id)}</h2>
          <p className="text-[11px] text-muted-foreground">{tt.atTime(at)}</p>
        </div>
        <Button size="icon-sm" variant="ghost" onClick={onClose} aria-label={tt.close}>
          <X />
        </Button>
      </header>
      <dl className="flex flex-col gap-1.5">
        {first && last && <Row label={tt.span} value={`${first.time}–${last.time}`} />}
        {isPending && !motion && <Skeleton className="h-28" />}
        {isError && <p className="text-xs text-destructive">{tt.loadError}</p>}
        {motion && (
          <>
            <Row label={tt.distance} value={formatKm(motion.dist_now_m)} />
            <Row label={tt.speed} value={formatSpeed(motion.last10_speed_ms)} />
            <Row
              label={tt.approach}
              value={`${tt.approachValue(rate)} · ${rate >= 0.5 ? tt.closing : rate <= -0.5 ? tt.opening : tt.steady}`}
              className={rate >= 0.5 ? 'text-amber-200' : 'text-emerald-300'}
            />
            <Row label={tt.heading} value={motion.heading_deg == null ? '—' : `${Math.round(motion.heading_deg)}°`} />
            <Row label={tt.path} value={formatKm(motion.path_km * 1000)} />
            <Row label={tt.stops} value={tt.stopsValue(motion.stops.length, stopMin)} />
            {motion.eta_to_base_min != null && <Row label={tt.eta} value={tt.etaValue(motion.eta_to_base_min)} className="text-orange-300" />}
            {motion.zones_visited.length > 0 && <Row label={tt.zones} value={motion.zones_visited.join(', ')} />}
          </>
        )}
      </dl>
      {frame && (
        <Link
          to={`/analysis/${frame.image_id}`}
          className="mt-3 flex items-center justify-between rounded-md border border-sky-500/40 bg-sky-500/10 px-2 py-1.5 text-xs text-sky-200 transition-colors hover:bg-sky-500/20"
        >
          <span>
            {tt.frame}: <span className="font-mono">{frame.image_id}</span> · {frame.capture_time}
          </span>
          <span className="flex items-center gap-1">
            {tt.openAnalysis}
            <ExternalLink aria-hidden className="size-3" />
          </span>
        </Link>
      )}
    </aside>
  )
}

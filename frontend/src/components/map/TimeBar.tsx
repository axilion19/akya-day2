import { Pause, Play } from 'lucide-react'
import { useRef } from 'react'
import { Button } from '@/components/ui/button'
import { CLOCK_SPEEDS, type ClockSpeed } from '@/hooks/useClock'
import { t } from '@/i18n'
import { hhmm } from '@/lib/fieldMap'
import { cn } from '@/lib/utils'

export interface TimeTick {
  minute: number
  kind: 'frame' | 'official' | 'third_party'
}

interface Props {
  start: number
  end: number
  minute: number
  playing: boolean
  speed: ClockSpeed
  ticks: TimeTick[]
  onToggle: () => void
  onSpeed: (s: ClockSpeed) => void
  onSeek: (minute: number) => void
}

const TICK_CLASS: Record<TimeTick['kind'], string> = {
  frame: 'top-0 h-2.5 bg-sky-300',
  official: 'bottom-0 h-2 bg-sky-500/70',
  third_party: 'bottom-0 h-2 bg-amber-400/80',
}

/** Bottom bar: play/pause, speed and a scrubber with frame (top) and report (bottom) ticks. */
export function TimeBar({ start, end, minute, playing, speed, ticks, onToggle, onSpeed, onSeek }: Props) {
  const fm = t.fieldMap
  const track = useRef<HTMLDivElement>(null)
  const pct = (m: number) => `${((m - start) / (end - start || 1)) * 100}%`
  const hours: number[] = []
  for (let h = Math.ceil(start / 60) * 60; h <= end; h += 60) hours.push(h)

  const seekFrom = (clientX: number) => {
    const r = track.current?.getBoundingClientRect()
    if (!r) return
    onSeek(start + Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * (end - start))
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card/85 px-3 py-2 backdrop-blur">
      <Button size="sm" variant="outline" onClick={onToggle} className="w-24 border-emerald-500/50 text-emerald-300">
        {playing ? <Pause aria-hidden /> : <Play aria-hidden />}
        {playing ? fm.pause : fm.play}
      </Button>
      <div className="flex gap-1" role="group" aria-label={fm.speedLabel}>
        {CLOCK_SPEEDS.map((s) => (
          <Button
            key={s}
            size="sm"
            variant={s === speed ? 'secondary' : 'ghost'}
            aria-pressed={s === speed}
            onClick={() => onSpeed(s)}
            className={cn('font-mono', s === speed && 'text-emerald-300')}
          >
            {fm.speed(s)}
          </Button>
        ))}
      </div>
      <div
        ref={track}
        role="slider"
        tabIndex={0}
        aria-label={fm.timeline}
        aria-valuemin={start}
        aria-valuemax={end}
        aria-valuenow={Math.floor(minute)}
        aria-valuetext={hhmm(minute)}
        className="relative h-9 min-w-0 flex-1 cursor-pointer touch-none select-none"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          seekFrom(e.clientX)
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) seekFrom(e.clientX)
        }}
      >
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border" />
        <div className="absolute top-1/2 left-0 h-0.5 -translate-y-1/2 bg-emerald-500/60" style={{ width: pct(minute) }} />
        {ticks.map((tk, i) => (
          <span key={i} className={cn('absolute w-px', TICK_CLASS[tk.kind])} style={{ left: pct(tk.minute) }} />
        ))}
        {hours.map((h) => (
          <span key={h} className="absolute top-1/2 mt-1.5 -translate-x-1/2 font-mono text-[9px] text-muted-foreground" style={{ left: pct(h) }}>
            {hhmm(h)}
          </span>
        ))}
        <span
          className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-emerald-200 bg-emerald-400 shadow-[0_0_10px] shadow-emerald-400/60"
          style={{ left: pct(minute) }}
        />
      </div>
      <span className="shrink-0 font-mono text-xs text-muted-foreground">{`${hhmm(start)}–${hhmm(end)}`}</span>
    </div>
  )
}

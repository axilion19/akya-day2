import { Pause, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CLOCK_SPEEDS, type ClockSpeed } from '@/hooks/useClock'
import { t } from '@/i18n'
import { cn } from '@/lib/utils'
import { type ActivityBin, type TimeTick, TimeScrubber } from './TimeScrubber'

interface Props {
  start: number
  end: number
  minute: number
  playing: boolean
  speed: ClockSpeed
  ticks: TimeTick[]
  activity: ActivityBin[]
  onToggle: () => void
  onSpeed: (s: ClockSpeed) => void
  onSeek: (minute: number) => void
}

/** Bottom bar: play/pause, speed and the lane scrubber. */
export function TimeBar({ start, end, minute, playing, speed, ticks, activity, onToggle, onSpeed, onSeek }: Props) {
  const fm = t.fieldMap
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card/85 px-3 pt-2.5 pb-1.5 backdrop-blur">
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
      <TimeScrubber start={start} end={end} minute={minute} ticks={ticks} activity={activity} onSeek={onSeek} />
    </div>
  )
}

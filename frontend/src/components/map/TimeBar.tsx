import { Pause, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ClockSpeed } from '@/hooks/useClock'
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
  onSpeed: () => void
  onSeek: (minute: number) => void
}

/** Bottom bar: icon play/pause, a speed button that cycles 1x-4x, and the lane scrubber. */
export function TimeBar({ start, end, minute, playing, speed, ticks, activity, onToggle, onSpeed, onSeek }: Props) {
  const fm = t.fieldMap
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card/85 px-3 pt-2.5 pb-1.5 backdrop-blur">
      <Button
        size="icon"
        variant="outline"
        onClick={onToggle}
        aria-label={playing ? fm.pause : fm.play}
        title={playing ? fm.pause : fm.play}
        className="shrink-0 border-emerald-500/50 text-emerald-300"
      >
        {playing ? <Pause aria-hidden /> : <Play aria-hidden />}
      </Button>
      <Button
        size="sm"
        variant="secondary"
        onClick={onSpeed}
        aria-label={`${fm.speedLabel}: ${fm.speed(speed)}`}
        title={fm.speedLabel}
        className={cn('w-11 shrink-0 font-mono', speed > 1 && 'text-emerald-300')}
      >
        {fm.speed(speed)}
      </Button>
      <TimeScrubber start={start} end={end} minute={minute} ticks={ticks} activity={activity} onSeek={onSeek} />
    </div>
  )
}

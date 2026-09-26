import { useCallback, useEffect, useRef, useState } from 'react'

/** Playback multipliers, cycled by the speed button. */
export const CLOCK_SPEEDS = [1, 2, 3, 4] as const
/** Simulated minutes per real second at 1x; faster speeds skip minutes on the clock. */
const BASE_SIM_MIN_PER_SEC = 1
export type ClockSpeed = (typeof CLOCK_SPEEDS)[number]

/** Simulated day clock in minutes. `speed` = simulated seconds per real second.
 *  Space plays/pauses, arrow keys step 5 minutes. */
export function useClock(start: number, end: number) {
  const [minute, setMinute] = useState(start)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState<ClockSpeed>(1)
  const minuteRef = useRef(start)

  const seek = useCallback(
    (m: number) => {
      const next = Math.max(start, Math.min(end, m))
      minuteRef.current = next
      setMinute(next)
    },
    [start, end],
  )

  const toggle = useCallback(() => {
    if (!playing && minuteRef.current >= end) seek(start)
    setPlaying((p) => !p)
  }, [playing, end, start, seek])

  useEffect(() => {
    if (!playing) return
    let last = performance.now()
    let id = requestAnimationFrame(function tick(now) {
      const next = Math.min(end, minuteRef.current + ((now - last) / 1000) * BASE_SIM_MIN_PER_SEC * speed)
      last = now
      minuteRef.current = next
      setMinute(next)
      if (next >= end) setPlaying(false)
      else id = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(id)
  }, [playing, speed, end])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return
      if (e.key === ' ') {
        e.preventDefault()
        toggle()
      } else if (e.key === 'ArrowRight') seek(Math.floor(minuteRef.current / 5) * 5 + 5)
      else if (e.key === 'ArrowLeft') seek(Math.ceil(minuteRef.current / 5) * 5 - 5)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggle, seek])

  const cycleSpeed = useCallback(
    () => setSpeed((s) => CLOCK_SPEEDS[(CLOCK_SPEEDS.indexOf(s) + 1) % CLOCK_SPEEDS.length] ?? 1),
    [],
  )

  return { minute, playing, speed, cycleSpeed, toggle, seek, start, end }
}

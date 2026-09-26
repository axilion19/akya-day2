import { Crosshair } from 'lucide-react'
import { t } from '@/i18n'
import { cn } from '@/lib/utils'
import { PanelToggle } from './PanelToggle'

interface Props {
  zones: string[]
  activeZone: string | null
  counts: Record<string, { tracks: number; reports: number }>
  onZone: (zone: string | null) => void
  open: boolean
  onToggle: () => void
}

/** Left panel: zone list (click = focus + filter), collapsible to its title. Layer toggles live in the legend. */
export function ZonePanel({ zones, activeZone, counts, onZone, open, onToggle }: Props) {
  const fm = t.fieldMap
  return (
    <div className="flex w-56 flex-col gap-3 rounded-lg border bg-card/85 p-3 backdrop-blur">
      <div className="relative">
        <div>
          <h1 className="text-sm font-semibold tracking-widest text-emerald-400">
            {fm.title.toLocaleUpperCase('tr-TR')}
          </h1>
          <p className="text-[11px] text-muted-foreground">{fm.subtitle}</p>
        </div>
        <div className="absolute -top-1 -right-1">
          <PanelToggle open={open} onToggle={onToggle} />
        </div>
      </div>
      {open && (
        <nav className="flex flex-col gap-1" aria-label={fm.allZones}>
          <button
            type="button"
            onClick={() => onZone(null)}
            className={cn(
              'flex items-center gap-2 rounded-md border px-2 py-1 text-left text-xs transition-colors hover:border-cyan-500/60',
              activeZone === null ? 'border-cyan-500/60 bg-cyan-500/10 text-cyan-200' : 'border-transparent',
            )}
          >
            <Crosshair aria-hidden className="size-3.5 text-emerald-400" />
            {fm.base} · {fm.allZones}
          </button>
          {zones.map((z) => {
            const c = counts[z]
            return (
              <button
                key={z}
                type="button"
                onClick={() => onZone(activeZone === z ? null : z)}
                className={cn(
                  'flex items-center justify-between gap-2 rounded-md border px-2 py-1 text-left text-xs transition-colors hover:border-cyan-500/60',
                  activeZone === z ? 'border-cyan-500/60 bg-cyan-500/10 text-cyan-200' : 'border-border/60 bg-background/40',
                )}
              >
                <span className="truncate">{z}</span>
                {c && (
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground" title={`${fm.activeTracks(c.tracks)} · ${fm.reportsSoFar(c.reports)}`}>
                    <span className="text-emerald-400">{c.tracks}</span>/<span className="text-sky-400">{c.reports}</span>
                  </span>
                )}
              </button>
            )
          })}
        </nav>
      )}
    </div>
  )
}

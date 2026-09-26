import { MapPin } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { MapReport } from '@/api/types'
import { t } from '@/i18n'
import { formatCoord } from '@/lib/format'
import { cn } from '@/lib/utils'
import { SourceBadge } from './SourceBadge'

interface Props {
  reports: MapReport[] // already filtered and time-limited, newest first
  minute: number
  selectedId: string | null
  onSelect: (report: MapReport) => void
}

const FRESH_MIN = 10

/** Right panel: reports received up to the clock time, newest on top. */
export function ReportFeed({ reports, minute, selectedId, onSelect }: Props) {
  const fm = t.fieldMap
  const items = useRef(new Map<string, HTMLLIElement>())

  useEffect(() => {
    if (selectedId) items.current.get(selectedId)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selectedId])

  return (
    <section className="flex min-h-0 w-80 flex-col rounded-lg border bg-card/85 backdrop-blur" aria-label={fm.feedTitle}>
      <header className="flex items-center justify-between border-b px-3 py-2">
        <h2 className="text-xs font-semibold tracking-widest text-emerald-400">{fm.feedTitle.toLocaleUpperCase('tr-TR')}</h2>
        <span className="font-mono text-xs text-muted-foreground">{reports.length}</span>
      </header>
      {reports.length === 0 ? (
        <p className="p-4 text-xs text-muted-foreground">{fm.feedEmpty}</p>
      ) : (
        <ol className="min-h-0 flex-1 overflow-y-auto">
          {reports.map((r) => {
            const fresh = minute - r.time_min <= FRESH_MIN
            const where = r.zone
              ? r.zone_named
                ? r.zone
                : fm.nearZone(r.zone)
              : r.location
                ? `${formatCoord(r.location.lat, 4)}, ${formatCoord(r.location.lon, 4)}`
                : fm.noLocation
            return (
              <li
                key={r.report_id}
                ref={(el) => {
                  if (el) items.current.set(r.report_id, el)
                  else items.current.delete(r.report_id)
                }}
                className="animate-in fade-in slide-in-from-top-1 duration-300"
              >
                <button
                  type="button"
                  onClick={() => onSelect(r)}
                  className={cn(
                    'flex w-full flex-col gap-1 border-b border-l-2 px-3 py-2 text-left transition-colors hover:bg-accent/40',
                    r.report_id === selectedId ? 'border-l-cyan-400 bg-cyan-500/10' : fresh ? 'border-l-emerald-500/70 bg-emerald-500/5' : 'border-l-transparent',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-foreground">{r.time}</span>
                    <SourceBadge source={r.source} />
                    <span className="ml-auto flex min-w-0 items-center gap-1 text-[10px] text-muted-foreground">
                      {r.location && <MapPin aria-hidden className="size-3 shrink-0 text-cyan-400" />}
                      <span className="truncate">{where}</span>
                    </span>
                  </div>
                  <p className="font-mono text-[11px] leading-snug text-slate-300">{r.text}</p>
                </button>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}

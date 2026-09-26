import { Route } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { t } from '@/i18n'
import { cn } from '@/lib/utils'

export type LegendKey = 'zones' | 'tracks' | 'frames' | 'official' | 'third_party'

const ITEMS: { key: LegendKey; label: (lg: typeof t.fieldMap.legend) => string; swatch: string }[] = [
  { key: 'zones', label: (lg) => lg.zone, swatch: 'size-2.5 rounded-full bg-violet-400' },
  { key: 'tracks', label: (lg) => lg.track, swatch: 'h-0.5 w-4 rounded bg-emerald-400' },
  { key: 'frames', label: (lg) => lg.frame, swatch: 'size-2.5 border border-sky-300 bg-sky-500/40' },
  { key: 'official', label: (lg) => lg.official, swatch: 'size-2.5 rounded-full bg-sky-400' },
  { key: 'third_party', label: (lg) => lg.thirdParty, swatch: 'size-2.5 rounded-full bg-amber-400' },
]

interface Props {
  visible: Record<LegendKey, boolean>
  onToggle: (key: LegendKey) => void
  allTracks: boolean
  onAllTracks: () => void
}

/** Symbol key that doubles as the layer filter: click an entry to hide it (struck through) on the map.
 *  The trailing toggle keeps every track seen so far on the map instead of only recent ones. */
export function MapLegend({ visible, onToggle, allTracks, onAllTracks }: Props) {
  const lg = t.fieldMap.legend
  return (
    <div className="flex flex-wrap items-center gap-x-1 gap-y-1 rounded-lg border bg-card/80 px-1.5 py-1 text-[11px] text-muted-foreground backdrop-blur">
      {ITEMS.map(({ key, label, swatch }) => {
        const on = visible[key]
        return (
          <Button
            key={key}
            size="xs"
            variant="ghost"
            aria-pressed={on}
            title={lg.toggle}
            onClick={() => onToggle(key)}
            className={cn(
              'gap-1.5 px-1.5 text-[11px] font-normal text-muted-foreground',
              !on && 'line-through opacity-50',
            )}
          >
            <span aria-hidden className={swatch} />
            {label(lg)}
          </Button>
        )
      })}
      <span aria-hidden className="mx-1 h-4 w-px bg-border" />
      <Button
        size="xs"
        variant={allTracks ? 'secondary' : 'ghost'}
        aria-pressed={allTracks}
        title={lg.allTracksHint}
        onClick={onAllTracks}
        className={cn('gap-1.5 px-1.5 text-[11px] font-normal', allTracks ? 'text-emerald-300' : 'text-muted-foreground')}
      >
        <Route />
        {lg.allTracks}
      </Button>
    </div>
  )
}

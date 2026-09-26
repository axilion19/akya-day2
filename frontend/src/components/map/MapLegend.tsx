import { t } from '@/i18n'

/** Symbol key plus interaction hints (bottom-left, above the time bar). */
export function MapLegend() {
  const lg = t.fieldMap.legend
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border bg-card/80 px-3 py-2 text-[11px] text-muted-foreground backdrop-blur">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-full bg-violet-400" />
          {lg.zone}
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-0.5 w-4 rounded bg-emerald-400" />
          {lg.track}
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 border border-sky-300 bg-sky-500/40" />
          {lg.frame}
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-full bg-sky-400" />
          {lg.official}
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-full bg-amber-400" />
          {lg.thirdParty}
        </span>
      </div>
      <p className="text-[10px] text-muted-foreground/80">{t.fieldMap.hint}</p>
    </div>
  )
}

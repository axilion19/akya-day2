import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router'
import { imageUrl } from '@/api/endpoints'
import type { ImageMeta } from '@/api/types'
import { type ImageFilter, ImageFilters } from '@/components/overview/ImageFilters'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useImages } from '@/hooks/useImages'
import { t } from '@/i18n'
import { hhmm } from '@/lib/fieldMap'

const NO_ZONE = '—'

const parseTime = (value: string | null): number | null => {
  const m = value?.match(/^(\d{1,2}):(\d{2})$/)
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

/** Filter state lives in the URL (?from=09:00&to=12:30&zone=A&zone=B) so it survives a trip to an analysis. */
function useImageFilter(images: ImageMeta[]) {
  const [params, setParams] = useSearchParams()
  const bounds = useMemo(() => {
    const mins = images.map((m) => m.capture_min)
    return mins.length ? { from: Math.min(...mins), to: Math.max(...mins) } : { from: 0, to: 24 * 60 - 1 }
  }, [images])
  const filter: ImageFilter = {
    from: parseTime(params.get('from')) ?? bounds.from,
    to: parseTime(params.get('to')) ?? bounds.to,
    zones: params.getAll('zone'),
  }
  const setFilter = (f: ImageFilter) => {
    const next = new URLSearchParams()
    if (f.from !== bounds.from) next.set('from', hhmm(f.from))
    if (f.to !== bounds.to) next.set('to', hhmm(f.to))
    for (const z of f.zones) next.append('zone', z)
    setParams(next, { replace: true })
  }
  return { filter, bounds, setFilter, reset: () => setParams({}, { replace: true }) }
}

// TODO(P4): KPI strip, scene map with frame footprints, risk badges from batch precompute.
export function OverviewPage() {
  const { data, isPending, isError } = useImages()
  const images = useMemo(() => [...(data ?? [])].sort((a, b) => a.capture_min - b.capture_min), [data])
  const { filter, bounds, setFilter, reset } = useImageFilter(images)

  const zoneCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const m of images) counts.set(m.zone ?? NO_ZONE, (counts.get(m.zone ?? NO_ZONE) ?? 0) + 1)
    return [...counts].map(([zone, count]) => ({ zone, count })).sort((a, b) => a.zone.localeCompare(b.zone, 'tr'))
  }, [images])

  const shown = images.filter(
    (m) =>
      m.capture_min >= filter.from &&
      m.capture_min <= filter.to &&
      (filter.zones.length === 0 || filter.zones.includes(m.zone ?? NO_ZONE)),
  )

  return (
    <div className="flex flex-col gap-4 p-6">
      <div>
        <h1 className="text-lg font-semibold">{t.overview.title}</h1>
        {data && <p className="text-sm text-muted-foreground">{t.overview.subtitle(images.length)}</p>}
      </div>
      {images.length > 0 && (
        <ImageFilters
          filter={filter}
          bounds={bounds}
          zoneCounts={zoneCounts}
          shown={shown.length}
          total={images.length}
          onChange={setFilter}
          onReset={reset}
        />
      )}
      {isPending && <Skeleton className="h-48" />}
      {(isError || data?.length === 0) && <p className="text-sm text-muted-foreground">{t.overview.empty}</p>}
      {images.length > 0 && shown.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-sm text-muted-foreground">
          {t.overview.filters.noMatch}
          <Button size="sm" variant="outline" onClick={reset}>
            {t.overview.filters.clear}
          </Button>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        {shown.map((m) => (
          <Link
            key={m.image_id}
            to={`/analysis/${m.image_id}`}
            className="group overflow-hidden rounded-lg border bg-card transition-colors hover:border-primary"
          >
            <img src={imageUrl(m.image_id)} alt={m.image_id} loading="lazy" className="aspect-video w-full object-cover opacity-90 group-hover:opacity-100" />
            <div className="flex items-center justify-between px-3 py-2 text-xs">
              <span className="font-mono">{m.image_id}</span>
              <span className="text-muted-foreground">{`${m.zone ?? NO_ZONE} · ${m.capture_time}`}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}

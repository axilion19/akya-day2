import { Link } from 'react-router'
import { imageUrl } from '@/api/endpoints'
import { Skeleton } from '@/components/ui/skeleton'
import { useImages } from '@/hooks/useImages'
import { t } from '@/i18n'

// TODO(P4): KPI strip, scene map with frame footprints, risk badges from batch precompute.
export function OverviewPage() {
  const { data: images, isPending, isError } = useImages()

  return (
    <div className="flex flex-col gap-4 p-6">
      <div>
        <h1 className="text-lg font-semibold">{t.overview.title}</h1>
        {images && <p className="text-sm text-muted-foreground">{t.overview.subtitle(images.length)}</p>}
      </div>
      {isPending && <Skeleton className="h-48" />}
      {(isError || images?.length === 0) && <p className="text-sm text-muted-foreground">{t.overview.empty}</p>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        {images?.map((m) => (
          <Link
            key={m.image_id}
            to={`/analysis/${m.image_id}`}
            className="group overflow-hidden rounded-lg border bg-card transition-colors hover:border-primary"
          >
            <img src={imageUrl(m.image_id)} alt={m.image_id} loading="lazy" className="aspect-video w-full object-cover opacity-90 group-hover:opacity-100" />
            <div className="flex items-center justify-between px-3 py-2 text-xs">
              <span className="font-mono">{m.image_id}</span>
              <span className="text-muted-foreground">{`${m.zone ?? '—'} · ${m.capture_time}`}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}

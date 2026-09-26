import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { FieldMapView } from '@/components/map/FieldMapView'
import { useFieldMapData } from '@/hooks/useFieldMap'
import { t } from '@/i18n'

export function FieldMapPage() {
  const { scene, images, tracks, reports, isPending, isError, refetch } = useFieldMapData()

  if (isError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
        <p>{t.fieldMap.loadError}</p>
        <Button size="sm" variant="outline" onClick={refetch}>
          {t.common.retry}
        </Button>
      </div>
    )
  }
  if (isPending || !scene || !images || !tracks || !reports) {
    return <Skeleton className="m-3 h-[calc(100%-1.5rem)]" />
  }
  return <FieldMapView scene={scene} images={images} tracks={tracks} reports={reports} />
}

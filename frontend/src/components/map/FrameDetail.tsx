import { ScanSearch, X } from 'lucide-react'
import { useState } from 'react'
import { imageUrl } from '@/api/endpoints'
import type { ImageMeta } from '@/api/types'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { t } from '@/i18n'
import { formatCoord, placeName } from '@/lib/format'

interface Props {
  frame: ImageMeta
  trackCount: number
  onAnalyze: () => void
  onClose: () => void
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="font-mono text-xs">{value}</dd>
    </div>
  )
}

/** Floating card for the selected drone frame: preview, metadata and the jump to its analysis. */
export function FrameDetail({ frame, trackCount, onAnalyze, onClose }: Props) {
  const ft = t.fieldMap.frame
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const corners = Object.values(frame.corners)
  const center = corners.length
    ? { lat: corners.reduce((a, p) => a + p.lat, 0) / corners.length, lon: corners.reduce((a, p) => a + p.lon, 0) / corners.length }
    : null

  return (
    <aside className="w-72 rounded-lg border border-sky-500/40 bg-card/90 p-3 shadow-lg backdrop-blur animate-in fade-in slide-in-from-right-2 duration-200">
      <header className="mb-2 flex items-center justify-between">
        <div>
          <h2 className="font-mono text-sm font-semibold text-sky-200">{frame.image_id}</h2>
          <p className="text-[11px] text-muted-foreground">{ft.subtitle}</p>
        </div>
        <Button size="icon-sm" variant="ghost" onClick={onClose} aria-label={ft.close}>
          <X />
        </Button>
      </header>
      <div className="relative mb-3 overflow-hidden rounded-md border bg-background" style={{ aspectRatio: `${frame.width_px} / ${frame.height_px}` }}>
        {status === 'loading' && <Skeleton className="absolute inset-0" />}
        {status === 'error' ? (
          <p className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">{ft.imageError}</p>
        ) : (
          <img
            key={frame.image_id}
            src={imageUrl(frame.image_id)}
            alt={frame.image_id}
            onLoad={() => setStatus('ready')}
            onError={() => setStatus('error')}
            className="size-full object-cover"
          />
        )}
      </div>
      <dl className="flex flex-col gap-1.5">
        <Row label={ft.captured} value={frame.capture_time} />
        <Row label={ft.zone} value={frame.zone ? placeName(frame.zone) : '—'} />
        {center && <Row label={ft.center} value={`${formatCoord(center.lat)}, ${formatCoord(center.lon)}`} />}
        <Row label={ft.size} value={`${frame.width_px}×${frame.height_px}`} />
        <Row label={ft.tracks} value={String(trackCount)} />
      </dl>
      <Button className="mt-3 w-full" onClick={onAnalyze}>
        <ScanSearch />
        {ft.analyze}
      </Button>
    </aside>
  )
}

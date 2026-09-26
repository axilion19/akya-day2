import { ShieldHalf } from 'lucide-react'
import { t } from '@/i18n'

// TODO(P4): design the home page (next step); for now only the product name, reached from the logo.
export function HomePage() {
  return (
    <div className="grid h-full place-items-center p-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <ShieldHalf aria-hidden className="size-12 text-primary" />
        <h1 className="text-3xl font-semibold tracking-[0.4em]">{t.app.name}</h1>
        <p className="text-sm text-muted-foreground">{t.app.tagline}</p>
      </div>
    </div>
  )
}

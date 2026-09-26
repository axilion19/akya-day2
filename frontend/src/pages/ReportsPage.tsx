import { t } from '@/i18n'

// TODO(P4): reports table (time, source, raw text, extracted claims, verdict, linked frames).
export function ReportsPage() {
  return (
    <div className="flex flex-col gap-4 p-6">
      <h1 className="text-lg font-semibold">{t.reports.title}</h1>
      <p className="text-sm text-muted-foreground">{t.reports.pending}</p>
    </div>
  )
}

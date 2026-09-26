import { t } from '@/i18n'

/** Placeholder; the admin panel is designed in a separate task. */
export function AdminPage() {
  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold">{t.admin.title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t.admin.comingSoon}</p>
    </div>
  )
}

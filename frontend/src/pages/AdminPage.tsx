import { t } from '@/i18n'

/** Temporary shell; the editor lands in the next commit. */
export function AdminPage() {
  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold">{t.admin.title}</h1>
    </div>
  )
}

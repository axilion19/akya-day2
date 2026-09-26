import { ShieldHalf } from 'lucide-react'
import { NavLink } from 'react-router'
import { t } from '@/i18n'
import { cn } from '@/lib/utils'

const NAV = [
  { to: '/', label: t.nav.overview, end: true },
  { to: '/map', label: t.nav.map, end: false },
  { to: '/watch', label: t.nav.watch, end: false },
  { to: '/analysis', label: t.nav.analysis, end: false },
  { to: '/reports', label: t.nav.reports, end: false },
] as const

export function TopBar() {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b bg-card/60 px-4">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <ShieldHalf aria-hidden className="size-5 text-primary" />
          <span className="font-semibold tracking-widest">{t.app.name}</span>
          <span className="hidden text-xs text-muted-foreground lg:inline">{t.app.tagline}</span>
        </div>
        <nav className="flex items-center gap-1">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground',
                  isActive && 'bg-accent text-foreground',
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </header>
  )
}

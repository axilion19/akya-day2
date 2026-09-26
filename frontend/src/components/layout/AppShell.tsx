import { Outlet } from 'react-router'
import { TopBar } from './TopBar'

export function AppShell() {
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <TopBar />
      <main className="min-h-0 flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}

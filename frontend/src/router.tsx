import { createBrowserRouter, Navigate } from 'react-router'
import { RequireAuth } from '@/components/auth/RequireAuth'
import { AppShell } from '@/components/layout/AppShell'
import { AdminPage } from '@/pages/AdminPage'
import { AnalysisPage } from '@/pages/AnalysisPage'
import { FieldMapPage } from '@/pages/FieldMapPage'
import { HomePage } from '@/pages/HomePage'
import { LoginPage } from '@/pages/LoginPage'
import { OverviewPage } from '@/pages/OverviewPage'
import { WatchPage } from '@/pages/WatchPage'

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <HomePage /> },
          { path: 'overview', element: <OverviewPage /> },
          { path: 'map', element: <FieldMapPage /> },
          { path: 'watch', element: <WatchPage /> },
          { path: 'analysis/:imageId', element: <AnalysisPage /> },
          { element: <RequireAuth role="admin" />, children: [{ path: 'admin', element: <AdminPage /> }] },
          { path: '*', element: <Navigate to="/" replace /> },
        ],
      },
    ],
  },
])

import { createBrowserRouter, Navigate } from 'react-router'
import { AppShell } from '@/components/layout/AppShell'
import { AnalysisPage } from '@/pages/AnalysisPage'
import { FieldMapPage } from '@/pages/FieldMapPage'
import { OverviewPage } from '@/pages/OverviewPage'
import { ReportsPage } from '@/pages/ReportsPage'
import { WatchPage } from '@/pages/WatchPage'

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { index: true, element: <OverviewPage /> },
      { path: 'map', element: <FieldMapPage /> },
      { path: 'watch', element: <WatchPage /> },
      { path: 'analysis', element: <Navigate to="/analysis/img_000860" replace /> },
      { path: 'analysis/:imageId', element: <AnalysisPage /> },
      { path: 'reports', element: <ReportsPage /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])

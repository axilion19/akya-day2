import { createBrowserRouter, Navigate } from 'react-router'
import { AppShell } from '@/components/layout/AppShell'
import { AnalysisPage } from '@/pages/AnalysisPage'
import { HomePage } from '@/pages/HomePage'
import { OverviewPage } from '@/pages/OverviewPage'
import { WatchPage } from '@/pages/WatchPage'

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'overview', element: <OverviewPage /> },
      { path: 'map', element: <Navigate to="/watch" replace /> }, // the agent map is the map now
      { path: 'watch', element: <WatchPage /> },
      { path: 'analysis/:imageId', element: <AnalysisPage /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])

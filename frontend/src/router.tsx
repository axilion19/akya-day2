import { createBrowserRouter, Navigate } from 'react-router'
import { AppShell } from '@/components/layout/AppShell'
import { AnalysisPage } from '@/pages/AnalysisPage'
import { FieldMapPage } from '@/pages/FieldMapPage'
import { OverviewPage } from '@/pages/OverviewPage'

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { index: true, element: <OverviewPage /> },
      { path: 'map', element: <FieldMapPage /> },
      { path: 'analysis/:imageId', element: <AnalysisPage /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])

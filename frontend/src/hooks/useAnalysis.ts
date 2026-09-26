import { useQuery } from '@tanstack/react-query'
import { ApiError, USE_MOCKS } from '@/api/client'
import { createAnalysis, getAnalysis } from '@/api/endpoints'
import type { Analysis } from '@/api/types'
import { mockAnalyses } from '@/mocks'

async function fetchAnalysis(imageId: string): Promise<Analysis> {
  if (USE_MOCKS) {
    const analysis = mockAnalyses[imageId]
    if (!analysis) throw new ApiError(404, `no mock analysis for ${imageId}`)
    return analysis
  }
  // TODO(P3): stream steps via useAnalysisStream once the SSE endpoint exists.
  const { analysis_id } = await createAnalysis(imageId)
  return getAnalysis(analysis_id)
}

export function useAnalysis(imageId: string) {
  return useQuery({
    queryKey: ['analysis', imageId, USE_MOCKS],
    queryFn: () => fetchAnalysis(imageId),
    enabled: imageId !== '',
    retry: false,
    staleTime: Infinity,
  })
}

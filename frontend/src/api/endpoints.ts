import type { components } from './schema'
import { API_BASE_URL, USE_MOCKS, apiGet, apiPost } from './client'
import type { Analysis, Health, ImageMeta, Scene } from './types'

type AnalysisCreated = components['schemas']['AnalysisCreated']

export const getHealth = () => apiGet<Health>('/api/health')
export const getScene = () => apiGet<Scene>('/api/scene')
export const getImages = () => apiGet<ImageMeta[]>('/api/images')
export const getAnalysis = (analysisId: string) =>
  apiGet<Analysis>(`/api/analyses/${encodeURIComponent(analysisId)}`)
export const createAnalysis = (imageId: string, forceRefresh = false) =>
  apiPost<AnalysisCreated>('/api/analyses', { image_id: imageId, force_refresh: forceRefresh })

export const imageUrl = (imageId: string): string =>
  USE_MOCKS
    ? `/mock-images/${encodeURIComponent(imageId)}.jpg`
    : `${API_BASE_URL}/api/images/${encodeURIComponent(imageId)}/file`

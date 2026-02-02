import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import type { Layer } from '@/types/template'

export interface ModelPageWithContext {
  id: string
  name: string
  templateName: string | null
  templateId: number
  width: number
  height: number
  layers: Layer[]
  background: string | null
  thumbnail: string | null
  order: number
  createdAt: string
  updatedAt: string
  template: {
    id: number
    name: string
  }
  project: {
    id: number
    name: string
    logoUrl: string | null
    fonts: Array<{
      id: number
      name: string
      fontFamily: string
      fileUrl: string
    }>
  }
}

export function useGerarCriativoModelPages() {
  return useQuery<ModelPageWithContext[]>({
    queryKey: ['gerar-criativo-model-pages'],
    queryFn: () => api.get('/api/gerar-criativo/model-pages'),
    staleTime: 2 * 60_000, // 2 minutes
    gcTime: 5 * 60_000, // 5 minutes
  })
}

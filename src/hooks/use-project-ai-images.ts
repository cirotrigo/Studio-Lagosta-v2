import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'

interface AIImage {
  id: string
  fileUrl: string
  prompt: string
  createdAt: string
}

export function useProjectAIImages(projectId: number) {
  return useQuery<AIImage[]>({
    queryKey: ['ai-images', projectId],
    queryFn: () => api.get(`/api/projects/${projectId}/ai-images`),
    staleTime: 30_000,
    enabled: !!projectId,
  })
}

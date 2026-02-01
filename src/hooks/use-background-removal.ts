import { useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api-client'

interface RemoveBackgroundParams {
  imageUrl: string
  projectId: number
}

interface RemoveBackgroundResult {
  success: boolean
  url: string
}

export function useBackgroundRemoval() {
  return useMutation({
    mutationFn: async (params: RemoveBackgroundParams): Promise<RemoveBackgroundResult> => {
      return api.post<RemoveBackgroundResult>('/api/ai/remove-background', params)
    },
  })
}

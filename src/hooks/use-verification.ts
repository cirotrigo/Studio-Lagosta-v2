import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import type { SocialPost } from '../../prisma/generated/client'

type PostWithProject = SocialPost & {
  Project: {
    id: number
    name: string
    instagramUsername: string | null
  }
}

type VerificationStatsResponse = {
  total: number
  verified: number
  pending: number
  failed: number
  skipped: number
  verifiedByFallback: number
}

/**
 * Hook para buscar posts com falha na verificação
 */
export function useVerificationFailedPosts(projectId?: number) {
  return useQuery<PostWithProject[]>({
    queryKey: ['verification', 'failed', projectId],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (projectId) params.append('projectId', projectId.toString())

      return api.get<PostWithProject[]>(`/api/verification/failed?${params}`)
    },
    staleTime: 30_000, // 30 seconds
    gcTime: 5 * 60_000, // 5 minutes
  })
}

/**
 * Hook para buscar estatísticas de verificação
 */
export function useVerificationStats(projectId?: number) {
  return useQuery<VerificationStatsResponse>({
    queryKey: ['verification', 'stats', projectId],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (projectId) params.append('projectId', projectId.toString())

      return api.get<VerificationStatsResponse>(`/api/verification/stats?${params}`)
    },
    staleTime: 60_000, // 1 minute
    gcTime: 10 * 60_000, // 10 minutes
  })
}

/**
 * Hook para forçar re-verificação de um post (admin only)
 */
export function useRetryVerification() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (postId: string) => {
      return api.post(`/api/admin/verify-story/${postId}`, {})
    },
    onSuccess: () => {
      // Invalidate all verification queries
      queryClient.invalidateQueries({ queryKey: ['verification'] })
      queryClient.invalidateQueries({ queryKey: ['posts'] })
    },
  })
}

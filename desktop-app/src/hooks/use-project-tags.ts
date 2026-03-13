import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api-client'
import { useAuthStore } from '@/stores/auth.store'
import { useTagsStore } from '@/stores/tags.store'
import type { ProjectTag } from '@/types/template'

export function useProjectTags(projectId: number | undefined) {
  const { logout } = useAuthStore()
  const setTags = useTagsStore((state) => state.setTags)
  const setLoading = useTagsStore((state) => state.setLoading)
  const setError = useTagsStore((state) => state.setError)
  const reset = useTagsStore((state) => state.reset)

  const query = useQuery<ProjectTag[]>({
    queryKey: ['project-tags', projectId],
    queryFn: async () => {
      try {
        return await api.get<ProjectTag[]>(`/api/projects/${projectId}/tags`)
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          await logout()
        }
        throw error
      }
    },
    enabled: !!projectId,
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    retry: (failureCount, error) => {
      if (error instanceof ApiError && error.status === 401) return false
      return failureCount < 2
    },
  })

  // Sync query state to store
  useEffect(() => {
    if (!projectId) {
      reset()
      return
    }

    setLoading(query.isLoading)

    if (query.data) {
      setTags(query.data)
    }

    if (query.error) {
      setError(query.error instanceof Error ? query.error.message : 'Failed to load tags')
    }
  }, [projectId, query.isLoading, query.data, query.error, setTags, setLoading, setError, reset])

  return query
}

export function useSyncProjectTags(projectId: number | undefined) {
  // This hook just triggers the sync when called
  return useProjectTags(projectId)
}

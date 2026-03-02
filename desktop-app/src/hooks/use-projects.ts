import { useQuery } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api-client'
import { Project, useProjectStore } from '@/stores/project.store'
import { useAuthStore } from '@/stores/auth.store'
import { useEffect } from 'react'

export function useProjects() {
  const { setProjects, setLoading } = useProjectStore()
  const { logout } = useAuthStore()

  const query = useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: async () => {
      try {
        const data = await api.get<Project[]>('/api/projects')
        // Ensure we always return an array
        if (Array.isArray(data)) {
          return data
        }
        console.error('[useProjects] API did not return an array:', data)
        return []
      } catch (error) {
        // If 401, session expired - force logout to show login screen
        if (error instanceof ApiError && error.status === 401) {
          console.warn('[useProjects] Session expired (401) - logging out')
          await logout()
        }
        throw error
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    retry: (failureCount, error) => {
      // Don't retry on auth errors
      if (error instanceof ApiError && error.status === 401) return false
      return failureCount < 2
    },
  })

  // Sync projects to store
  useEffect(() => {
    if (query.data && Array.isArray(query.data)) {
      setProjects(query.data)
    } else if (query.data) {
      console.error('[useProjects] query.data is not an array:', query.data)
      setProjects([])
    }
  }, [query.data, setProjects])

  // Sync loading state
  useEffect(() => {
    setLoading(query.isLoading)
  }, [query.isLoading, setLoading])

  return query
}

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import { Project, useProjectStore } from '@/stores/project.store'
import { useEffect } from 'react'

export function useProjects() {
  const { setProjects, setLoading } = useProjectStore()

  const query = useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: async () => {
      const data = await api.get<Project[]>('/api/tools/projects')
      return data
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  })

  // Sync projects to store
  useEffect(() => {
    if (query.data) {
      setProjects(query.data)
    }
  }, [query.data, setProjects])

  // Sync loading state
  useEffect(() => {
    setLoading(query.isLoading)
  }, [query.isLoading, setLoading])

  return query
}

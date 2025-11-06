import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'

/**
 * Hook to fetch scheduled post counts for all projects
 * This is separated from the main projects query for performance optimization
 * Use this only when you need the scheduled counts (e.g., in the agenda page)
 */
export function useScheduledPostCounts() {
  return useQuery<Record<number, number>>({
    queryKey: ['scheduled-post-counts'],
    queryFn: () => api.get<Record<number, number>>('/api/projects/scheduled-counts'),
    staleTime: 5 * 60 * 1000, // 5 minutes - reduced frequency for better performance
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false, // Disabled to reduce unnecessary requests
    refetchInterval: false, // No automatic polling
  })
}

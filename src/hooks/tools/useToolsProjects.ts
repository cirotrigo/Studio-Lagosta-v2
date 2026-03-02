import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'

export interface ToolsProject {
  id: number
  name: string
  status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED'
  logoUrl: string | null
  instagramAccountId: string | null
  instagramUsername: string | null
  postingProvider: 'ZAPIER' | 'LATER' | null
  zapierWebhookUrl: string | null
}

export function useToolsProjects() {
  return useQuery<ToolsProject[]>({
    queryKey: ['tools-projects'],
    queryFn: () => api.get<ToolsProject[]>('/api/tools/projects'),
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
  })
}

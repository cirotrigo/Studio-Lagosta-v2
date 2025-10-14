import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'

const ORGANIZATION_QUERY_ROOT = ['organizations'] as const

const organizationKeys = {
  root: ORGANIZATION_QUERY_ROOT,
  detail: (orgId: string) => [...ORGANIZATION_QUERY_ROOT, orgId] as const,
  credits: (orgId: string) => [...ORGANIZATION_QUERY_ROOT, orgId, 'credits'] as const,
  usage: (orgId: string, params: { cursor?: string; limit?: number } = {}) =>
    [...ORGANIZATION_QUERY_ROOT, orgId, 'credits', 'usage', params] as const,
  projects: (orgId: string) => [...ORGANIZATION_QUERY_ROOT, orgId, 'projects'] as const,
  settings: (orgId: string) => [...ORGANIZATION_QUERY_ROOT, orgId, 'settings'] as const,
}

type CreditsResponse = {
  organization: {
    id: string
    name: string
    slug: string
    isActive: boolean
  }
  credits: {
    current: number
    refillAmount: number
    lastRefill: string | null
  }
  limits: {
    maxMembers: number
    maxProjects: number
    creditsPerMonth: number
  }
}

export function useOrganizationCredits(orgId: string | null) {
  return useQuery({
    queryKey: orgId ? organizationKeys.credits(orgId) : ['organization', 'credits', 'disabled'],
    queryFn: () => api.get<CreditsResponse>(`/api/organizations/${orgId}/credits`),
    enabled: Boolean(orgId),
    staleTime: 30_000,
  })
}

type CreditsUsageResponse = {
  data: Array<{
    id: string
    organizationId: string
    userId: string
    feature: string
    credits: number
    metadata?: Record<string, unknown>
    createdAt: string
    project?: { id: number; name: string }
  }>
  nextCursor: string | null
}

export function useOrganizationCreditsUsage(
  orgId: string | null,
  params: { cursor?: string; limit?: number } = {}
) {
  return useQuery({
    queryKey: orgId ? organizationKeys.usage(orgId, params) : ['organization', 'usage', 'disabled'],
    queryFn: () => {
      const search = new URLSearchParams()
      if (params.cursor) search.set('cursor', params.cursor)
      if (params.limit) search.set('limit', String(params.limit))
      const query = search.toString()
      const url = `/api/organizations/${orgId}/credits/usage${query ? `?${query}` : ''}`
      return api.get<CreditsUsageResponse>(url)
    },
    enabled: Boolean(orgId),
  })
}

type ProjectsResponse = {
  projects: Array<{
    id: number
    name: string
    description: string | null
    sharedAt: string
    sharedBy: string
    defaultCanEdit: boolean
    ownerId: string
    updatedAt: string
    createdAt: string
  }>
}

export function useOrganizationProjects(orgId: string | null) {
  return useQuery({
    queryKey: orgId ? organizationKeys.projects(orgId) : ['organization', 'projects', 'disabled'],
    queryFn: () => api.get<ProjectsResponse>(`/api/organizations/${orgId}/projects`),
    enabled: Boolean(orgId),
    staleTime: 15_000,
  })
}

type ShareProjectPayload = {
  projectId: number
  canEdit?: boolean
}

export function useShareProjectMutation(orgId: string | null) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (payload: ShareProjectPayload) =>
      api.post(`/api/organizations/${orgId}/projects`, payload),
    onSuccess: () => {
      if (orgId) {
        queryClient.invalidateQueries({ queryKey: organizationKeys.projects(orgId) })
      }
    },
  })
}

export function useRemoveSharedProjectMutation(orgId: string | null) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (projectId: number) =>
      api.delete(`/api/organizations/${orgId}/projects/${projectId}`),
    onSuccess: () => {
      if (orgId) {
        queryClient.invalidateQueries({ queryKey: organizationKeys.projects(orgId) })
      }
    },
  })
}

type SettingsResponse = {
  organization: {
    id: string
    name: string
    slug: string
    isActive: boolean
    role: string | null
  }
  settings: {
    maxMembers: number
    maxProjects: number
    creditsPerMonth: number
  }
}

export function useOrganizationSettings(orgId: string | null) {
  return useQuery({
    queryKey: orgId ? organizationKeys.settings(orgId) : ['organization', 'settings', 'disabled'],
    queryFn: () => api.get<SettingsResponse>(`/api/organizations/${orgId}/settings`),
    enabled: Boolean(orgId),
    staleTime: 60_000,
  })
}

type UpdateSettingsPayload = Partial<{
  maxMembers: number
  maxProjects: number
  creditsPerMonth: number
}>

export function useUpdateOrganizationSettings(orgId: string | null) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (payload: UpdateSettingsPayload) =>
      api.patch(`/api/organizations/${orgId}/settings`, payload),
    onSuccess: () => {
      if (orgId) {
        queryClient.invalidateQueries({ queryKey: organizationKeys.settings(orgId) })
        queryClient.invalidateQueries({ queryKey: organizationKeys.credits(orgId) })
      }
    },
  })
}

type AdjustCreditsPayload = {
  amount: number
  reason?: string
}

export function useAdjustOrganizationCredits(orgId: string | null) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (payload: AdjustCreditsPayload) =>
      api.post(`/api/organizations/${orgId}/credits`, payload),
    onSuccess: () => {
      if (orgId) {
        queryClient.invalidateQueries({ queryKey: organizationKeys.credits(orgId) })
        queryClient.invalidateQueries({
          queryKey: [...ORGANIZATION_QUERY_ROOT, orgId, 'credits', 'usage'],
        })
      }
    },
  })
}

export { organizationKeys }

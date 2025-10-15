import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'

const ORGANIZATION_QUERY_ROOT = ['organizations'] as const

const organizationKeys = {
  root: ORGANIZATION_QUERY_ROOT,
  detail: (orgId: string) => [...ORGANIZATION_QUERY_ROOT, orgId] as const,
  credits: (orgId: string) => [...ORGANIZATION_QUERY_ROOT, orgId, 'credits'] as const,
  usage: (orgId: string, params: { cursor?: string; limit?: number } = {}) =>
    [...ORGANIZATION_QUERY_ROOT, orgId, 'credits', 'usage', params] as const,
  limitsInfo: [...ORGANIZATION_QUERY_ROOT, 'limits'] as const,
  analytics: (orgId: string, params: { period?: string; startDate?: string; endDate?: string } = {}) =>
    [...ORGANIZATION_QUERY_ROOT, orgId, 'analytics', params] as const,
  analyticsMembers: (
    orgId: string,
    params: { period?: string; startDate?: string; endDate?: string } = {}
  ) => [...ORGANIZATION_QUERY_ROOT, orgId, 'analytics', 'members', params] as const,
  analyticsTimeline: (orgId: string, params: { period?: string } = {}) =>
    [...ORGANIZATION_QUERY_ROOT, orgId, 'analytics', 'timeline', params] as const,
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
    projectId?: number | null
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

type AnalyticsSummaryResponse = {
  organization: {
    id: string
    name: string
    creditsPerMonth: number
  }
  period: {
    key: string
    start: string
    end: string
  }
  summary: {
    totalCreditsUsed: number
    totalOperations: number
    membersActive: number
  }
  features: Array<{
    feature: string
    operations: number
    creditsUsed: number
  }>
  recentActivity: Array<{
    id: string
    userId: string | null
    feature: string
    credits: number
    createdAt: string
    projectId?: number | null
  }>
}

export function useOrganizationAnalytics(
  orgId: string | null,
  params: { period?: string; startDate?: string; endDate?: string } = {}
) {
  return useQuery({
    queryKey: orgId ? organizationKeys.analytics(orgId, params) : ['organization', 'analytics', 'disabled'],
    queryFn: () => {
      const search = new URLSearchParams()
      if (params.period) search.set('period', params.period)
      if (params.startDate) search.set('startDate', params.startDate)
      if (params.endDate) search.set('endDate', params.endDate)
      const query = search.toString()
      const url = `/api/organizations/${orgId}/analytics${query ? `?${query}` : ''}`
      return api.get<AnalyticsSummaryResponse>(url)
    },
    enabled: Boolean(orgId),
  })
}

type MemberAnalyticsResponse = {
  period: {
    key: string
    start: string
    end: string
  }
  totals: {
    imageGenerations: number
    videoGenerations: number
    chatInteractions: number
    totalCreditsUsed: number
  }
  members: Array<{
    clerkId: string
    userId: string | null
    name: string | null
    email: string | null
    stats: {
      imageGenerations: number
      videoGenerations: number
      chatInteractions: number
      totalCreditsUsed: number
      lastActivityAt: string | null
    }
    period: {
      start: string
      end: string
    }
    updatedAt: string
  }>
}

export function useOrganizationMemberAnalytics(
  orgId: string | null,
  params: { period?: string; startDate?: string; endDate?: string } = {}
) {
  return useQuery({
    queryKey: orgId
      ? organizationKeys.analyticsMembers(orgId, params)
      : ['organization', 'analytics', 'members', 'disabled'],
    queryFn: () => {
      const search = new URLSearchParams()
      if (params.period) search.set('period', params.period)
      if (params.startDate) search.set('startDate', params.startDate)
      if (params.endDate) search.set('endDate', params.endDate)
      const query = search.toString()
      const url = `/api/organizations/${orgId}/analytics/members${query ? `?${query}` : ''}`
      return api.get<MemberAnalyticsResponse>(url)
    },
    enabled: Boolean(orgId),
  })
}

type TimelineDataPoint = {
  date: string
  imageGenerations: number
  videoGenerations: number
  chatInteractions: number
  creditsUsed: number
}

type TimelineResponse = {
  period: {
    key: string
    start: string
    end: string
  }
  timeline: TimelineDataPoint[]
}

export function useOrganizationTimeline(
  orgId: string | null,
  params: { period?: string } = { period: '30d' }
) {
  return useQuery({
    queryKey: orgId
      ? organizationKeys.analyticsTimeline(orgId, params)
      : ['organization', 'analytics', 'timeline', 'disabled'],
    queryFn: () => {
      const search = new URLSearchParams()
      if (params.period) search.set('period', params.period)
      const query = search.toString()
      const url = `/api/organizations/${orgId}/analytics/timeline${query ? `?${query}` : ''}`
      return api.get<TimelineResponse>(url)
    },
    enabled: Boolean(orgId),
    staleTime: 2 * 60_000, // 2 minutes
  })
}

type OrganizationCreationLimitsResponse = {
  limits: {
    allowOrgCreation: boolean
    orgMemberLimit: number | null
    orgProjectLimit: number | null
    orgCreditsPerMonth: number | null
    orgCountLimit: number | null
  }
  ownedCount: number
  activeOwnedCount: number
  canCreate: boolean
}

export function useOrganizationCreationLimits() {
  return useQuery({
    queryKey: organizationKeys.limitsInfo,
    queryFn: () => api.get<OrganizationCreationLimitsResponse>('/api/organizations/limits'),
    staleTime: 60_000,
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

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'

export interface ProjectShareInfo {
  organizationId: string
  organizationName: string | null
  defaultCanEdit: boolean
  sharedAt: string
}

export interface ProjectResponse {
  id: number
  name: string
  description: string | null
  status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED'
  logoUrl: string | null
  instagramAccountId: string | null
  instagramUsername: string | null
  /** O token em si nunca vem do servidor — só a indicação de que existe */
  hasInstagramToken?: boolean
  instagramTokenExpiresAt?: string | null
  zapierWebhookUrl: string | null
  laterAccountId: string | null
  laterProfileId: string | null
  postingProvider: 'ZAPIER' | 'LATER' | null
  googleDriveFolderId: string | null
  googleDriveFolderName: string | null
  googleDriveImagesFolderId: string | null
  googleDriveImagesFolderName: string | null
  googleDriveVideosFolderId: string | null
  googleDriveVideosFolderName: string | null
  aiChatBehavior: string | null
  artImprovementPrompt: string | null
  makeWebhookAnalyzeUrl: string | null
  makeWebhookCreativeUrl: string | null
  userId: string
  workspaceId: number | null
  createdAt: string
  updatedAt: string
  organizationShares?: ProjectShareInfo[]
  /** True when the current user is the project owner OR a Clerk org admin
   *  of an organization the project is shared with. Used to gate "Modelos"
   *  curator actions. Computed server-side, see GET /api/projects/[id]. */
  canCurate?: boolean
}

export interface ProjectWithLogoResponse extends ProjectResponse {
  Logo?: Array<{
    id: number
    name: string
    fileUrl: string
    isProjectLogo: boolean
  }>
  _count?: {
    Template: number
    Generation: number
  }
  organizationShares?: ProjectShareInfo[]
  followers?: number | null
}

export type UpdateProjectSettingsInput = Partial<{
  googleDriveFolderId: string | null
  googleDriveFolderName: string | null
  googleDriveImagesFolderId: string | null
  googleDriveImagesFolderName: string | null
  googleDriveVideosFolderId: string | null
  googleDriveVideosFolderName: string | null
  aiChatBehavior: string | null
  artImprovementPrompt: string | null
  laterAccountId: string | null
  laterProfileId: string | null
  postingProvider: 'ZAPIER' | 'LATER' | null
}>

export function useProject(projectId: number | null) {
  return useQuery<ProjectResponse | null>({
    queryKey: ['project', projectId],
    enabled: typeof projectId === 'number' && !Number.isNaN(projectId),
    queryFn: async () => {
      if (projectId == null || Number.isNaN(projectId)) {
        return null
      }
      return api.get<ProjectResponse>(`/api/projects/${projectId}`)
    },
  })
}

export interface ProjectLogo {
  id: number
  name: string
  fileUrl: string
  isProjectLogo: boolean
  createdAt: string
}

/**
 * A logo principal do projeto.
 *
 * Vem da tabela `Logo` (flag `isProjectLogo`), NÃO de `Project.logoUrl` — essa
 * coluna está nula nos 11 projetos, enquanto todos têm exatamente uma Logo
 * marcada. Cair no `logoUrl` daria avatar vazio em todo mundo.
 *
 * `enabled` existe para o consumidor só buscar quando a logo for aparecer — a
 * máscara do editor, por exemplo, não busca em canvas que não é story.
 */
export function useProjectLogo(projectId: number | null, enabled = true) {
  return useQuery<ProjectLogo | null>({
    queryKey: ['project-logo', projectId],
    enabled: enabled && typeof projectId === 'number' && !Number.isNaN(projectId),
    staleTime: 10 * 60_000,
    queryFn: async () => {
      if (projectId == null || Number.isNaN(projectId)) return null
      const logos = await api.get<ProjectLogo[]>(`/api/projects/${projectId}/logos`)
      if (!Array.isArray(logos) || logos.length === 0) return null
      // A rota já devolve por createdAt desc, então a primeira é a mais recente
      return logos.find((logo) => logo.isProjectLogo) ?? logos[0]
    },
  })
}

export function useProjects() {
  return useQuery<ProjectWithLogoResponse[]>({
    queryKey: ['projects'],
    queryFn: () => api.get<ProjectWithLogoResponse[]>('/api/projects'),
    staleTime: 5 * 60_000, // 5 minutes
  })
}

export function useUpdateProjectSettings(projectId: number) {
  const queryClient = useQueryClient()

  return useMutation<ProjectResponse, unknown, UpdateProjectSettingsInput>({
    mutationFn: (input) => api.patch(`/api/projects/${projectId}/settings`, input),
    onSuccess: (project) => {
      queryClient.setQueryData(['project', projectId], project)
      queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
  })
}

"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api-client"
import { useToast } from "@/hooks/use-toast"
import type {
  ClientProjectFilters,
  UpdateClientProjectInput,
} from "@/lib/validations/client-project"

export interface ClientProjectInviteSummary {
  id: string
  email: string
  clientName: string | null
  createdAt: string
  completedAt: string | null
  user: {
    id: string
    email: string | null
    name: string | null
  } | null
}

export interface ClientProject {
  id: number
  name: string
  description: string | null
  status: "ACTIVE" | "INACTIVE" | "ARCHIVED"
  googleDriveFolderId: string | null
  googleDriveFolderName: string | null
  googleDriveImagesFolderId: string | null
  googleDriveImagesFolderName: string | null
  googleDriveVideosFolderId: string | null
  googleDriveVideosFolderName: string | null
  instagramAccountId: string | null
  instagramUsername: string | null
  zapierWebhookUrl: string | null
  createdAt: string
  updatedAt: string
  clientInvite: ClientProjectInviteSummary | null
}

function buildProjectFilters(filters?: ClientProjectFilters) {
  const params = new URLSearchParams()
  if (filters?.status) {
    params.set("status", filters.status)
  }
  if (filters?.clientEmail) {
    params.set("clientEmail", filters.clientEmail)
  }
  const query = params.toString()
  return query ? `?${query}` : ""
}

export function useClientProjects(filters?: ClientProjectFilters) {
  return useQuery({
    queryKey: ["admin", "client-projects", filters],
    queryFn: () =>
      api.get<ClientProject[]>(
        `/api/admin/client-projects${buildProjectFilters(filters)}`
      ),
    staleTime: 30_000,
  })
}

export function useClientProject(projectId: number | string | null) {
  return useQuery({
    queryKey: ["admin", "client-projects", projectId],
    queryFn: () => api.get<ClientProject>(`/api/admin/client-projects/${projectId}`),
    enabled: Boolean(projectId),
    staleTime: 30_000,
  })
}

export function useUpdateClientProject() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: ({
      projectId,
      data,
    }: {
      projectId: number
      data: UpdateClientProjectInput
    }) => api.patch<ClientProject>(`/api/admin/client-projects/${projectId}`, data),
    onSuccess: (project) => {
      toast({
        title: "Projeto atualizado",
        description: `${project.name} atualizado com sucesso`,
      })
      queryClient.invalidateQueries({ queryKey: ["admin", "client-projects"] })
      queryClient.invalidateQueries({
        queryKey: ["admin", "client-projects", project.id],
      })
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao atualizar projeto",
        description: error.message,
        variant: "destructive",
      })
    },
  })
}

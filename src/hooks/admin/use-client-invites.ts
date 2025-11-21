"use client"

import { useMemo } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api-client"
import { useToast } from "@/hooks/use-toast"
import type {
  ClientInviteFilters,
  ClientInviteStatus,
  CreateClientInviteInput,
  UpdateClientInviteInput,
} from "@/lib/validations/client-invite"

export interface ClientInviteSummaryUser {
  id: string
  name: string | null
  email: string | null
}

export interface ClientInviteSummaryProject {
  id: number
  name: string
}

export interface ClientInvite {
  id: string
  email: string
  clientName: string | null
  projectName: string
  projectDescription: string | null
  googleDriveFolderId: string | null
  googleDriveFolderName: string | null
  googleDriveImagesFolderId: string | null
  googleDriveImagesFolderName: string | null
  googleDriveVideosFolderId: string | null
  googleDriveVideosFolderName: string | null
  instagramAccountId: string | null
  instagramUsername: string | null
  zapierWebhookUrl: string | null
  clerkInvitationId: string | null
  inviteUrl: string | null
  status: ClientInviteStatus
  invitedBy: string
  invitedByName: string | null
  createdAt: string
  updatedAt: string
  acceptedAt: string | null
  completedAt: string | null
  cancelledAt: string | null
  expiresAt: string | null
  user: ClientInviteSummaryUser | null
  project: ClientInviteSummaryProject | null
}

function buildFilters(filters?: ClientInviteFilters) {
  const params = new URLSearchParams()
  if (filters?.status) {
    params.set("status", filters.status)
  }
  if (filters?.email) {
    params.set("email", filters.email)
  }
  const query = params.toString()
  return query ? `?${query}` : ""
}

export function useClientInvites(filters?: ClientInviteFilters) {
  return useQuery({
    queryKey: ["admin", "client-invites", filters],
    queryFn: () =>
      api.get<ClientInvite[]>(`/api/admin/clients${buildFilters(filters)}`),
    staleTime: 30_000,
  })
}

export function useClientInvite(inviteId: string | null) {
  return useQuery({
    queryKey: ["admin", "client-invites", inviteId],
    queryFn: () => api.get<ClientInvite>(`/api/admin/clients/${inviteId}`),
    enabled: Boolean(inviteId),
    staleTime: 30_000,
  })
}

export function useClientInviteStats(filters?: ClientInviteFilters) {
  const invitesQuery = useClientInvites(filters)

  const stats = useMemo(() => {
    const invites = invitesQuery.data ?? []
    return {
      total: invites.length,
      pending: invites.filter((invite) => invite.status === "PENDING").length,
      accepted: invites.filter((invite) => invite.status === "ACCEPTED").length,
      completed: invites.filter((invite) => invite.status === "COMPLETED").length,
      cancelled: invites.filter((invite) => invite.status === "CANCELLED").length,
      expired: invites.filter((invite) => invite.status === "EXPIRED").length,
    }
  }, [invitesQuery.data])

  return { ...invitesQuery, stats }
}

export function useCreateClientInvite() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: (data: CreateClientInviteInput) =>
      api.post<ClientInvite>("/api/admin/clients", data),
    onSuccess: (invite) => {
      toast({
        title: "Convite criado",
        description: `Convite enviado para ${invite.email}`,
      })
      queryClient.invalidateQueries({ queryKey: ["admin", "client-invites"] })
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao criar convite",
        description: error.message,
        variant: "destructive",
      })
    },
  })
}

export function useUpdateClientInvite() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: ({ inviteId, data }: { inviteId: string; data: UpdateClientInviteInput }) =>
      api.patch<ClientInvite>(`/api/admin/clients/${inviteId}`, data),
    onSuccess: (invite) => {
      toast({
        title: "Convite atualizado",
        description: invite.projectName,
      })
      queryClient.invalidateQueries({ queryKey: ["admin", "client-invites"] })
      queryClient.invalidateQueries({ queryKey: ["admin", "client-invites", invite.id] })
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao atualizar convite",
        description: error.message,
        variant: "destructive",
      })
    },
  })
}

export function useResendClientInvite() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: (inviteId: string) =>
      api.post(`/api/admin/clients/${inviteId}/resend`),
    onSuccess: (_, inviteId) => {
      toast({
        title: "Convite reenviado",
        description: "O cliente receberá um novo email de convite",
      })
      queryClient.invalidateQueries({ queryKey: ["admin", "client-invites"] })
      queryClient.invalidateQueries({ queryKey: ["admin", "client-invites", inviteId] })
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao reenviar convite",
        description: error.message,
        variant: "destructive",
      })
    },
  })
}

export function useCancelClientInvite() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: (inviteId: string) =>
      api.post(`/api/admin/clients/${inviteId}/cancel`),
    onSuccess: (_, inviteId) => {
      toast({
        title: "Convite cancelado",
        description: "O cliente não poderá mais usar este link",
      })
      queryClient.invalidateQueries({ queryKey: ["admin", "client-invites"] })
      queryClient.invalidateQueries({ queryKey: ["admin", "client-invites", inviteId] })
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao cancelar convite",
        description: error.message,
        variant: "destructive",
      })
    },
  })
}
